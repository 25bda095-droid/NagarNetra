// GET /api/track/NN-XXXXXX: public status of one report (no login). Never returns reporter details.
import { createAdminClient } from "@/lib/supabase/admin";
import { errorResponse, HttpError } from "@/lib/http";

export async function GET(_req: Request, { params }: RouteContext<"/api/track/[code]">) {
  try {
    const code = (await params).code.toUpperCase();
    if (!/^NN-[2-9A-Z]{6}$/.test(code)) throw new HttpError(400, "bad_code", "That tracking code doesn't look right.");
    const db = createAdminClient();
    const { data: r } = await db.from("reports").select("id, incident_id, status, mode, category, evidence_score, evidence_factors, submitted_at, photo_path").eq("tracking_code", code).maybeSingle();
    if (!r) throw new HttpError(404, "not_found", "No report with that code.");
    const [{ data: steps }, inc, events] = await Promise.all([
      db.from("pipeline_steps").select("step, status, output, sources, ms, confidence, error, at").eq("report_id", r.id).order("at"),
      r.incident_id ? db.from("public_incidents").select("*").eq("id", r.incident_id).single() : Promise.resolve({ data: null }),
      r.incident_id ? db.from("events").select("type, payload, actor_role, at").eq("incident_id", r.incident_id).order("at") : Promise.resolve({ data: [] }),
    ]);
    // the evidence hash and exact device position are not public
    const trace = (steps ?? []).map((s) => (s.step === "evidence" ? { ...s, output: { reused: s.output?.reused, blurred: s.output?.blurred } } : s));
    const { id: _, ...report } = r; // eslint-disable-line @typescript-eslint/no-unused-vars
    return Response.json({ code, report, trace, incident: inc.data, events: events.data ?? [] });
  } catch (err) {
    return errorResponse(err);
  }
}
