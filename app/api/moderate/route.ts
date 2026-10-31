// Moderator API. GET: open review queue, unverified authorities, AI usage.
// POST { action, ... }: approve/reject/fix an authority, fix category, hide, merge, close a queue item.
// Moderators can't mark incidents verified-fixed and never see reporter identity. Every action is an event.
import { z } from "zod";
import { requireModerator } from "@/lib/guards/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorResponse, HttpError } from "@/lib/http";
import { CATEGORIES } from "@/lib/ai/schema";

export async function GET() {
  try {
    await requireModerator();
    const db = createAdminClient();
    const [queue, authorities, usage] = await Promise.all([
      db.from("review_queue").select("id, ref_type, ref_id, reason, priority, created_at").is("decision", null).order("priority").order("created_at").limit(100),
      db.from("authorities").select("id, name, agency_type, level, scope_level, scope_lgd_code, portal_url, source_urls, found_by, confidence, verification_status").eq("verification_status", "ai_found").order("created_at", { ascending: false }).limit(100),
      db.from("ai_usage").select("*").order("day", { ascending: false }).limit(14),
    ]);
    const ids = (queue.data ?? []).filter((q) => q.ref_type === "incident").map((q) => q.ref_id);
    const { data: incidents } = ids.length ? await db.from("public_incidents").select("id, category, summary, severity_band, routing_status, routing_reason, authority_name, cover_photo_path, admin_chain").in("id", ids) : { data: [] };
    return Response.json({ queue: queue.data ?? [], incidents: incidents ?? [], authorities: authorities.data ?? [], ai_usage: usage.data ?? [] });
  } catch (err) {
    return errorResponse(err);
  }
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("authority"), id: z.uuid(), decision: z.enum(["approve", "reject"]), name: z.string().max(200).optional(), portal_url: z.url().optional(), helpline: z.string().max(40).optional() }),
  z.object({ action: z.literal("category"), id: z.uuid(), category: z.enum(CATEGORIES) }),
  z.object({ action: z.literal("hide"), id: z.uuid(), hidden: z.boolean() }),
  z.object({ action: z.literal("merge"), id: z.uuid(), into: z.uuid() }),
  z.object({ action: z.literal("queue"), id: z.number().int(), decision: z.enum(["approved", "corrected", "rejected", "hidden"]) }),
]);

export async function POST(request: Request) {
  try {
    const mod = await requireModerator();
    const p = Body.safeParse(await request.json().catch(() => null));
    if (!p.success) throw new HttpError(400, "bad_request", p.error.issues[0]?.message ?? "Invalid request.");
    const b = p.data;
    const db = createAdminClient();
    const event = (incident_id: string, type: string, payload: object) => db.from("events").insert({ incident_id, type, payload, actor_role: "moderator", actor_id: mod.userId });

    if (b.action === "authority") {
      const { name, portal_url, helpline } = b;
      await db.from("authorities").update({
        verification_status: b.decision === "approve" ? "human_verified" : "rejected",
        verified_at: new Date().toISOString(), verified_by: mod.userId,
        ...(name ? { name } : {}), ...(portal_url ? { portal_url } : {}), ...(helpline ? { helpline } : {}),
      }).eq("id", b.id);
    } else if (b.action === "category") {
      await db.from("incidents").update({ category: b.category }).eq("id", b.id);
      await event(b.id, "category_fixed", { category: b.category });
    } else if (b.action === "hide") {
      await db.from("incidents").update({ hidden: b.hidden }).eq("id", b.id);
      await event(b.id, b.hidden ? "hidden" : "unhidden", {});
    } else if (b.action === "merge") {
      if (b.id === b.into) throw new HttpError(400, "bad_request", "Can't merge into itself.");
      const { data: moved } = await db.from("reports").update({ incident_id: b.into }).eq("incident_id", b.id).select("user_id");
      const { data: all } = await db.from("reports").select("user_id").eq("incident_id", b.into);
      await db.from("incidents").update({ report_count: all?.length ?? 0, independent_reporters: new Set((all ?? []).map((r) => r.user_id).filter(Boolean)).size }).eq("id", b.into);
      await db.from("incidents").update({ hidden: true }).eq("id", b.id);
      await event(b.into, "merged", { from: b.id, reports: moved?.length ?? 0 });
    } else {
      await db.from("review_queue").update({ decision: b.decision, decided_by: mod.userId, decided_at: new Date().toISOString() }).eq("id", b.id);
    }
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
