// POST /api/incidents/:id/verify { after_photo_path, lat, lon, accuracy_m }
// A live after-photo taken at the spot: same place + fixed -> resolved_verified, otherwise reopened.
import { z } from "zod";
import { requireUser } from "@/lib/guards/auth";
import { clientIp, enforceRateLimits } from "@/lib/guards/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorResponse, HttpError } from "@/lib/http";
import { compareFix } from "@/lib/ai/verify";
import { prepareImageForAi } from "@/lib/media/image";
import { ownsPath } from "@/lib/media/uploads";

export const maxDuration = 60;
// phone GPS drifts 10-50 m (more near buildings), on both the report and the after-photo
const MAX_DISTANCE_M = 75;
const MAX_ACCURACY_SLACK_M = 75; // plus the after-photo's own GPS error, so at most 150 m
const Body = z.object({ after_photo_path: z.string().max(200), lat: z.number(), lon: z.number(), accuracy_m: z.number().min(0).max(5000) });

export async function POST(request: Request, { params }: RouteContext<"/api/incidents/[id]/verify">) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const b = Body.safeParse(await request.json().catch(() => null));
    if (!b.success) throw new HttpError(400, "bad_request", "Invalid request.");
    if (!ownsPath(user.userId, "after_photo", b.data.after_photo_path)) throw new HttpError(403, "forbidden", "Not your photo.");
    await enforceRateLimits([{ key: `verify:user:${user.userId}`, windowSeconds: 3600, max: 5 }, { key: `verify:ip:${await clientIp()}`, windowSeconds: 3600, max: 10 }]);

    const db = createAdminClient();
    const { data: inc } = await db.from("public_incidents").select("lat, lon, status, cover_photo_path, summary, category_label").eq("id", id).single();
    if (!inc) throw new HttpError(404, "not_found", "Incident not found.");
    if (inc.status === "resolved_verified") throw new HttpError(409, "already_verified", "Already verified as fixed.");
    if (!inc.cover_photo_path) throw new HttpError(422, "no_before_photo", "This incident has no photo to compare with.");

    const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b.data.lat - inc.lat), dLon = toRad(b.data.lon - inc.lon);
    const distance_m = 2 * R * Math.asin(Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos(toRad(inc.lat)) * Math.cos(toRad(b.data.lat)) * Math.sin(dLon / 2) ** 2));
    // the fix must be photographed where the problem was reported
    const allowed = Math.round(MAX_DISTANCE_M + Math.min(b.data.accuracy_m, MAX_ACCURACY_SLACK_M));
    if (distance_m > allowed) {
      throw new HttpError(422, "too_far", `You are ${Math.round(distance_m)} m from the reported spot. Go to the problem's location (within ${allowed} m) and take the photo there.`);
    }

    // the bucket is named "public", which clashes with the storage download path, so read it via its public URL
    const beforeUrl = db.storage.from("public").getPublicUrl(inc.cover_photo_path).data.publicUrl;
    const [beforeRes, after] = await Promise.all([fetch(beforeUrl, { signal: AbortSignal.timeout(10000) }), db.storage.from("raw").download(b.data.after_photo_path)]);
    if (!beforeRes.ok) throw new HttpError(404, "before_missing", "The original photo couldn't be loaded. Please try again.");
    if (!after.data) throw new HttpError(404, "upload_missing", "Your photo didn't upload. Please try again.");
    const before = { data: new Blob([await beforeRes.arrayBuffer()]) };
    let verdict: { same_place: boolean; fixed: boolean; reason: string; model: string | null };
    try {
      verdict = await compareFix(`${inc.category_label}: ${inc.summary ?? ""}`, Buffer.from(await before.data.arrayBuffer()), (await prepareImageForAi(Buffer.from(await after.data.arrayBuffer()))).data);
    } catch {
      // quota or outage: don't reopen the incident on an AI failure, just ask to retry
      throw new HttpError(503, "ai_busy", "Our AI is busy right now (daily limit reached or service down). Please try verifying again later.");
    }
    if (verdict.model) await db.rpc("record_ai_call", { p_provider: "gemini", p_model: verdict.model });
    // GPS already proves the photo was taken at the spot; the AI mainly judges whether the problem is gone
    const passed = verdict.fixed && (verdict.same_place || distance_m <= 40);

    await db.from("verifications").insert({ incident_id: id, user_id: user.userId, after_photo_path: b.data.after_photo_path, distance_m, after_point: `SRID=4326;POINT(${b.data.lon} ${b.data.lat})`, accuracy_m: b.data.accuracy_m, ai_verdict: verdict, passed });
    const status = passed ? "resolved_verified" : "reopened";
    await db.from("incidents").update({ status, ...(passed ? { resolved_at: new Date().toISOString() } : {}) }).eq("id", id);
    await db.from("events").insert({ incident_id: id, type: status, payload: { reason: verdict.reason, distance_m: Math.round(distance_m), fixed: verdict.fixed, same_place: verdict.same_place }, actor_role: "ai" });
    return Response.json({ passed, status, reason: verdict.reason, distance_m: Math.round(distance_m) });
  } catch (err) {
    return errorResponse(err);
  }
}
