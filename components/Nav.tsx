"use client";

// Top bar on desktop, bottom tab bar on phones (thumb reach).
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { usePathname } from "next/navigation";
import Logo from "@/components/Logo";

const LINKS = [
  { href: "/", label: "Home", icon: "M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
  { href: "/report", label: "Report", icon: "M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" },
  { href: "/track", label: "Track", icon: "M11 4a7 7 0 1 0 4.2 12.6L20 21M11 4a7 7 0 0 1 0 14" },
  { href: "/stats", label: "Stats", icon: "M5 20V10M12 20V4M19 20v-7" },
  { href: "/me", label: "Mine", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" },
];

export default function Nav() {
  const path = usePathname();
  const active = (h: string) => (h === "/" ? path === "/" : path.startsWith(h));
  // signed-in state for the account button (desktop) and the sign-out link
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, session) => setSignedIn(!!session));
    return () => data.subscription.unsubscribe();
  }, []);
  return (
    <>
      <header className="sticky top-0 z-30 border-b bg-surface/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <Logo /> NagarNetra
          </Link>
          <nav className="ml-auto hidden gap-1 sm:flex">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className={`rounded-lg px-3 py-1.5 text-sm ${active(l.href) ? "bg-brand-soft font-medium text-brand" : "text-muted hover:text-ink"}`}>
                {l.label === "Mine" ? "My reports" : l.label}
              </Link>
            ))}
          </nav>
          <Link href="/report" className="btn-primary ml-auto min-h-9 px-3 sm:ml-0">Report issue</Link>
          {signedIn === true && (
            <form action="/auth/signout" method="post" className="hidden sm:block">
              <button className="btn-ghost min-h-9 px-3">Sign out</button>
            </form>
          )}
          {signedIn === false && <Link href="/me" className="btn-ghost hidden min-h-9 px-3 sm:inline-flex">Sign in</Link>}
        </div>
      </header>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${active(l.href) ? "text-brand" : "text-muted"}`}>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={l.icon} /></svg>
            {l.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
