// Developer tool: run the live location lookup for a point.
// Usage: npm run try:locate -- <lat> <lon> [--fresh]
import { createClient } from "@supabase/supabase-js";
import { locate } from "../lib/discovery/locate.ts";

const [lat, lon] = process.argv.slice(2, 4).map(Number);
if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
  console.error("Usage: npm run try:locate -- <lat> <lon> [--fresh]");
  process.exit(1);
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const t = Date.now();
const p = await locate(db, lat, lon, { skipCache: process.argv.includes("--fresh") });
console.log(`${Date.now() - t} ms${p.cached ? " (cached)" : ""} | ${p.address ?? "no address"}`);
for (const c of p.admin_chain) {
  console.log(`  ${c.level.padEnd(11)} ${c.name}${c.lgd_code ? ` [LGD ${c.lgd_code}${c.lgd_type ? `, ${c.lgd_type}` : ""}, score ${c.match_score}]` : ""}  found: ${c.found_name} via ${c.found_in.join("+")}`);
}
console.log(`  road: ${p.road ? `${p.road.name ?? "(unnamed)"} ${p.road.highway}${p.road.ref ? ` ref ${p.road.ref}` : ""} ${p.road.distance_m}m` : "none within 30 m"}`);
console.log(`  nearby 200m: ${p.nearby.schools} schools, ${p.nearby.hospitals} hospitals, ${p.nearby.bus_stops} bus stops | offices 5km: ${p.offices.length}`);
if (p.warnings.length) console.log(`  warnings: ${p.warnings.join(" | ")}`);
