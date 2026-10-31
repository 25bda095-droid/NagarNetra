// GET /api/feed?view=open|solved&category=&severity=&state=&offset=
// Public list of incidents (no login): blurred photos, severity, area, status and the authority's contact,
// so anyone can push the right body to fix it. Hidden incidents are excluded by RLS.
import { createClient } from "@/lib/supabase/server";
import { errorResponse } from "@/lib/http";

const PAGE = 20;
const COLS = "id, category, category_label, summary, severity_band, severity_score, status, admin_chain, lat, lon, cover_photo_path, fixed_photo_path, created_at, resolved_at, independent_reporters, authority_name, authority_verification, authority_portal_url, authority_helpline, routing_status, ticket_id";

export async function GET(request: Request) {
  try {
    const p = new URL(request.url).searchParams;
    const solved = p.get("view") === "solved";
    const offset = Math.max(0, Number(p.get("offset")) || 0);
    const db = await createClient();
    let q = db.from("public_incidents").select(COLS, { count: "exact" });
    q = solved ? q.eq("status", "resolved_verified").order("resolved_at", { ascending: false }) : q.neq("status", "resolved_verified").order("created_at", { ascending: false });
    if (p.get("category")) q = q.eq("category", p.get("category")!);
    if (p.get("severity")) q = q.eq("severity_band", p.get("severity")!);
    if (Number(p.get("state"))) q = q.eq("state_lgd", Number(p.get("state")));
    const { data, count, error } = await q.range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    return Response.json({ items: data ?? [], total: count ?? 0, next: offset + PAGE < (count ?? 0) ? offset + PAGE : null });
  } catch (err) {
    return errorResponse(err);
  }
}
