// Live OpenStreetMap lookups for one point: Overpass (boundaries, road, nearby places, offices)
// and Nominatim (address). Nothing about any place is stored in code.

const UA = () => process.env.OSM_USER_AGENT ?? "NagarNetra/0.1";
// Public Overpass servers are often overloaded; the env list comes first, then these backups.
const BACKUP_OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
const overpassUrls = () => [
  ...new Set([...(process.env.OVERPASS_URLS ?? "").split(",").map((u) => u.trim()).filter(Boolean), ...BACKUP_OVERPASS]),
];

export type OsmElement = {
  type: "node" | "way" | "relation" | "area";
  id: number;
  tags?: Record<string, string>;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
};

// Optional detail (Nominatim already gives the admin chain and road): admin areas containing the
// point (wards, Wikidata ids), roads within 30 m, schools/hospitals/bus stops within 200 m, and
// government offices within 2 km. Kept light because public Overpass servers are often busy.
export function overpassQuery(lat: number, lon: number): string {
  const p = `${lat},${lon}`;
  return `[out:json][timeout:8];
is_in(${p})->.a;
area.a["boundary"="administrative"]["admin_level"];
out tags;
way(around:30,${p})["highway"]["highway"!~"^(footway|path|steps|cycleway|service|track|pedestrian|corridor|bridleway|construction|proposed)$"];
out tags center 10;
(nwr(around:200,${p})["amenity"~"^(school|college|kindergarten|hospital|clinic)$"];
 node(around:200,${p})["highway"="bus_stop"];);
out tags center 40;
(nw(around:2000,${p})["office"="government"];
 nw(around:2000,${p})["amenity"="townhall"];);
out tags center 15;`;
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(ms), headers: { "User-Agent": UA(), ...init.headers } });
}

// Hedged requests within ONE shared time budget: start the first server; start the next one as soon
// as a server fails, or after HEDGE_MS if it is just slow. The first good answer wins and the rest
// are aborted, so dead or hanging servers can't use up the budget.
const HEDGE_MS = 1500;

export async function fetchOverpass(lat: number, lon: number, budgetMs = 9000): Promise<{ elements: OsmElement[]; server: string }> {
  const urls = overpassUrls();
  const errors: string[] = [];
  const stop = new AbortController();
  const signal = AbortSignal.any([stop.signal, AbortSignal.timeout(budgetMs)]);
  const body = overpassQuery(lat, lon);

  return new Promise((resolve, reject) => {
    let next = 0, running = 0, done = false, timer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      if (!done && running === 0 && next >= urls.length) {
        done = true;
        reject(new Error(`all Overpass servers failed (${errors.join("; ")})`));
      }
    };
    const launch = () => {
      clearTimeout(timer);
      if (done || signal.aborted || next >= urls.length) return finish();
      const url = urls[next++];
      running++;
      timer = setTimeout(launch, HEDGE_MS);
      fetch(url, { method: "POST", body: new URLSearchParams({ data: body }), headers: { "User-Agent": UA() }, signal })
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = (await res.json()) as { elements: OsmElement[] };
          if (done) return;
          done = true;
          clearTimeout(timer);
          stop.abort();
          resolve({ elements: json.elements ?? [], server: url });
        })
        .catch((err) => {
          if (!done) errors.push(`${new URL(url).host}: ${signal.aborted ? "timeout" : (err as Error).message}`);
          running--;
          if (signal.aborted) { next = urls.length; finish(); } else launch(); // failed fast: try the next server now
        });
    };
    signal.addEventListener("abort", () => { clearTimeout(timer); next = urls.length; if (!done) setTimeout(finish, 0); });
    launch();
  });
}

export type NominatimResult = {
  display_name?: string;
  category?: string;
  type?: string;
  name?: string;
  namedetails?: Record<string, string>;
  address?: Record<string, string>;
  osm_type?: string;
  osm_id?: number;
};

export async function fetchNominatim(lat: number, lon: number): Promise<NominatimResult | null> {
  const base = process.env.NOMINATIM_URL ?? "https://nominatim.openstreetmap.org";
  const url = `${base}/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=17&addressdetails=1&namedetails=1&accept-language=en`;
  try {
    const res = await fetchWithTimeout(url, {}, 8000);
    if (!res.ok) return null;
    return (await res.json()) as NominatimResult;
  } catch {
    return null;
  }
}

// ---------- parsing (pure, unit-tested) ----------

export const osmUrl = (e: OsmElement) =>
  `https://www.openstreetmap.org/${e.type === "area" ? (e.id >= 3600000000 ? "relation" : "way") : e.type}/${
    e.type === "area" ? (e.id >= 3600000000 ? e.id - 3600000000 : e.id - 2400000000) : e.id
  }`;

const enName = (t: Record<string, string> = {}) => t["name:en"] || t.name || t["official_name:en"] || null;

export function distanceM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export type AdminArea = { admin_level: number; name: string; wikidata: string | null; website: string | null; source: string };
export type Road = { name: string | null; highway: string; ref: string | null; distance_m: number; source: string };
export type Place = { kind: string; name: string | null; distance_m: number; source: string };
export type Office = { name: string | null; phone: string | null; website: string | null; distance_m: number; source: string };

export function parseOverpass(elements: OsmElement[], point: { lat: number; lon: number }) {
  const admin: AdminArea[] = [];
  const roads: Road[] = [];
  const nearby: Place[] = [];
  const offices: Office[] = [];
  const pos = (e: OsmElement) => (e.center ?? (e.lat !== undefined ? { lat: e.lat, lon: e.lon! } : null));

  for (const e of elements) {
    const t = e.tags ?? {};
    const where = pos(e);
    const dist = where ? distanceM(point, where) : 0;
    if (e.type === "area" && t.boundary === "administrative") {
      const name = enName(t);
      if (name && t.admin_level) {
        admin.push({ admin_level: Number(t.admin_level), name, wikidata: t.wikidata ?? null, website: t.website ?? t["contact:website"] ?? null, source: osmUrl(e) });
      }
    } else if (t.office === "government" || t.amenity === "townhall") {
      offices.push({ name: enName(t), phone: t.phone ?? t["contact:phone"] ?? null, website: t.website ?? t["contact:website"] ?? null, distance_m: dist, source: osmUrl(e) });
    } else if (t.amenity || t.highway === "bus_stop") {
      nearby.push({ kind: t.highway === "bus_stop" ? "bus_stop" : t.amenity, name: enName(t), distance_m: dist, source: osmUrl(e) });
    } else if (t.highway) {
      roads.push({ name: enName(t), highway: t.highway, ref: t.ref ?? null, distance_m: dist, source: osmUrl(e) });
    }
  }

  // de-duplicate admin levels (keep first per level+name), sort everything by distance
  const seen = new Set<string>();
  const adminUnique = admin
    .filter((a) => !seen.has(`${a.admin_level}:${a.name}`) && seen.add(`${a.admin_level}:${a.name}`))
    .sort((a, b) => a.admin_level - b.admin_level);
  roads.sort((a, b) => a.distance_m - b.distance_m);
  nearby.sort((a, b) => a.distance_m - b.distance_m);
  offices.sort((a, b) => a.distance_m - b.distance_m);

  return { admin: adminUnique, road: roads[0] ?? null, nearby, offices: offices.slice(0, 10) };
}

// At street zoom Nominatim returns the nearest road itself: its class (primary, trunk...) and ref (NH44).
export function roadFromNominatim(n: NominatimResult | null): Road | null {
  if (!n || n.category !== "highway" || !n.type) return null;
  return {
    name: n.namedetails?.["name:en"] ?? n.name ?? n.address?.road ?? null,
    highway: n.type,
    ref: n.namedetails?.ref ?? null,
    distance_m: 0,
    source: n.osm_type && n.osm_id ? `https://www.openstreetmap.org/${n.osm_type}/${n.osm_id}` : "nominatim",
  };
}

// Backup when every Overpass server is down: government offices from Nominatim search ("government"
// within ~5 km). One request, so it stays inside Nominatim's 1 request/second policy.
export async function nominatimOffices(lat: number, lon: number): Promise<Office[]> {
  const base = process.env.NOMINATIM_URL ?? "https://nominatim.openstreetmap.org";
  const d = 0.045; // ~5 km
  const url = `${base}/search?format=jsonv2&q=government&bounded=1&limit=20&extratags=1&viewbox=${lon - d},${lat + d},${lon + d},${lat - d}`;
  const res = await fetchWithTimeout(url, {}, 6000);
  if (!res.ok) throw new Error(`nominatim search HTTP ${res.status}`);
  const rows = (await res.json()) as { name: string; category: string; type: string; lat: string; lon: string; osm_type: string; osm_id: number; extratags?: Record<string, string> }[];
  return rows
    .filter((r) => r.name && ((r.category === "office" && r.type === "government") || (r.category === "amenity" && ["townhall", "public_building", "courthouse"].includes(r.type))))
    .map((r) => ({
      name: r.name,
      phone: r.extratags?.phone ?? r.extratags?.["contact:phone"] ?? null,
      website: r.extratags?.website ?? r.extratags?.["contact:website"] ?? null,
      distance_m: Math.round(distanceM({ lat, lon }, { lat: Number(r.lat), lon: Number(r.lon) })),
      source: `https://www.openstreetmap.org/${r.osm_type}/${r.osm_id}`,
    }))
    .sort((a, b) => a.distance_m - b.distance_m)
    .slice(0, 10);
}
