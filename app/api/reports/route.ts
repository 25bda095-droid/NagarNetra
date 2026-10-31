// POST /api/reports: creates the report and tracking code immediately, then runs the pipeline in after().
import { after } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/guards/auth";
import { clientIp, enforceRateLimits } from "@/lib/guards/rate-limit";
import { verifyTurnstile } from "@/lib/guards/turnstile";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorResponse, HttpError } from "@/lib/http";
import { runPipeline } from "@/lib/pipeline/run";
import { CATEGORIES } from "@/lib/ai/schema";

export const maxDuration = 60;

const Body = z.object({
  analysis_id: z.uuid().nullish(),
  idempotency_key: z.string().min(8).max(64),
  mode: z.enum(["live", "assisted"]),
  device: z.enum(["phone", "laptop", "tablet", "unknown"]).default("unknown"),
  lat: z.number().min(5).max(38),
  lon: z.number().min(67).max(98),
  accuracy_m: z.number().min(0).max(100000).nullish(),
  pin: z.object({ lat: z.number().min(5).max(38), lon: z.number().min(67).max(98) }).nullish(),
  captured_at: z.iso.datetime().nullish(),
  category: z.enum(CATEGORIES).nullish(), // citizen's pick when AI is unsure or pending
  note: z.string().trim().max(500).nullish(),
  turnstile_token: z.string().max(2048).nullish(),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "bad_request", parsed.error.issues[0]?.message ?? "Invalid request.");
    const b = parsed.data;
    const db = createAdminClient();

    // a retried submit returns the first report instead of creating another
    const { data: existing } = await db.from("reports").select("id, tracking_code, user_id").eq("idempotency_key", b.idempotency_key).maybeSingle();
    if (existing) {
      if (existing.user_id !== user.userId) throw new HttpError(409, "conflict", "Please try again.");
      return Response.json({ id: existing.id, tracking_code: existing.tracking_code });
    }

    const ip = await clientIp();
    await verifyTurnstile(b.turnstile_token, ip);
    // the shared tester account is used by many people, so it's limited per network instead of per user
    await enforceRateLimits([
      ...(user.isTester
        ? [{ key: `report:tester:day`, windowSeconds: 86400, max: 200 }]
        : [
            { key: `report:user:${user.userId}`, windowSeconds: 3600, max: 5 },
            { key: `report:user:day:${user.userId}`, windowSeconds: 86400, max: 20 },
          ]),
      { key: `report:ip:${ip}`, windowSeconds: 3600, max: 10 },
    ]);

    let analysis: { record: { summary_en?: string; category?: string | null } | null; status: string } | null = null;
    if (b.analysis_id) {
      const { data } = await db.from("analyses").select("user_id, record, status").eq("id", b.analysis_id).single();
      if (!data || data.user_id !== user.userId) throw new HttpError(403, "forbidden", "Not your analysis.");
      if (data.status === "not_civic" || data.status === "poor_quality") throw new HttpError(422, data.status, "This photo can't be reported. Please retake it or use assisted mode.");
      analysis = data;
    } else if (b.mode === "live") {
      throw new HttpError(400, "bad_request", "A live report needs a checked photo.");
    }
    if (!analysis?.record?.category && !b.category) throw new HttpError(400, "category_required", "Please choose what kind of problem this is.");

    const point = b.pin ?? { lat: b.lat, lon: b.lon };
    const { data: report, error } = await db.from("reports").insert({
      user_id: user.userId,
      analysis_id: b.analysis_id ?? null,
      idempotency_key: b.idempotency_key,
      mode: b.mode,
      device: b.device,
      category: b.category ?? analysis?.record?.category ?? null,
      ai_summary: analysis?.status === "ok" ? analysis.record?.summary_en : b.note ?? null,
      device_point: `SRID=4326;POINT(${b.lon} ${b.lat})`,
      corrected_point: b.pin ? `SRID=4326;POINT(${b.pin.lon} ${b.pin.lat})` : null,
      accuracy_m: b.accuracy_m ?? null,
      location_source: b.pin ? "manual_pin" : "gps",
      captured_at: b.captured_at ?? null,
    }).select("id, tracking_code").single();
    if (error) {
      if (error.code === "23505") throw new HttpError(409, "duplicate", "This report was already submitted.");
      throw new Error(`insert report: ${error.message}`);
    }

    after(() => runPipeline(db, report.id, point.lat, point.lon));
    return Response.json({ id: report.id, tracking_code: report.tracking_code }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
