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
      <div className="max-w-sm rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm">
        <p>
          Google sign-in doesn&apos;t work inside {inApp}. Open this page in Chrome or Safari to report.
        </p>
        <button
          className="btn-ghost mt-3"
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
    <div className="flex flex-col items-center gap-3">
      <button
        onClick={signIn}
        disabled={loading}
        className="btn-primary w-full max-w-xs"
      >
        {loading ? "Opening Google..." : "Continue with Google"}
      </button>
      <DemoSignIn next={next} />
    </div>
  );
}

// "Try as a tester" (shared citizen account) and "Judge access" (moderator, needs the code).
function DemoSignIn({ next }: { next: string }) {
  const [code, setCode] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function go(as: "tester" | "judge") {
    setMsg("Signing in...");
    const r = await fetch("/auth/demo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ as, code }) });
    if (r.ok) window.location.href = next;
    else setMsg((await r.json().catch(() => ({}))).message ?? "Sign-in failed.");
  }

  return (
    <div className="flex flex-col items-center gap-2 text-sm">
      <div className="flex w-full max-w-xs items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
      <button onClick={() => go("tester")} className="btn-ghost w-full max-w-xs">Try as a tester (no Google needed)</button>
      {showCode ? (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); go("judge"); }}>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Judge access code" className="input font-mono" />
          <button className="btn-ghost">Enter</button>
        </form>
      ) : (
        <button onClick={() => setShowCode(true)} className="text-xs text-muted underline">Judge access</button>
      )}
      {msg && <p className="text-xs">{msg}</p>}
    </div>
  );
}
