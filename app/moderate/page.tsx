"use client";

// Minimal moderator console: review queue, AI-found authorities to approve/reject, AI usage.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/components/report/ReportFlow";
import { CATEGORIES } from "@/lib/ai/schema";

type Q = { id: number; ref_type: string; ref_id: string; reason: string; priority: number };
type I = { id: string; category: string; summary: string; severity_band: string; routing_status: string; routing_reason: string; authority_name: string | null };
type A = { id: string; name: string; agency_type: string; level: string; portal_url: string | null; source_urls: string[]; found_by: string[]; confidence: number };
type U = { day: string; model: string; calls: number };

export default function Moderate() {
  const [d, setD] = useState<{ queue: Q[]; incidents: I[]; authorities: A[]; ai_usage: U[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => fetch("/api/moderate").then(async (r) => (r.ok ? setD(await r.json()) : setErr((await r.json()).message))), []);
  useEffect(() => void load(), [load]);
  const act = async (body: object) => { try { await api("/api/moderate", body); load(); } catch (e) { alert((e as Error).message); } };

  if (err) return <main className="px-4 py-8">{err}</main>;
  if (!d) return <main className="px-4 py-8 opacity-60">Loading...</main>;
  const inc = new Map(d.incidents.map((i) => [i.id, i]));
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-8 text-sm">
      <h1 className="text-2xl font-semibold">Moderator console</h1>
      <section className="rounded-lg border p-3">
        <h2 className="mb-2 font-medium">Review queue ({d.queue.length})</h2>
        {d.queue.map((q) => { const i = inc.get(q.ref_id); return (
          <div key={q.id} className="mb-2 border-b pb-2">
            <p><b>{q.reason.replace(/_/g, " ")}</b> · <Link href={`/incident/${q.ref_id}`} className="underline">open incident</Link></p>
            {i && <p className="opacity-80">{i.category} · {i.severity_band} · {i.summary} · routed: {i.authority_name ?? "none"} ({i.routing_status})</p>}
            <div className="mt-1 flex flex-wrap gap-2">
              {i && <select defaultValue="" onChange={(e) => e.target.value && act({ action: "category", id: i.id, category: e.target.value })} className="rounded border bg-transparent px-1"><option value="">Fix category...</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>}
              <button onClick={() => act({ action: "queue", id: q.id, decision: "approved" })} className="rounded border px-2">Approve</button>
              {i && <button onClick={() => act({ action: "hide", id: i.id, hidden: true }).then(() => act({ action: "queue", id: q.id, decision: "hidden" }))} className="rounded border px-2 text-red-600">Hide (abuse)</button>}
              {i && <button onClick={() => { const into = prompt("Merge into incident id:"); if (into) act({ action: "merge", id: i.id, into }).then(() => act({ action: "queue", id: q.id, decision: "corrected" })); }} className="rounded border px-2">Merge into...</button>}
            </div>
          </div>
        ); })}
        {!d.queue.length && <p className="opacity-60">Nothing to review.</p>}
      </section>
      <section className="rounded-lg border p-3">
        <h2 className="mb-2 font-medium">Authorities found by AI ({d.authorities.length})</h2>
        {d.authorities.map((a) => (
          <div key={a.id} className="mb-2 border-b pb-2">
            <p><b>{a.name}</b> · {a.agency_type.replace(/_/g, " ")} · {a.level} · found by {a.found_by.join(", ")} · conf {a.confidence}</p>
            <p className="truncate text-xs opacity-60">{[a.portal_url, ...a.source_urls].filter(Boolean).map((u) => <a key={u} href={u!} target="_blank" rel="noreferrer" className="mr-2 underline">{u}</a>)}</p>
            <div className="mt-1 flex gap-2">
              <button onClick={() => act({ action: "authority", id: a.id, decision: "approve" })} className="rounded border px-2">Approve</button>
              <button onClick={() => { const url = prompt("Correct official website (https://...)", a.portal_url ?? ""); if (url) act({ action: "authority", id: a.id, decision: "approve", portal_url: url }); }} className="rounded border px-2">Fix website + approve</button>
              <button onClick={() => act({ action: "authority", id: a.id, decision: "reject" })} className="rounded border px-2 text-red-600">Reject</button>
            </div>
          </div>
        ))}
      </section>
      <section className="rounded-lg border p-3">
        <h2 className="mb-2 font-medium">AI usage</h2>
        {d.ai_usage.map((u) => <p key={u.day + u.model}>{u.day} · {u.model} · {u.calls} calls</p>)}
      </section>
    </main>
  );
}
