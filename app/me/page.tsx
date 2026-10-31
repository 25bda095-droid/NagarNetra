"use client";

// My reports (any device after Google sign-in), leaderboard opt-in, delete my account.
import { useEffect, useState } from "react";
import Link from "next/link";
import SignInButton from "@/components/SignInButton";
import { api } from "@/components/report/ReportFlow";

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

  if (signedOut) return <main className="mx-auto flex max-w-xl flex-col gap-3 px-4 py-8"><p>Sign in to see your reports.</p><SignInButton next="/me" /></main>;
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-8 text-sm">
      <h1 className="text-2xl font-semibold">My reports</h1>
      {profile?.is_moderator && <Link href="/moderate" className="underline">Moderator console</Link>}
      {reports == null ? <p className="opacity-60">Loading...</p> : reports.length === 0 ? <p className="opacity-70">No reports yet. <Link href="/report" className="underline">Report an issue</Link></p> : (
        <ul className="flex flex-col gap-2">
          {reports.map((r) => (
            <li key={r.tracking_code} className="rounded-lg border p-3">
              <Link href={`/track/${r.tracking_code}`} className="font-mono underline">{r.tracking_code}</Link> · {r.category?.replace(/_/g, " ") ?? "pending"} · {r.incidents?.status?.replace(/_/g, " ") ?? r.status}
              {r.incidents?.severity_band && ` · ${r.incidents.severity_band}`}
              <p className="opacity-70">{r.ai_summary}</p>
              <p className="text-xs opacity-50">{new Date(r.submitted_at).toLocaleString()} · evidence {r.evidence_score ?? "…"}</p>
            </li>
          ))}
        </ul>
      )}
      {profile && (
        <section className="flex flex-col gap-2 rounded-lg border p-3">
          <h2 className="font-medium">Public leaderboard</h2>
          <label className="flex items-center gap-2"><input type="checkbox" checked={profile.leaderboard_opt_in} onChange={(e) => save({ leaderboard_opt_in: e.target.checked })} /> Show me on the citizen leaderboard as a nickname (never your name or email)</label>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); save({ nickname: String(new FormData(e.currentTarget).get("n")) }); }}>
            <input name="n" defaultValue={profile.nickname} className="rounded-md border bg-transparent px-2 py-1" />
            <button className="rounded-md border px-2 py-1">Save nickname</button>
          </form>
        </section>
      )}
      {msg && <p>{msg}</p>}
      <div className="flex gap-3">
        <form action="/auth/signout" method="post"><button className="rounded-md border px-3 py-1.5">Sign out</button></form>
        <button onClick={del} className="rounded-md border border-red-600 px-3 py-1.5 text-red-600">Delete my account</button>
      </div>
    </main>
  );
}
