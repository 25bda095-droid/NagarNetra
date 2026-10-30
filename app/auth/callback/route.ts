// Google sends the user back here after sign-in. We swap the one-time code for a session
// cookie and continue to the page they were going to (e.g. /report).
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/http";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
    console.error("auth callback failed:", error.message);
  }

  return NextResponse.redirect(new URL("/?auth_error=1", origin));
}
