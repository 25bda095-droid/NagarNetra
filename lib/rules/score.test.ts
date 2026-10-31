import { describe, expect, it } from "vitest";
import { matchRules, routingConfidence, scoreEvidence, scoreSeverity, type RoutingRule } from "./score";

const rec = { category: "road_damage" as const, subtype: "pothole", damage_level: "minor" as const, hazard_flags: [] as never[], context_flags: [] as never[] };

describe("severity", () => {
  it("minor pothole on a side street is low", () => expect(scoreSeverity(rec, { highway: "residential", ref: null }, null).band).toBe("low"));
  it("live wire is always critical", () => {
    const s = scoreSeverity({ ...rec, category: "electrical_hazard", hazard_flags: ["live_wire"] as never[] }, null, null);
    expect(s.band).toBe("critical");
    expect(s.score).toBeGreaterThanOrEqual(75);
  });
  it("sewage overflow is at least high", () => expect(scoreSeverity({ ...rec, hazard_flags: ["sewage_overflow"] as never[] }, null, null).band).toBe("high"));
  it("severe damage on an NH near people is critical", () =>
    expect(scoreSeverity({ ...rec, damage_level: "severe", context_flags: ["near_pedestrians", "on_road"] as never[], hazard_flags: ["open_pit"] as never[] }, { highway: "trunk", ref: "NH48" }, { schools: 1, hospitals: 0, bus_stops: 2 }).band).toBe("critical"));
});

describe("evidence", () => {
  it("live, accurate, fresh, new photo is strong", () =>
    expect(scoreEvidence({ live: true, accuracy_m: 20, capture_to_submit_s: 60, has_photo: true, image_reused: false, scene_fits_place: true, corroborated: false }).band).toBe("strong"));
  it("reused gallery photo with poor GPS is weak", () =>
    expect(scoreEvidence({ live: false, accuracy_m: 900, capture_to_submit_s: null, has_photo: true, image_reused: true, scene_fits_place: false, corroborated: false }).band).toBe("weak"));
});

describe("routing", () => {
  const rules: RoutingRule[] = [
    { category: "road_damage", subtype: null, condition: { road_ref_prefix: "NH" }, agency_type: "national_highway_authority", priority: 10 },
    { category: "road_damage", subtype: null, condition: {}, agency_type: "local_body", priority: 100 },
    { category: "pollution_burning", subtype: "waste_burning", condition: {}, agency_type: "local_body", priority: 50 },
    { category: "pollution_burning", subtype: null, condition: {}, agency_type: "pollution_control_board", priority: 100 },
  ];
  it("NH road goes to NHAI first", () => expect(matchRules(rules, "road_damage", null, "NH48").map((r) => r.agency_type)).toEqual(["national_highway_authority", "local_body"]));
  it("town road goes to local body", () => expect(matchRules(rules, "road_damage", null, null).map((r) => r.agency_type)).toEqual(["local_body"]));
  it("waste burning prefers local body", () => expect(matchRules(rules, "pollution_burning", "waste_burning", null)[0].agency_type).toBe("local_body"));
  it("J x A x O bands", () => {
    expect(routingConfidence({ jurisdiction: "local_body", authority: "human_verified", ruleRank: 0, otherCivic: false }).status).toBe("verified");
    expect(routingConfidence({ jurisdiction: "district", authority: "ai_found", ruleRank: 1, otherCivic: false }).status).toBe("partial");
    expect(routingConfidence({ jurisdiction: "none", authority: "none", ruleRank: 0, otherCivic: true }).status).toBe("unmapped");
  });
});
