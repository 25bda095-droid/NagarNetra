// POST /api/incidents/:id/status { status: forwarded | acknowledged | resolved_claimed, ticket_id? }
// Execution levels set by a citizen who reported this incident. Only an after-photo can mark it verified.
import { z } from "zod";
import { requireUser } from "@/lib/guards/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorResponse, HttpError } from "@/lib/http";

const Body = z.object({ status: z.enum(["forwarded", "acknowledged", "resolved_claimed"]), ticket_id: z.string().trim().max(60).nullish() });

export async function POST(request: Request, { params }: RouteContext<"/api/incidents/[id]/status">) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const b = Body.safeParse(await request.json().catch(() => null));
    if (!b.success) throw new HttpError(400, "bad_request", "Invalid status.");
    const db = createAdminClient();
    const { data: mine } = await db.from("reports").select("id").eq("incident_id", id).eq("user_id", user.userId).limit(1);
    if (!mine?.length && !user.isModerator) throw new HttpError(403, "forbidden", "Only reporters of this incident can update it.");
    const { error } = await db.from("incidents").update({ status: b.data.status, ...(b.data.ticket_id ? { ticket_id: b.data.ticket_id } : {}) }).eq("id", id).not("status", "eq", "resolved_verified");
    if (error) throw new Error(error.message);
    await db.from("events").insert({ incident_id: id, type: b.data.status, payload: b.data.ticket_id ? { ticket_id: b.data.ticket_id } : {}, actor_role: user.isModerator ? "moderator" : "citizen", actor_id: user.userId });
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
