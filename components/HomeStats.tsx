"use client";

// Live public numbers on the home page (no login): submitted, solved, pending and more.
import { useEffect, useState } from "react";
import Link from "next/link";

type T = Record<string, number | null>;

export default function HomeStats() {
  const [t, setT] = useState<T | null>(null);
  useEffect(() => void fetch("/api/stats").then((r) => r.json()).then((j) => setT(j.totals ?? {})), []);
  const tiles: [string, number | null | undefined, string][] = [
    ["Problems reported", t?.total_reports, ""],
    ["Pending", t?.open_incidents, "text-amber-600"],
    ["Solved (verified by photo)", t?.resolved_verified, "text-green-600"],
    ["Authority says solved", t?.resolved_claimed, ""],
    ["Overdue > 7 days", t?.overdue_incidents, "text-red-600"],
    ["Local bodies covered", t?.local_bodies_covered, ""],
  ];
  return (
    <div className="w-full">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map(([label, v, color]) => (
          <div key={label} className="rounded-lg border p-3 text-left">
            <p className={`text-2xl font-semibold ${color}`}>{t ? (v ?? 0) : "…"}</p>
            <p className="text-xs opacity-60">{label}</p>
          </div>
        ))}
      </div>
      <Link href="/stats" className="mt-1 inline-block text-xs underline opacity-70">All stats and leaderboards</Link>
    </div>
  );
}
