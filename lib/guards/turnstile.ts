// Cloudflare Turnstile check on submit. Skipped when TURNSTILE_SECRET_KEY isn't set (local dev).
import "server-only";
import { HttpError } from "@/lib/http";

export async function verifyTurnstile(token: string | null | undefined, ip: string) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return;
  if (!token) throw new HttpError(400, "captcha_required", "Please complete the check.");
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    signal: AbortSignal.timeout(8000),
  }).then((r) => r.json()).catch(() => ({ success: false }));
  if (!r.success) throw new HttpError(403, "captcha_failed", "The check failed. Please try again.");
}
