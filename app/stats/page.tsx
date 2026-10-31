"use client";

// Public numbers and accountability leaderboards. All live SQL over real reports; nothing seeded.
import { useEffect, useState } from "react";

type Row = Record<string, string | number | null>;

export default function Stats() {
  const [s, setS] = useState<{ totals: Row; by_category: Row[]; by_state: Row[] } | null>(null);
  const [l, setL] = useState<{ places: Row[]; authorities: Row[]; citizens: Row[] } | null>(null);
  useEffect(() => {
    fetch("/api/stats").then((r) => r.json()).then(setS);
    fetch("/api/leaderboard").then((r) => r.json()).then(setL);
  }, []);
  const t = s?.totals ?? {};
  const tiles: [string, unknown][] = [
    ["Reports", t.total_reports], ["Incidents (after merging)", t.total_incidents], ["Open", t.open_incidents], ["Overdue (>7 days)", t.overdue_incidents],
    ["Fixed (claimed)", t.resolved_claimed], ["Fixed (verified by photo)", t.resolved_verified], ["Median hours to verified fix", t.median_hours_to_verified_fix ?? "–"],
    ["States", t.states_covered], ["Local bodies", t.local_bodies_covered], ["Authorities found by AI", t.authorities_ai_found], ["Authorities human-verified", t.authorities_human_verified],
  ];
  const table = (title: string, rows: Row[] | undefined, cols: [string, string][], empty: string) => (
    <section className="rounded-lg border p-3">
      <h2 className="mb-2 font-medium">{title}</h2>
      {!rows?.length ? <p className="opacity-60">{empty}</p> : (
        <table className="w-full text-left"><thead><tr>{cols.map(([, h]) => <th key={h} className="pb-1 font-normal opacity-60">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i}>{cols.map(([k]) => <td key={k} className="py-0.5">{r[k] ?? "–"}</td>)}</tr>)}</tbody></table>
      )}
    </section>
  );
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-8 text-sm">
      <h1 className="text-2xl font-semibold">Live stats</h1>
      {!s ? <p className="opacity-60">Loading...</p> : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {tiles.map(([k, v]) => <div key={k} className="rounded-lg border p-3"><p className="text-2xl font-semibold">{String(v ?? 0)}</p><p className="text-xs opacity-60">{k}</p></div>)}
        </div>
      )}
      {table("By category", s?.by_category, [["category_label", "Category"], ["incidents", "Incidents"], ["resolved_verified", "Verified fixed"]], "No reports yet.")}
      {table("By state", s?.by_state, [["state_name", "State"], ["incidents", "Incidents"], ["local_bodies", "Local bodies"], ["resolved_verified", "Verified fixed"]], "No reports yet.")}
      {table("Local body leaderboard (min. 3 incidents)", l?.places, [["local_body_name", "Local body"], ["local_body_type", "Type"], ["incidents", "Incidents"], ["verified_fix_rate", "Verified fix rate"], ["median_hours_to_fix", "Median hours"]], "No local body has 3+ incidents yet.")}
      {table("Authority leaderboard (min. 3 incidents)", l?.authorities, [["name", "Authority"], ["verification_status", "Status"], ["incidents", "Incidents"], ["verified_fix_rate", "Verified fix rate"]], "No authority has 3+ incidents yet.")}
      {table("Citizen leaderboard (opt-in)", l?.citizens, [["nickname", "Citizen"], ["points", "Points"], ["reports", "Reports"], ["verified_fixes", "Verified fixes"]], "Nobody has opted in yet.")}
    </main>
  );
}
