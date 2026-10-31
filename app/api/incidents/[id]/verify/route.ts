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
    const { data: inc } = await db.from("public_incidents").select("lat, lon, status, cover_photo_path").eq("id", id).single();
    if (!inc) throw new HttpError(404, "not_found", "Incident not found.");
    if (inc.status === "resolved_verified") throw new HttpError(409, "already_verified", "Already verified as fixed.");
    if (!inc.cover_photo_path) throw new HttpError(422, "no_before_photo", "This incident has no photo to compare with.");

    const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b.data.lat - inc.lat), dLon = toRad(b.data.lon - inc.lon);
    const distance_m = 2 * R * Math.asin(Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos(toRad(inc.lat)) * Math.cos(toRad(b.data.lat)) * Math.sin(dLon / 2) ** 2));
    const near = distance_m <= 50 + Math.min(b.data.accuracy_m, 100);

    const [before, after] = await Promise.all([db.storage.from("public").download(inc.cover_photo_path), db.storage.from("raw").download(b.data.after_photo_path)]);
    if (!before.data || !after.data) throw new HttpError(404, "upload_missing", "Photo not found. Please try again.");
    let verdict: { same_place: boolean; fixed: boolean; reason: string; model: string | null };
    try {
      verdict = near
        ? await compareFix(Buffer.from(await before.data.arrayBuffer()), (await prepareImageForAi(Buffer.from(await after.data.arrayBuffer()))).data)
        : { same_place: false, fixed: false, reason: `Taken ${Math.round(distance_m)} m away from the incident.`, model: null };
    } catch {
      // quota or outage: don't reopen the incident on an AI failure, just ask to retry
      throw new HttpError(503, "ai_busy", "Our AI is busy right now (daily limit reached or service down). Please try verifying again later.");
    }
    if (verdict.model) await db.rpc("record_ai_call", { p_provider: "gemini", p_model: verdict.model });
    const passed = near && verdict.same_place && verdict.fixed;

    await db.from("verifications").insert({ incident_id: id, user_id: user.userId, after_photo_path: b.data.after_photo_path, distance_m, ai_verdict: verdict, passed });
    const status = passed ? "resolved_verified" : "reopened";
    await db.from("incidents").update({ status, ...(passed ? { resolved_at: new Date().toISOString() } : {}) }).eq("id", id);
    await db.from("events").insert({ incident_id: id, type: status, payload: { reason: verdict.reason, distance_m: Math.round(distance_m) }, actor_role: "ai" });
    return Response.json({ passed, status, reason: verdict.reason, distance_m: Math.round(distance_m) });
  } catch (err) {
    return errorResponse(err);
  }
}
