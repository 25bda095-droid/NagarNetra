// GET/POST /api/me/profile: nickname, leaderboard opt-in, consent.
import { z } from "zod";
import { requireUser } from "@/lib/guards/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorResponse, HttpError } from "@/lib/http";

export async function GET() {
  try {
    const user = await requireUser();
    const { data } = await createAdminClient().from("profiles").select("nickname, leaderboard_opt_in, consent_at").eq("user_id", user.userId).single();
    return Response.json({ ...data, is_moderator: user.isModerator });
  } catch (err) {
    return errorResponse(err);
  }
}

const Body = z.object({
  nickname: z.string().trim().min(3).max(24).regex(/^[\p{L}\p{N} _#.-]+$/u).optional(),
  leaderboard_opt_in: z.boolean().optional(),
  consent: z.literal(true).optional(),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const b = Body.safeParse(await request.json().catch(() => null));
    if (!b.success) throw new HttpError(400, "bad_request", "Nickname: 3-24 letters, numbers or spaces.");
    const { consent, ...rest } = b.data;
    const { error } = await createAdminClient().from("profiles").update({ ...rest, ...(consent ? { consent_at: new Date().toISOString() } : {}) }).eq("user_id", user.userId);
    if (error) throw new Error(error.message);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
