// GET    /api/me -> who am I (nickname, leaderboard opt-in, moderator flag)
// DELETE /api/me -> delete my account: raw photos/voice notes and transcripts are removed,
//                   reports are unlinked from me; incidents stay public and anonymous.
import { requireUser } from "@/lib/guards/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { errorResponse } from "@/lib/http";

export async function GET() {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("nickname, leaderboard_opt_in, consent_at")
      .eq("user_id", user.userId)
      .single();

    return Response.json({ userId: user.userId, isModerator: user.isModerator, profile });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE() {
  try {
    const user = await requireUser();
    const admin = createAdminClient();

    // Raw uploads are stored under raw/<userId>/... so they can be removed together.
    const { data: files } = await admin.storage.from("raw").list(user.userId, { limit: 1000 });
    if (files?.length) {
      await admin.storage.from("raw").remove(files.map((f) => `${user.userId}/${f.name}`));
    }

    // Database cascades: profile + analyses deleted, reports/verifications unlinked (see migrations).
    const { error } = await admin.auth.admin.deleteUser(user.userId);
    if (error) throw error;

    const supabase = await createClient();
    await supabase.auth.signOut();
    return Response.json({ deleted: true });
  } catch (err) {
    return errorResponse(err);
  }
}
