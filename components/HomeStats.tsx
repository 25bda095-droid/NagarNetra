"use client";

// Live public numbers (no login): reported, pending, solved and more.
import { useEffect, useState } from "react";

type T = Record<string, number | null>;

export default function HomeStats() {
  const [t, setT] = useState<T | null>(null);
  useEffect(() => void fetch("/api/stats").then((r) => r.json()).then((j) => setT(j.totals ?? {})).catch(() => setT({})), []);
  const tiles: [string, number | null | undefined, string][] = [
    ["Problems reported", t?.total_reports, "text-ink"],
    ["Pending", t?.open_incidents, "text-warn"],
    ["Fixed · verified by photo", t?.resolved_verified, "text-ok"],
    ["Fixed · claimed", t?.resolved_claimed, "text-info"],
    ["Overdue > 7 days", t?.overdue_incidents, "text-danger"],
    ["Local bodies covered", t?.local_bodies_covered, "text-brand"],
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {tiles.map(([label, v, color]) => (
        <div key={label} className="rounded-xl bg-surface-2 p-3">
          <p className={`text-2xl font-semibold tabular-nums ${color}`}>{t ? (v ?? 0) : "–"}</p>
          <p className="text-xs text-muted">{label}</p>
        </div>
      ))}
    </div>
  );
}
