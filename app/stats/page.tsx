"use client";

// Public impact dashboard and accountability leaderboards. Live SQL over real reports; nothing seeded.
import { useEffect, useState } from "react";

type Row = Record<string, string | number | null>;
const pct = (v: unknown) => (v == null ? "–" : `${Math.round(Number(v) * 100)}%`);

export default function Stats() {
  const [s, setS] = useState<{ totals: Row; by_category: Row[]; by_state: Row[] } | null>(null);
  const [l, setL] = useState<{ places: Row[]; authorities: Row[]; citizens: Row[] } | null>(null);
  useEffect(() => {
    fetch("/api/stats").then((r) => r.json()).then(setS);
    fetch("/api/leaderboard").then((r) => r.json()).then(setL);
  }, []);
  const t = s?.totals ?? {};
  const total = Number(t.total_incidents ?? 0);
  const fixRate = total ? Number(t.resolved_verified ?? 0) / total : null;
  const tiles: [string, unknown, string, string][] = [
    ["Total reports", t.total_reports, "Issues logged to date", "text-ink"],
    ["Fixed · verified", t.resolved_verified, "Confirmed by an after-photo", "text-ok"],
    ["Verified fix rate", pct(fixRate), "Of all incidents", "text-brand"],
    ["Median time to fix", t.median_hours_to_verified_fix != null ? `${t.median_hours_to_verified_fix} h` : "–", "Report → verified fix", "text-ink"],
    ["Pending", t.open_incidents, "Open, forwarded or acknowledged", "text-warn"],
    ["Overdue", t.overdue_incidents, "Open for more than 7 days", "text-danger"],
    ["Local bodies", t.local_bodies_covered, `${t.states_covered ?? 0} states covered`, "text-ink"],
    ["Authorities found", Number(t.authorities_ai_found ?? 0) + Number(t.authorities_human_verified ?? 0), `${t.authorities_human_verified ?? 0} human-verified`, "text-ink"],
  ];
  const maxCat = Math.max(1, ...(s?.by_category ?? []).map((r) => Number(r.incidents)));

  const board = (title: string, hint: string, rows: Row[] | undefined, cols: [string, string, ((v: unknown) => string)?][], empty: string) => (
    <section className="card flex flex-col gap-3 overflow-x-auto">
      <div><h2 className="font-semibold">{title}</h2><p className="text-xs text-muted">{hint}</p></div>
      {!rows?.length ? <p className="rounded-xl bg-surface-2 p-4 text-sm text-muted">{empty}</p> : (
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b">{cols.map(([, h]) => <th key={h} className="eyebrow pb-2 font-semibold">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i} className="border-b last:border-0">{cols.map(([k, , f]) => <td key={k} className="py-2 pr-3">{f ? f(r[k]) : (r[k] ?? "–")}</td>)}</tr>)}</tbody>
        </table>
      )}
    </section>
  );

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b pb-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Civic impact dashboard</h1>
          <p className="text-muted">Live numbers from real reports across India. Nothing here is sample data.</p>
        </div>
        <span className="chip border-ok/40 text-ok">● Live</span>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(([k, v, sub, c]) => (
          <div key={k} className="card">
            <p className="eyebrow">{k}</p>
            <p className={`mt-1 text-3xl font-semibold tabular-nums ${c}`}>{s ? String(v ?? 0) : "–"}</p>
            <p className="text-xs text-muted">{sub}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card flex flex-col gap-3">
          <h2 className="font-semibold">Issues by type</h2>
          {!s?.by_category.length ? <p className="text-sm text-muted">No reports yet.</p> : s.by_category.map((r) => (
            <div key={String(r.category)} className="text-sm">
              <div className="flex justify-between"><span>{r.category_label}</span><span className="tabular-nums text-muted">{r.incidents} · {r.resolved_verified} fixed</span></div>
              <div className="mt-1 h-2 rounded-full bg-surface-2"><div className="h-2 rounded-full bg-brand" style={{ width: `${(Number(r.incidents) / maxCat) * 100}%` }} /></div>
            </div>
          ))}
        </section>
        {board("By state", "Where reports come from", s?.by_state, [["state_name", "State"], ["incidents", "Incidents"], ["local_bodies", "Local bodies"], ["resolved_verified", "Fixed"]], "No reports yet.")}
      </div>
      {board("Local body accountability", "Ranked by verified fix rate · minimum 3 incidents to be ranked", l?.places, [["local_body_name", "Local body"], ["local_body_type", "Type"], ["incidents", "Incidents"], ["verified_fix_rate", "Fix rate", pct], ["median_hours_to_fix", "Median hours"]], "No local body has 3 or more incidents yet.")}
      <div className="grid gap-4 lg:grid-cols-2">
        {board("Authority leaderboard", "Minimum 3 incidents", l?.authorities, [["name", "Authority"], ["verification_status", "Status"], ["incidents", "Incidents"], ["verified_fix_rate", "Fix rate", pct]], "No authority has 3 or more incidents yet.")}
        {board("Citizen leaderboard", "Opt-in nicknames only · turn it on in My reports", l?.citizens, [["nickname", "Citizen"], ["points", "Points"], ["reports", "Reports"], ["verified_fixes", "Verified fixes"]], "Nobody has opted in yet.")}
      </div>
    </main>
  );
}
