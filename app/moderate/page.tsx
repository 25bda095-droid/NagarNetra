"use client";

// Moderator console: one task per tab, the most urgent first. Moderators fix categories, authorities and
// duplicates and hide abuse; they never see who reported, and can't mark a fix verified.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/components/report/ReportFlow";
import { CATEGORIES } from "@/lib/ai/schema";
import { SeverityBadge, Tip } from "@/components/ui";

type Q = { id: number; ref_type: string; ref_id: string; reason: string; priority: number; created_at: string };
type I = { id: string; category: string; summary: string; severity_band: string; routing_status: string; routing_reason: string; authority_name: string | null; cover_photo_path: string | null; status: string };
type A = { id: string; name: string; agency_type: string; level: string; portal_url: string | null; source_urls: string[]; found_by: string[]; confidence: number };
type U = { day: string; model: string; calls: number };

const REASON: Record<string, string> = {
  critical: "Critical severity: check it's real and routed",
  other_civic: "Outside the usual categories: set the right one",
  analysis_pending: "AI couldn't analyse it: set the category",
  routing_partial: "Authority found but not certain: confirm it",
  routing_unmapped: "No authority found: find and approve one",
};
const photo = (p: string) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/public/${p}`;

export default function Moderate() {
  const [d, setD] = useState<{ queue: Q[]; incidents: I[]; authorities: A[]; ai_usage: U[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"queue" | "authorities" | "usage">("queue");
  const [toast, setToast] = useState<string | null>(null);
  const load = useCallback(() => fetch("/api/moderate").then(async (r) => (r.ok ? setD(await r.json()) : setErr((await r.json()).message))), []);
  useEffect(() => void load(), [load]);
  const act = async (body: object, done = "Saved") => {
    try { await api("/api/moderate", body); setToast(done); setTimeout(() => setToast(null), 2000); load(); } catch (e) { setToast((e as Error).message); }
  };

  if (err) return <main className="mx-auto w-full max-w-xl px-4 py-10"><div className="card text-danger">{err} <Link href="/me" className="underline">Sign in</Link></div></main>;
  if (!d) return <main className="mx-auto w-full max-w-5xl px-4 py-10"><div className="card h-64 animate-pulse" /></main>;
  const inc = new Map(d.incidents.map((i) => [i.id, i]));
  const today = d.ai_usage.filter((u) => u.day === new Date().toISOString().slice(0, 10)).reduce((a, u) => a + u.calls, 0);
  const TABS = [["queue", "Review queue", d.queue.length], ["authorities", "Authorities to verify", d.authorities.length], ["usage", "AI usage", today]] as const;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Moderator console</h1>
        <p className="text-sm text-muted">Every action is logged publicly on the incident timeline. Reporter identities are never shown.</p>
      </div>
      <div className="flex gap-1 overflow-x-auto rounded-xl bg-surface-2 p-1">
        {TABS.map(([k, label, n]) => (
          <button key={k} onClick={() => setTab(k)} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm ${tab === k ? "bg-surface font-medium shadow-sm" : "text-muted"}`}>
            {label} <span className="chip px-2">{n}</span>
          </button>
        ))}
      </div>
      {toast && <div className="fixed bottom-20 left-1/2 z-40 -translate-x-1/2 rounded-xl bg-ink px-4 py-2 text-sm text-bg shadow-lg sm:bottom-6">{toast}</div>}

      {tab === "queue" && (
        <section className="flex flex-col gap-3">
          <Tip>Most urgent first. Open the incident if you need the full trace. Approve when it&apos;s correct, fix the category if the AI got it wrong, merge duplicates, or hide abuse.</Tip>
          {!d.queue.length && <div className="card text-center text-muted">All clear. Nothing to review.</div>}
          {d.queue.map((q) => { const i = inc.get(q.ref_id); return (
            <article key={q.id} className="card flex flex-col gap-3 sm:flex-row">
              {i?.cover_photo_path && /* eslint-disable-next-line @next/next/no-img-element */ <img src={photo(i.cover_photo_path)} alt="" className="h-36 w-full shrink-0 rounded-xl object-cover sm:w-44" />}
              <div className="flex flex-1 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`chip ${q.priority === 0 ? "border-danger/40 text-danger" : "border-warn/40 text-warn"}`}>{REASON[q.reason] ?? q.reason.replace(/_/g, " ")}</span>
                  {i && <SeverityBadge band={i.severity_band} />}
                </div>
                {i && <>
                  <p className="font-medium capitalize">{i.category.replace(/_/g, " ")}</p>
                  <p className="text-sm text-muted">{i.summary}</p>
                  <p className="text-xs text-muted">Routed to: {i.authority_name ?? "nobody yet"} ({i.routing_status})</p>
                </>}
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => act({ action: "queue", id: q.id, decision: "approved" }, "Approved")} className="btn-primary min-h-9">Approve</button>
                  {i && <select defaultValue="" onChange={(e) => e.target.value && act({ action: "category", id: i.id, category: e.target.value }, "Category fixed").then(() => act({ action: "queue", id: q.id, decision: "corrected" }))} className="input min-h-9 w-auto">
                    <option value="">Fix category…</option>{CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
                  </select>}
                  {i && <button onClick={() => { const into = prompt("Paste the incident ID to merge into (from its page URL):"); if (into) act({ action: "merge", id: i.id, into: into.trim().split("/").pop() }, "Merged").then(() => act({ action: "queue", id: q.id, decision: "corrected" })); }} className="btn-ghost min-h-9">Merge…</button>}
                  {i && <button onClick={() => confirm("Hide this incident from the public?") && act({ action: "hide", id: i.id, hidden: true }, "Hidden").then(() => act({ action: "queue", id: q.id, decision: "hidden" }))} className="btn min-h-9 border-danger/40 text-danger">Hide</button>}
                  <Link href={`/incident/${q.ref_id}`} className="btn-ghost min-h-9">Open</Link>
                </div>
              </div>
            </article>
          ); })}
        </section>
      )}

      {tab === "authorities" && (
        <section className="flex flex-col gap-3">
          <Tip>The AI found these from Wikidata and OpenStreetMap. Open the sources, check it&apos;s the official body for that area, then approve. Approved authorities route with full confidence from now on.</Tip>
          {!d.authorities.length && <div className="card text-center text-muted">No authorities waiting.</div>}
          {d.authorities.map((a) => (
            <article key={a.id} className="card flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">{a.name}</h3>
                <span className="chip capitalize">{a.agency_type.replace(/_/g, " ")}</span>
                <span className="chip">{a.level}</span>
                <span className="chip">conf {a.confidence}</span>
              </div>
              <p className="text-xs text-muted">Found via {a.found_by.join(", ").replace(/_/g, " ")}</p>
              <div className="flex flex-wrap gap-2 text-xs">{[a.portal_url, ...a.source_urls].filter((u): u is string => !!u).filter((u, i, all) => all.indexOf(u) === i).map((u) => <a key={u} href={u} target="_blank" rel="noreferrer" className="chip max-w-full truncate text-brand">{u.replace(/^https?:\/\//, "")}</a>)}</div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => act({ action: "authority", id: a.id, decision: "approve" }, "Approved")} className="btn-primary min-h-9">Approve</button>
                <button onClick={() => { const url = prompt("Correct official website (https://…)", a.portal_url ?? ""); if (url) act({ action: "authority", id: a.id, decision: "approve", portal_url: url }, "Fixed and approved"); }} className="btn-ghost min-h-9">Fix website & approve</button>
                <button onClick={() => act({ action: "authority", id: a.id, decision: "reject" }, "Rejected")} className="btn min-h-9 border-danger/40 text-danger">Reject</button>
              </div>
            </article>
          ))}
        </section>
      )}

      {tab === "usage" && (
        <section className="card flex flex-col gap-2 text-sm">
          <h2 className="font-semibold">Gemini calls per day</h2>
          <p className="text-xs text-muted">One call per report plus one per fix verification. Watch this against the free-tier daily limit.</p>
          {d.ai_usage.map((u) => <div key={u.day + u.model} className="flex justify-between border-b py-1.5 last:border-0"><span>{u.day} · <span className="font-mono text-xs">{u.model}</span></span><span className="tabular-nums">{u.calls}</span></div>)}
        </section>
      )}
    </main>
  );
}
