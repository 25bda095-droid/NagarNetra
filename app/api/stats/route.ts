// GET /api/stats: public numbers, all live SQL over real reports.
import { createAdminClient } from "@/lib/supabase/admin";
import { errorResponse } from "@/lib/http";

export async function GET() {
  try {
    const db = createAdminClient();
    const [totals, byCategory, byState] = await Promise.all([
      db.from("public_stats").select("*").single(),
      db.from("stats_by_category").select("*").order("incidents", { ascending: false }),
      db.from("stats_by_state").select("*").order("incidents", { ascending: false }),
    ]);
    return Response.json({ totals: totals.data, by_category: byCategory.data ?? [], by_state: byState.data ?? [] });
  } catch (err) {
    return errorResponse(err);
  }
}
