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
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 py-6 sm:py-10">
      <div>
        <h1 className="text-2xl font-semibold">Report an issue</h1>
        <p className="text-sm text-muted">4 quick steps · about a minute</p>
      </div>
      <Suspense fallback={<div className="card h-40 animate-pulse" />}>
        <Gate />
      </Suspense>
    </main>
  );
}

async function Gate() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="card flex flex-col items-center gap-4 text-center">
        <h2 className="text-lg font-semibold">Sign in to report</h2>
        <p className="text-sm text-muted">Your reports stay linked to your account, so you can track them on any device. Viewing the map, stats and tracking pages needs no login.</p>
        <SignInButton next="/report" />
      </div>
    );
  }
  const { data: profile } = await (await createClient()).from("profiles").select("consent_at").eq("user_id", user.userId).maybeSingle();
  return profile?.consent_at ? <ReportFlow /> : <Consent />;
}
