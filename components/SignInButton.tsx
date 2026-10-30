"use client";

// "Continue with Google" button. Inside Instagram/Facebook-style in-app browsers Google blocks
// sign-in, so we show "open in your browser" with a copy-link button instead.
import { useState, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { detectInAppBrowser } from "@/lib/guards/in-app-browser";

const noopSubscribe = () => () => {};

export default function SignInButton({ next = "/" }: { next?: string }) {
  // userAgent only exists in the browser; on the server we assume a normal browser
  const inApp = useSyncExternalStore(
    noopSubscribe,
    () => detectInAppBrowser(navigator.userAgent),
    () => null,
  );
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setLoading(true);
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (error) {
      setLoading(false);
      alert("Could not start Google sign-in. Please try again.");
    }
  }

  if (inApp) {
    return (
      <div className="max-w-sm rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 text-sm">
        <p>
          Google sign-in doesn&apos;t work inside {inApp}. Open this page in Chrome or Safari to report.
        </p>
        <button
          className="mt-3 rounded-md border px-3 py-1.5"
          onClick={async () => {
            await navigator.clipboard.writeText(window.location.href);
            setCopied(true);
          }}
        >
          {copied ? "Link copied" : "Copy link"}
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={signIn}
      disabled={loading}
      className="rounded-md bg-foreground px-4 py-2 text-background disabled:opacity-60"
    >
      {loading ? "Opening Google..." : "Continue with Google"}
    </button>
  );
}
