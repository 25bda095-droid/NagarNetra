// GET /api/incidents: public incidents for the map (no reporter data; hidden ones excluded by RLS).
import { createClient } from "@/lib/supabase/server";
import { errorResponse } from "@/lib/http";

export async function GET() {
  try {
    const db = await createClient();
    const { data, error } = await db.from("public_incidents").select("id, category_label, summary, lat, lon, status, severity_band").order("created_at", { ascending: false }).limit(1000);
    if (error) throw new Error(error.message);
    return Response.json({ incidents: data });
  } catch (err) {
    return errorResponse(err);
  }
}
