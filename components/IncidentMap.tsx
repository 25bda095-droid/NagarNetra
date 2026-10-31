"use client";

// Public map of all incidents, coloured by severity. Each dot opens the incident's page.
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { MapPoint } from "@/components/MapView";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });
const COLOR: Record<string, string> = { critical: "#dc2626", high: "#f97316", medium: "#eab308", low: "#22c55e" };

export default function IncidentMap() {
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    fetch("/api/incidents").then((r) => r.json()).then((j) => {
      const list = (j.incidents ?? []) as { id: string; lat: number; lon: number; severity_band: string; status: string; category_label: string }[];
      setCount(list.length);
      setPoints(list.map((i) => ({ id: i.id, lat: i.lat, lon: i.lon, color: i.status === "resolved_verified" ? "#3b82f6" : COLOR[i.severity_band] ?? "#888", label: `${i.category_label} · ${i.severity_band} · ${i.status}`, href: `/incident/${i.id}` })));
    });
  }, []);
  return (
    <div className="w-full">
      <MapView center={[79, 22]} zoom={3.8} points={points} className="h-[55vh] w-full overflow-hidden rounded-lg" />
      <p className="mt-1 text-xs opacity-60">{count == null ? "Loading incidents..." : `${count} incident(s) reported. Red critical · orange high · yellow medium · green low · blue verified fixed.`}</p>
    </div>
  );
}
