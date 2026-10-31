// GET /api/me/reports: the signed-in citizen's reports, on any device.
import { requireUser } from "@/lib/guards/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorResponse } from "@/lib/http";

export async function GET() {
  try {
    const user = await requireUser();
    const { data } = await createAdminClient()
      .from("reports")
      .select("tracking_code, status, category, ai_summary, evidence_score, submitted_at, incident_id, incidents(status, severity_band, routing_status)")
      .eq("user_id", user.userId)
      .order("submitted_at", { ascending: false })
      .limit(100);
    return Response.json({ reports: data ?? [] });
  } catch (err) {
    return errorResponse(err);
  }
}
