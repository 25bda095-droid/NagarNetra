// Guards for API routes. Every route that writes data starts with requireUser() or requireModerator().
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { HttpError } from "@/lib/http";

export type CurrentUser = {
  userId: string;
  provider: string | null;
  isModerator: boolean;
};

// Reads and verifies the session from cookies. Returns null when signed out.
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;

  const appMeta = (data.claims.app_metadata ?? {}) as { provider?: string; role?: string };
  return {
    userId: data.claims.sub,
    provider: appMeta.provider ?? null,
    isModerator: appMeta.role === "moderator",
  };
}

// Reporting needs a Google account (or a moderator/judge account created in the dashboard).
// Email sign-ups made directly against the API are signed in but cannot report.
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "not_signed_in", "Please sign in with Google to continue.");
  if (user.provider !== "google" && !user.isModerator) {
    throw new HttpError(403, "google_required", "Please sign in with Google to report.");
  }
  return user;
}

export async function requireModerator(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "not_signed_in", "Please sign in.");
  if (!user.isModerator) throw new HttpError(403, "not_moderator", "Moderators only.");
  return user;
}
