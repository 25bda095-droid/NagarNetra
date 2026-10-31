"use client";

// Public map of all incidents, coloured by severity; each dot opens the incident.
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { MapPoint } from "@/components/MapView";
import { SEV_COLOR } from "@/components/ui";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false, loading: () => <div className="h-full w-full animate-pulse bg-surface-2" /> });

export default function IncidentMap() {
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    fetch("/api/incidents").then((r) => r.json()).then((j) => {
      const list = (j.incidents ?? []) as { id: string; lat: number; lon: number; severity_band: string; status: string; category_label: string }[];
      setCount(list.length);
      setPoints(list.map((i) => ({ id: i.id, lat: i.lat, lon: i.lon, color: i.status === "resolved_verified" ? "#0f766e" : SEV_COLOR[i.severity_band] ?? "#64748b", label: `${i.category_label} · ${i.severity_band} · ${i.status.replace(/_/g, " ")}`, href: `/incident/${i.id}` })));
    }).catch(() => setCount(0));
  }, []);
  return (
    <div className="card overflow-hidden p-0 sm:p-0">
      <div className="h-[46vh] min-h-72 w-full">
        <MapView center={[79, 22]} zoom={3.8} points={points} className="h-full w-full" />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-2.5 text-xs text-muted">
        <span>{count == null ? "Loading…" : `${count} incident${count === 1 ? "" : "s"}`}</span>
        {Object.entries(SEV_COLOR).map(([k, c]) => <span key={k} className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />{k}</span>)}
        <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-[#0f766e]" />verified fixed</span>
        <span className="ml-auto hidden sm:inline">Ctrl + scroll to zoom · tap a dot to open</span>
      </div>
    </div>
  );
}
