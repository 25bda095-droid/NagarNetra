"use client";

// My reports (any device after Google sign-in), leaderboard opt-in, delete my account.
import { useEffect, useState } from "react";
import Link from "next/link";
import SignInButton from "@/components/SignInButton";
import { api } from "@/components/report/ReportFlow";
import { SeverityBadge, StatusLabel } from "@/components/ui";

type R = { tracking_code: string; status: string; category: string | null; ai_summary: string | null; evidence_score: number | null; submitted_at: string; incidents: { status: string; severity_band: string } | null };
type P = { nickname: string; leaderboard_opt_in: boolean; is_moderator: boolean };

export default function Me() {
  const [reports, setReports] = useState<R[] | null>(null);
  const [profile, setProfile] = useState<P | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me/reports").then(async (r) => (r.status === 401 ? setSignedOut(true) : setReports((await r.json()).reports)));
    fetch("/api/me/profile").then(async (r) => r.ok && setProfile(await r.json()));
  }, []);

  async function save(p: Partial<P>) {
    try {
      await api("/api/me/profile", p);
      setProfile((old) => old && { ...old, ...p });
      setMsg("Saved.");
    } catch (e) { setMsg((e as Error).message); }
  }

  async function del() {
    if (!confirm("Delete your account? Your voice notes and transcripts are deleted and your reports are unlinked from you. Incidents stay public and anonymous.")) return;
    const r = await fetch("/api/me", { method: "DELETE" });
    if (r.ok) location.href = "/"; else setMsg("Delete failed. Please try again.");
  }

  if (signedOut) return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-10">
      <div className="card flex flex-col items-center gap-4 text-center">
        <h1 className="text-xl font-semibold">Your reports, on any device</h1>
        <p className="text-sm text-muted">Sign in to see everything you reported and its progress. Have a tracking code? Use <Link href="/track" className="text-brand underline">Track</Link> instead.</p>
        <SignInButton next="/me" />
      </div>
    </main>
  );
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 text-sm">
      <h1 className="text-2xl font-semibold">My reports</h1>
      {profile?.is_moderator && <Link href="/moderate" className="btn-primary w-fit">Open moderator console →</Link>}
      {reports == null ? <div className="card h-32 animate-pulse" /> : reports.length === 0 ? <div className="card flex flex-col items-start gap-3"><p className="text-muted">No reports yet.</p><Link href="/report" className="btn-primary">Report your first issue</Link></div> : (
        <ul className="flex flex-col gap-2">
          {reports.map((r) => (
            <li key={r.tracking_code}>
              <Link href={`/track/${r.tracking_code}`} className="card flex flex-col gap-1.5 transition hover:border-brand">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-semibold">{r.tracking_code}</span>
                  <span className="capitalize">{r.category?.replace(/_/g, " ") ?? "pending"}</span>
                  <SeverityBadge band={r.incidents?.severity_band} />
                  {r.incidents ? <StatusLabel status={r.incidents.status} /> : <span className="chip">{r.status.replace(/_/g, " ")}</span>}
                </div>
                <p className="text-muted">{r.ai_summary}</p>
                <p className="text-xs text-muted">{new Date(r.submitted_at).toLocaleString()} · evidence {r.evidence_score ?? "…"}/100</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {profile && (
        <section className="card flex flex-col gap-3">
          <h2 className="font-semibold">Public leaderboard</h2>
          <label className="flex items-center gap-2"><input type="checkbox" checked={profile.leaderboard_opt_in} onChange={(e) => save({ leaderboard_opt_in: e.target.checked })} /> Show me on the citizen leaderboard as a nickname (never your name or email)</label>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); save({ nickname: String(new FormData(e.currentTarget).get("n")) }); }}>
            <input name="n" defaultValue={profile.nickname} className="input" />
            <button className="btn-ghost shrink-0">Save</button>
          </form>
        </section>
      )}
      {msg && <p>{msg}</p>}
      <div className="flex gap-3">
        <form action="/auth/signout" method="post"><button className="btn-ghost">Sign out</button></form>
        <button onClick={del} className="btn border-danger/40 text-danger">Delete my account</button>
      </div>
    </main>
  );
}
