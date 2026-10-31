// GET /api/incidents/:id: one public incident with its timeline.
import { createClient } from "@/lib/supabase/server";
import { errorResponse, HttpError } from "@/lib/http";

export async function GET(_req: Request, { params }: RouteContext<"/api/incidents/[id]">) {
  try {
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(400, "bad_request", "Invalid id.");
    const db = await createClient();
    const [{ data: incident }, { data: events }] = await Promise.all([
      db.from("public_incidents").select("*").eq("id", id).maybeSingle(),
      db.from("events").select("type, payload, actor_role, at").eq("incident_id", id).order("at"),
    ]);
    if (!incident) throw new HttpError(404, "not_found", "Incident not found.");
    return Response.json({ code: null, report: null, trace: [], incident, events: events ?? [] });
  } catch (err) {
    return errorResponse(err);
  }
}
