// Report an issue. Sign-in comes first, before the camera opens, so no captured photo is lost
// in the Google redirect.
import { Suspense } from "react";
import SignInButton from "@/components/SignInButton";
import ReportFlow from "@/components/report/ReportFlow";
import Consent from "@/components/report/Consent";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/guards/auth";

export default function ReportPage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 py-8">
      <h1 className="text-2xl font-semibold">Report an issue</h1>
      <Suspense fallback={<p className="text-sm opacity-60">Checking sign-in...</p>}>
        <Gate />
      </Suspense>
    </main>
  );
}

async function Gate() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="opacity-80">Sign in with Google to report. Viewing the map needs no login.</p>
        <SignInButton next="/report" />
      </div>
    );
  }
  const { data: profile } = await (await createClient()).from("profiles").select("consent_at").eq("user_id", user.userId).maybeSingle();
  return profile?.consent_at ? <ReportFlow /> : <Consent />;
}
