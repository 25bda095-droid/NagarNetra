"use client";

// Public issues feed: every reported problem with its photo, severity, area and the authority to contact,
// and a "Solved" gallery with before/after photos and how long the fix took. No login needed.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CATEGORIES } from "@/lib/ai/schema";
import { SeverityBadge, StatusLabel, Tip } from "@/components/ui";

type Item = {
  id: string; category: string; category_label: string; summary: string | null; severity_band: string; severity_score: number; status: string;
  admin_chain: { level: string; name: string }[] | null; cover_photo_path: string | null; fixed_photo_path: string | null;
  created_at: string; resolved_at: string | null; independent_reporters: number; authority_name: string | null; authority_verification: string | null;
  authority_portal_url: string | null; authority_helpline: string | null; routing_status: string; ticket_id: string | null;
};
type State = { state_lgd: number; state_name: string };

const photo = (p: string) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/public/${p}`;
const area = (c: Item["admin_chain"]) => (c ?? []).filter((x) => ["local_body", "district", "state"].includes(x.level)).map((x) => x.name).join(", ");
function took(from: string, to: string | null) {
  if (!to) return null;
  const h = (Date.parse(to) - Date.parse(from)) / 3_600_000;
  return h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`;
}
const ago = (t: string) => { const d = Math.floor((Date.now() - Date.parse(t)) / 86_400_000); return d === 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`; };

export default function Issues() {
  const [view, setView] = useState<"open" | "solved">("open");
  const [filters, setFilters] = useState({ category: "", severity: "", state: "" });
  const [items, setItems] = useState<Item[] | null>(null);
  const [total, setTotal] = useState(0);
  const [next, setNext] = useState<number | null>(null);
  const [states, setStates] = useState<State[]>([]);

  const load = useCallback((offset = 0) => {
    const q = new URLSearchParams({ view, offset: String(offset), ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) });
    return fetch(`/api/feed?${q}`).then((r) => r.json()).catch(() => ({ items: [], total: 0, next: null })).then((j) => {
      setItems((old) => (offset ? [...(old ?? []), ...j.items] : j.items));
      setTotal(j.total);
      setNext(j.next);
    });
  }, [view, filters]);

  useEffect(() => void load(0), [load]);
  useEffect(() => void fetch("/api/stats").then((r) => r.json()).then((j) => setStates((j.by_state ?? []).filter((s: State) => s.state_lgd))), []);

  // show the loading skeleton while a new tab or filter loads
  const set = (k: keyof typeof filters) => (e: React.ChangeEvent<HTMLSelectElement>) => { setItems(null); setFilters((f) => ({ ...f, [k]: e.target.value })); };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Issues across India</h1>
          <p className="text-muted">Every report is public. See a problem near you? Contact the responsible authority yourself; more voices get it fixed faster.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/track" className="btn-ghost">Track a code</Link>
          <Link href="/report" className="btn-primary">Report an issue</Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl bg-surface-2 p-1">
          {(["open", "solved"] as const).map((v) => (
            <button key={v} onClick={() => { if (v !== view) { setItems(null); setView(v); } }} className={`rounded-lg px-4 py-2 text-sm ${view === v ? "bg-surface font-medium shadow-sm" : "text-muted"}`}>
              {v === "open" ? "Needs fixing" : "Solved"}
            </button>
          ))}
        </div>
        <select value={filters.category} onChange={set("category")} className="input min-h-10 w-auto"><option value="">All types</option>{CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}</select>
        {view === "open" && <select value={filters.severity} onChange={set("severity")} className="input min-h-10 w-auto"><option value="">Any severity</option>{["critical", "high", "medium", "low"].map((s) => <option key={s}>{s}</option>)}</select>}
        <select value={filters.state} onChange={set("state")} className="input min-h-10 w-auto"><option value="">All states</option>{states.map((s) => <option key={s.state_lgd} value={s.state_lgd}>{s.state_name}</option>)}</select>
        <span className="ml-auto text-sm text-muted">{items ? `${total} ${view === "open" ? "open" : "solved"}` : ""}</span>
      </div>

      {view === "open" && <Tip>Use &ldquo;Contact authority&rdquo; on any card to complain too, and quote the incident link. Live there? Report it yourself from the spot: it&apos;s merged and counts as another independent reporter.</Tip>}

      {items == null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="card h-80 animate-pulse" />)}</div>
      ) : items.length === 0 ? (
        <div className="card text-center text-muted">{view === "open" ? "No open issues match these filters." : "No verified fixes yet. When a fix is confirmed by an after-photo, it appears here."}</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((i) => (view === "open" ? <OpenCard key={i.id} i={i} /> : <SolvedCard key={i.id} i={i} />))}
        </div>
      )}
      {next != null && <button className="btn-ghost mx-auto" onClick={() => load(next)}>Load more</button>}
    </main>
  );
}

function OpenCard({ i }: { i: Item }) {
  return (
    <article className="card nn-rise flex flex-col gap-3 p-0 sm:p-0">
      <Link href={`/incident/${i.id}`} className="block">
        {i.cover_photo_path
          ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={photo(i.cover_photo_path)} alt={i.category_label} loading="lazy" className="h-48 w-full rounded-t-2xl object-cover" />
          : <div className="flex h-48 items-center justify-center rounded-t-2xl bg-surface-2 text-sm text-muted">No photo (assisted report)</div>}
      </Link>
      <div className="flex flex-1 flex-col gap-2 px-4 pb-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Link href={`/incident/${i.id}`} className="font-semibold hover:text-brand">{i.category_label}</Link>
          <SeverityBadge band={i.severity_band} score={i.severity_score} />
          <StatusLabel status={i.status} />
        </div>
        <p className="line-clamp-2 text-sm">{i.summary}</p>
        <p className="text-xs text-muted">{area(i.admin_chain)} · {ago(i.created_at)} · {i.independent_reporters} reporter{i.independent_reporters === 1 ? "" : "s"}</p>
        <div className="mt-auto rounded-xl bg-surface-2 p-3 text-sm">
          <p className="eyebrow">Responsible</p>
          <p className="font-medium">{i.authority_name ?? "Being identified"}</p>
          {i.ticket_id && <p className="text-xs text-muted">Complaint no. {i.ticket_id}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            {i.authority_portal_url && <a href={i.authority_portal_url} target="_blank" rel="noreferrer" className="btn-primary min-h-9 px-3">Contact authority ↗</a>}
            {i.authority_helpline && /^[\d +()-]{6,}$/.test(i.authority_helpline) && <a href={`tel:${i.authority_helpline.replace(/[^\d+]/g, "")}`} className="btn-ghost min-h-9 px-3">Call {i.authority_helpline}</a>}
            <Link href={`/incident/${i.id}`} className="btn-ghost min-h-9 px-3">Details</Link>
          </div>
        </div>
      </div>
    </article>
  );
}

function SolvedCard({ i }: { i: Item }) {
  const time = took(i.created_at, i.resolved_at);
  return (
    <article className="card nn-rise flex flex-col gap-3 p-0 sm:p-0">
      <div className="grid grid-cols-2 gap-0.5 overflow-hidden rounded-t-2xl">
        {[["Before", i.cover_photo_path], ["After", i.fixed_photo_path]].map(([label, p]) => (
          <div key={label} className="relative">
            {p ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={photo(p)} alt={`${label}: ${i.category_label}`} loading="lazy" className="h-40 w-full object-cover" /> : <div className="flex h-40 items-center justify-center bg-surface-2 text-xs text-muted">No photo</div>}
            <span className={`absolute top-2 left-2 rounded-md px-2 py-0.5 text-xs font-semibold text-white ${label === "Before" ? "bg-danger" : "bg-ok"}`}>{label}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2 px-4 pb-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Link href={`/incident/${i.id}`} className="font-semibold hover:text-brand">{i.category_label}</Link>
          {time && <span className="chip border-ok/40 bg-ok/10 text-ok">Fixed in {time}</span>}
        </div>
        <p className="line-clamp-2 text-sm">{i.summary}</p>
        <p className="text-xs text-muted">{area(i.admin_chain)}</p>
        <p className="text-xs text-muted">Reported {new Date(i.created_at).toLocaleDateString()} · verified fixed {i.resolved_at && new Date(i.resolved_at).toLocaleDateString()}{i.authority_name && ` · by ${i.authority_name}`}</p>
      </div>
    </article>
  );
}
