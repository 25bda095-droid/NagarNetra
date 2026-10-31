"use client";

// MapLibre map on OpenFreeMap tiles. Shows incident dots, and/or a draggable report pin with its GPS accuracy circle.
import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export type MapPoint = { id: string; lat: number; lon: number; color: string; label?: string; href?: string };
type Props = {
  center: [number, number]; // [lon, lat]
  zoom?: number;
  points?: MapPoint[];
  pin?: { lat: number; lon: number; accuracy: number } | null;
  onPinMove?: (p: { lat: number; lon: number }) => void;
  className?: string;
};

function circle(lon: number, lat: number, r: number) {
  const coords = Array.from({ length: 49 }, (_, i) => {
    const a = (i / 48) * 2 * Math.PI;
    return [lon + ((r / 111320) * Math.cos(a)) / Math.cos((lat * Math.PI) / 180), lat + (r / 110540) * Math.sin(a)];
  });
  return { type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [coords] } };
}

export default function MapView({ center, zoom = 15, points = [], pin, onPinMove, className }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const marker = useRef<maplibregl.Marker | null>(null);
  const dots = useRef<maplibregl.Marker[]>([]);
  const moveRef = useRef(onPinMove);
  useEffect(() => void (moveRef.current = onPinMove), [onPinMove]);

  useEffect(() => {
    const m = new maplibregl.Map({ container: box.current!, style: "https://tiles.openfreemap.org/styles/liberty", center, zoom, attributionControl: { compact: true } });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }));
    m.on("load", () => {
      m.addSource("acc", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "acc", type: "fill", source: "acc", paint: { "fill-color": "#3b82f6", "fill-opacity": 0.15 } });
    });
    map.current = m;
    return () => m.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // report pin + accuracy circle
  useEffect(() => {
    const m = map.current;
    if (!m || !pin) return;
    if (!marker.current) {
      marker.current = new maplibregl.Marker({ draggable: !!moveRef.current, color: "#ef4444" }).setLngLat([pin.lon, pin.lat]).addTo(m);
      marker.current.on("dragend", () => {
        const { lng, lat } = marker.current!.getLngLat();
        moveRef.current?.({ lat, lon: lng });
      });
      m.jumpTo({ center: [pin.lon, pin.lat], zoom: pin.accuracy > 500 ? 13 : 17 });
    } else marker.current.setLngLat([pin.lon, pin.lat]);
    const draw = () => (m.getSource("acc") as maplibregl.GeoJSONSource | undefined)?.setData(circle(pin.lon, pin.lat, pin.accuracy));
    if (m.isStyleLoaded()) draw();
    else m.once("load", draw);
  }, [pin]);

  // incident dots
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    dots.current.forEach((d) => d.remove());
    dots.current = points.map((p) => {
      const el = document.createElement(p.href ? "a" : "div");
      if (p.href) (el as HTMLAnchorElement).href = p.href;
      el.title = p.label ?? "";
      el.style.cssText = `display:block;width:14px;height:14px;border-radius:50%;background:${p.color};border:2px solid white;box-shadow:0 0 2px #0008`;
      return new maplibregl.Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(m);
    });
  }, [points]);

  return <div ref={box} className={className ?? "h-72 w-full overflow-hidden rounded-lg"} />;
}
