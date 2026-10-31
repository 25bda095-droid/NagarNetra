// POST /auth/demo { as: "tester" } or { as: "judge", code }
// One-tap sign-in to shared accounts so testers and judges don't need to share an email.
// Tester = citizen powers only. Judge = moderator, and needs the access code from the submission form.
// Passwords live only in server env; nobody can sign up through this.
import { NextResponse } from "next/server";
import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { clientIp, enforceRateLimits } from "@/lib/guards/rate-limit";
import { errorResponse, HttpError } from "@/lib/http";

const Body = z.object({ as: z.enum(["tester", "judge"]), code: z.string().max(100).optional() });
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function POST(request: Request) {
  try {
    const b = Body.safeParse(await request.json().catch(() => null));
    if (!b.success) throw new HttpError(400, "bad_request", "Invalid request.");
    await enforceRateLimits([{ key: `demo-login:ip:${await clientIp()}`, windowSeconds: 3600, max: 20 }]);

    const env = b.data.as === "judge"
      ? { email: process.env.JUDGE_EMAIL, password: process.env.JUDGE_PASSWORD, code: process.env.JUDGE_ACCESS_CODE }
      : { email: process.env.TESTER_EMAIL, password: process.env.TESTER_PASSWORD, code: undefined };
    if (!env.email || !env.password) throw new HttpError(503, "not_configured", "Test sign-in isn't set up.");
    if (b.data.as === "judge" && (!env.code || !same((b.data.code ?? "").trim(), env.code))) throw new HttpError(403, "wrong_code", "Wrong access code.");

    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: env.email, password: env.password });
    if (error) throw new Error(`demo sign-in: ${error.message}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
