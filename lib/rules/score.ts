// Severity, evidence and routing confidence: pure rules (the AI only perceives, these decide).
import type { ComplaintRecord } from "@/lib/ai/schema";

export type Band = "low" | "medium" | "high" | "critical";
const ORDER: Band[] = ["low", "medium", "high", "critical"];
const MIN: Record<Band, number> = { low: 0, medium: 35, high: 55, critical: 75 };
export const bandFor = (s: number): Band => (s >= 75 ? "critical" : s >= 55 ? "high" : s >= 35 ? "medium" : "low");

const DAMAGE = { none: 0, minor: 0.25, moderate: 0.5, major: 0.75, severe: 1 } as const;
const ROAD: Record<string, number> = { motorway: 1, trunk: 1, primary: 0.8, secondary: 0.65, tertiary: 0.5, unclassified: 0.35, residential: 0.3 };
type Rec = Pick<ComplaintRecord, "category" | "subtype" | "damage_level" | "hazard_flags" | "context_flags">;

export function floorFor(r: Rec): { band: Band; reason: string } | null {
  const h = new Set(r.hazard_flags);
  if (h.has("live_wire")) return { band: "critical", reason: "live or fallen wire" };
  if (h.has("open_pit")) return { band: "critical", reason: "open manhole or pit" };
  if (h.has("burst_main")) return { band: "critical", reason: "burst water main" };
  if (h.has("collapse_risk")) return { band: "critical", reason: "collapse risk" };
  if (h.has("fire") || (r.category === "pollution_burning" && r.subtype?.includes("burning"))) return { band: "high", reason: "fire or open burning" };
  if (h.has("sewage_overflow")) return { band: "high", reason: "sewage overflow" };
  if (h.has("flooding")) return { band: "high", reason: "flooding" };
  return null;
}

// 100 x (0.40 damage + 0.30 life risk + 0.15 road importance + 0.15 exposure), then safety floors
export function scoreSeverity(r: Rec, road: { highway: string; ref: string | null } | null, nearby: { schools: number; hospitals: number; bus_stops: number } | null) {
  const ctx = new Set(r.context_flags);
  const damage = DAMAGE[r.damage_level];
  const life = r.hazard_flags.length ? 1 : ctx.has("near_pedestrians") || ctx.has("on_footpath") ? 0.5 : ctx.has("on_road") ? 0.4 : 0.15;
  const roadImp = Math.max(road ? (/^NH/i.test(road.ref ?? "") ? 1 : (ROAD[road.highway] ?? 0.2)) : 0.2, ctx.has("blocks_traffic") ? 0.8 : 0);
  const exposure = Math.min(1, 0.2 + (nearby ? 0.15 * Math.min(nearby.schools + nearby.hospitals, 2) + 0.1 * Math.min(nearby.bus_stops, 2) : 0) + (ctx.has("near_pedestrians") ? 0.3 : 0));
  let score = Math.round(100 * (0.4 * damage + 0.3 * life + 0.15 * roadImp + 0.15 * exposure));
  let band = bandFor(score);
  const floor = floorFor(r);
  if (floor && ORDER.indexOf(floor.band) > ORDER.indexOf(band)) {
    band = floor.band;
    score = Math.max(score, MIN[band]);
  }
  const f = (n: number) => Math.round(n * 100) / 100;
  return { score, band, factors: { damage: f(damage), life_risk: f(life), road_importance: f(roadImp), exposure: f(exposure), floor: floor?.reason ?? null } };
}

export type EvidenceInput = {
  live: boolean; accuracy_m: number | null; capture_to_submit_s: number | null;
  has_photo: boolean; image_reused: boolean; scene_fits_place: boolean; corroborated: boolean;
};
export function scoreEvidence(e: EvidenceInput) {
  const f: Record<string, number> = {};
  if (e.live) f.live_capture = 30;
  if (e.accuracy_m != null && e.accuracy_m <= 150) f.gps_accuracy = e.accuracy_m <= 50 ? 20 : 10;
  if (e.capture_to_submit_s != null && e.capture_to_submit_s <= 600) f.fresh = 15;
  if (e.has_photo && !e.image_reused) f.new_image = 15;
  if (e.scene_fits_place) f.scene_fits_place = 10;
  if (e.corroborated) f.corroborated = 10;
  const score = Math.min(100, Object.values(f).reduce((a, b) => a + b, 0));
  return { score, band: score >= 70 ? "strong" : score >= 40 ? "moderate" : "weak", factors: f };
}

export type AgencyType = "national_highway_authority" | "state_pwd" | "local_body" | "water_board" | "electricity_discom" | "pollution_control_board";
export type RoutingRule = { category: string; subtype: string | null; condition: { road_ref_prefix?: string }; agency_type: AgencyType; priority: number; note?: string | null };

// matching rules, best first; the caller tries each until an authority is found
export function matchRules(rules: RoutingRule[], category: string, subtype: string | null, roadRef: string | null) {
  return rules
    .filter((r) => r.category === category && (!r.subtype || (subtype ?? "").includes(r.subtype)))
    .filter((r) => !r.condition?.road_ref_prefix || (roadRef ?? "").toUpperCase().startsWith(r.condition.road_ref_prefix))
    .sort((a, b) => a.priority - b.priority);
}

// confidence = J (jurisdiction) x A (authority) x O (rule fit)
export function routingConfidence(i: { jurisdiction: "local_body" | "district" | "state" | "none"; authority: "human_verified" | "ai_found" | "none"; ruleRank: number; otherCivic: boolean }) {
  const J = { local_body: 1, district: 0.8, state: 0.55, none: 0.2 }[i.jurisdiction];
  const A = { human_verified: 1, ai_found: 0.85, none: 0.35 }[i.authority];
  const O = i.otherCivic ? 0.6 : i.ruleRank === 0 ? 1 : 0.9;
  const c = Math.round(J * A * O * 100) / 100;
  return { confidence: c, status: (c >= 0.75 ? "verified" : c >= 0.4 ? "partial" : "unmapped") as "verified" | "partial" | "unmapped" };
}
