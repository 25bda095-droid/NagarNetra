// GET /api/leaderboard: local bodies and authorities by verified fix rate (min 3 incidents), opt-in citizens.
import { createAdminClient } from "@/lib/supabase/admin";
import { errorResponse } from "@/lib/http";

export async function GET() {
  try {
    const db = createAdminClient();
    const [places, authorities, citizens] = await Promise.all([
      db.from("place_leaderboard").select("*").order("verified_fix_rate", { ascending: false }).limit(50),
      db.from("authority_leaderboard").select("*").order("verified_fix_rate", { ascending: false }).limit(50),
      db.rpc("citizen_leaderboard", { p_limit: 20 }),
    ]);
    return Response.json({ places: places.data ?? [], authorities: authorities.data ?? [], citizens: citizens.data ?? [] });
  } catch (err) {
    return errorResponse(err);
  }
}
