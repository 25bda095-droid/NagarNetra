// POST /api/incidents/:id/reroute: search for the responsible authority again (e.g. sources were busy
// the first time). Reporters of the incident or moderators; not needed once routing is verified.
import { requireUser } from "@/lib/guards/auth";
import { clientIp, enforceRateLimits } from "@/lib/guards/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorResponse, HttpError } from "@/lib/http";
import { locate } from "@/lib/discovery/locate";
import { routeIncident } from "@/lib/pipeline/route";

export const maxDuration = 60;

export async function POST(_req: Request, { params }: RouteContext<"/api/incidents/[id]/reroute">) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const db = createAdminClient();
    const { data: mine } = await db.from("reports").select("id").eq("incident_id", id).eq("user_id", user.userId).limit(1);
    if (!mine?.length && !user.isModerator) throw new HttpError(403, "forbidden", "Only reporters of this incident can do this.");
    const { data: inc } = await db.from("public_incidents").select("lat, lon, category, subtype, routing_status").eq("id", id).single();
    if (!inc) throw new HttpError(404, "not_found", "Incident not found.");
    if (inc.routing_status === "verified") throw new HttpError(409, "already_verified", "The authority is already verified.");
    await enforceRateLimits([
      { key: `reroute:incident:${id}`, windowSeconds: 600, max: 2 },
      { key: `reroute:ip:${await clientIp()}`, windowSeconds: 3600, max: 10 },
    ]);

    const place = await locate(db, inc.lat, inc.lon);
    const r = await routeIncident(db, { incidentId: id, category: inc.category, subtype: inc.subtype, place });
    return Response.json(r);
  } catch (err) {
    return errorResponse(err);
  }
}
