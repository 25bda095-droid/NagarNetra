// Step 3 of the pipeline: "where is this point?" for any location in India, discovered live.
// OSM boundaries + Nominatim address -> matched to official LGD units, with a source for every fact.
// Results are cached per ~100 m cell so repeated reports nearby are instant.
import type { SupabaseClient } from "@supabase/supabase-js";
import { coreName } from "./lgd-names.ts";
import { fetchNominatim, fetchOverpass, parseOverpass, roadFromNominatim, type Office, type Place, type Road } from "./osm.ts";

const CACHE_DAYS = 30;
const MIN_SCORE = { state: 0.5, district: 0.45, local_body: 0.45 } as const;

export type ChainLevel = "state" | "district" | "subdistrict" | "local_body" | "ward";
export type ChainItem = {
  level: ChainLevel;
  name: string;                 // official LGD name when matched, otherwise the OSM/Nominatim name
  found_name: string;           // what OSM/Nominatim called it
  lgd_code: number | null;
  lgd_type: string | null;      // e.g. Municipal Corporation, Gram Panchayat
  category: string | null;      // urban / rural / traditional
  match_score: number | null;
  found_in: ("osm" | "nominatim" | "lgd")[];
  sources: string[];
};

export type PlaceInfo = {
  cell_id: string;
  in_india: boolean;
  admin_chain: ChainItem[];
  address: string | null;
  road: Road | null;
  nearby: { schools: number; hospitals: number; bus_stops: number; items: Place[] };
  offices: Office[];
  wikidata: Record<string, string>; // admin level -> Wikidata id (used by the Authority Finder)
  warnings: string[];
  fetched_at: string;
  cached: boolean;
};

// ~110 m cells: 3 decimal places of latitude/longitude
export const cellId = (lat: number, lon: number) => `${lat.toFixed(3)},${lon.toFixed(3)}`;

type Match = { lgd_code: number; name: string; local_body_type: string | null; category: string | null; state_lgd: number; district_lgd: number | null; score: number };

async function bestMatch(db: SupabaseClient, level: string, names: string[], state?: number | null, district?: number | null): Promise<Match | null> {
  let best: Match | null = null;
  for (const name of [...new Set(names.filter(Boolean))]) {
    const { data, error } = await db.rpc("match_lgd", { p_level: level, p_core: coreName(name), p_state: state ?? null, p_district: district ?? null, p_limit: 1 });
    if (error) throw new Error(`match_lgd: ${error.message}`);
    const top = (data as Match[] | null)?.[0];
    if (top && (!best || top.score > best.score)) best = top;
  }
  return best;
}

export async function locate(db: SupabaseClient, lat: number, lon: number, opts: { skipCache?: boolean } = {}): Promise<PlaceInfo> {
  const cell = cellId(lat, lon);

  if (!opts.skipCache) {
    const { data } = await db.from("places_cache").select("*").eq("cell_id", cell).maybeSingle();
    if (data && Date.now() - new Date(data.fetched_at).getTime() < CACHE_DAYS * 864e5) {
      return { ...(data.lgd_match as PlaceInfo), cached: true };
    }
  }

  const warnings: string[] = [];
  const [overpass, nominatim] = await Promise.allSettled([fetchOverpass(lat, lon), fetchNominatim(lat, lon)]);
  const osm = overpass.status === "fulfilled" ? parseOverpass(overpass.value.elements, { lat, lon }) : null;
  if (!osm) warnings.push(`Nearby places and offices unavailable (Overpass busy): ${(overpass as PromiseRejectedResult).reason?.message ?? "error"}`);
  const nom = nominatim.status === "fulfilled" ? nominatim.value : null;
  if (!nom) warnings.push("Address lookup (Nominatim) unavailable");
  const addr = nom?.address ?? {};
  const nomSource = nom?.osm_type && nom.osm_id ? `https://www.openstreetmap.org/${nom.osm_type}/${nom.osm_id}` : null;

  const inIndia = addr.country_code ? addr.country_code === "in" : !!osm?.admin.some((a) => a.admin_level === 2 && /india/i.test(a.name));
  const byLevel = (lvl: number[]) => osm?.admin.filter((a) => lvl.includes(a.admin_level)) ?? [];
  const chain: ChainItem[] = [];
  const wikidata: Record<string, string> = {};

  const add = (level: ChainLevel, osmAreas: typeof osm extends null ? never : NonNullable<typeof osm>["admin"], nomName: string | undefined, match: Match | null) => {
    const found = osmAreas[0]?.name ?? nomName;
    if (!found && !match) return;
    const found_in: ChainItem["found_in"] = [];
    if (osmAreas.length) found_in.push("osm");
    if (nomName) found_in.push("nominatim");
    if (match) found_in.push("lgd");
    const sources = [...osmAreas.map((a) => a.source), ...(nomName && nomSource ? [nomSource] : []), ...(match ? [`lgd:${level}:${match.lgd_code}`] : [])];
    const wd = osmAreas.find((a) => a.wikidata)?.wikidata;
    if (wd) wikidata[level] = wd;
    chain.push({ level, name: match?.name ?? found!, found_name: found ?? match!.name, lgd_code: match?.lgd_code ?? null, lgd_type: match?.local_body_type ?? null,
      category: match?.category ?? null, match_score: match ? Number(match.score.toFixed(2)) : null, found_in, sources: [...new Set(sources)] });
  };

  if (inIndia) {
    // state
    const stateAreas = byLevel([4]);
    const stateM = await bestMatch(db, "state", [...stateAreas.map((a) => a.name), addr.state]);
    const state = stateM && stateM.score >= MIN_SCORE.state ? stateM : null;
    add("state", stateAreas, addr.state, state);

    // district (within the state)
    const districtAreas = byLevel([5]);
    const districtM = state ? await bestMatch(db, "district", [...districtAreas.map((a) => a.name), addr.state_district, addr.county], state.lgd_code) : null;
    const district = districtM && districtM.score >= MIN_SCORE.district ? districtM : null;
    add("district", districtAreas, addr.state_district ?? addr.county, district);

    // sub-district (taluk/tehsil) from OSM only: shown for context, not used for routing
    const sub = byLevel([6]);
    if (sub.length) add("subdistrict", sub, undefined, null);

    // local body: city/town names usually match urban bodies, village names match gram panchayats
    const lbAreas = byLevel([7, 8]);
    const lbNames = [addr.city_district, addr.municipality, addr.city, addr.town, ...lbAreas.map((a) => a.name), addr.village];
    const lbM = state ? await bestMatch(db, "local_body", lbNames as string[], state.lgd_code, district?.lgd_code) : null;
    const lb = lbM && lbM.score >= MIN_SCORE.local_body ? lbM : null;
    add("local_body", lbAreas, addr.city_district ?? addr.municipality ?? addr.city ?? addr.town ?? addr.village, lb);
    if (!lb) warnings.push("Local body not matched to the official directory; routing falls back to the district");

    // ward, only where OSM maps it
    const ward = byLevel([9, 10]);
    if (ward.length) add("ward", ward.slice(-1), undefined, null);
  } else {
    warnings.push("This point is outside India");
  }

  const nearbyItems = osm?.nearby ?? [];
  const info: PlaceInfo = {
    cell_id: cell,
    in_india: inIndia,
    admin_chain: chain,
    address: nom?.display_name ?? null,
    road: roadFromNominatim(nom) ?? osm?.road ?? null,
    nearby: {
      schools: nearbyItems.filter((p) => ["school", "college", "kindergarten"].includes(p.kind)).length,
      hospitals: nearbyItems.filter((p) => ["hospital", "clinic"].includes(p.kind)).length,
      bus_stops: nearbyItems.filter((p) => p.kind === "bus_stop").length,
      items: nearbyItems.slice(0, 15),
    },
    offices: osm?.offices ?? [],
    wikidata,
    warnings,
    fetched_at: new Date().toISOString(),
    cached: false,
  };

  // cache only when both lookups worked, so a temporary outage isn't remembered for 30 days
  if (nom && osm) {
    await db.from("places_cache").upsert({
      cell_id: cell, osm_admin: osm?.admin ?? null, nominatim: { display_name: nom.display_name, address: addr }, lgd_match: info,
      road: info.road, nearby: info.nearby, offices: info.offices, fetched_at: info.fetched_at,
    });
  }
  return info;
}
