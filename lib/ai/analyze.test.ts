import { describe, expect, it, vi } from "vitest";
import { analyzeComplaint, citizenMessage, parseRecord } from "./analyze";
import { GeminiCallError } from "./gemini";
import type { ComplaintRecord } from "./schema";

const valid: ComplaintRecord = {
  is_civic_issue: true,
  not_civic_reason: null,
  category: "road_damage",
  subtype: "large_pothole",
  other_description: null,
  damage_level: "major",
  hazard_flags: [],
  context_flags: ["on_road"],
  water_type: "clean", // should be cleared: not a water issue
  location_type: "public_space",
  image_quality: "good",
  quality_hint: null,
  summary_en: "Large pothole on the road.",
  language: "en",
  summary_local: "Large pothole on the road.", // should be cleared for English
  transcript: null,
  sensitive_regions: [{ kind: "plate", box_2d: [10, 20, 30, 40] }],
  confidence: 0.9,
};
const input = { note: "pothole" };
const json = (r: unknown) => JSON.stringify(r);

describe("parseRecord", () => {
  it("accepts a valid record and normalises it", () => {
    const out = parseRecord(json(valid));
    expect("record" in out && out.record.water_type).toBeNull();
    expect("record" in out && out.record.summary_local).toBeNull();
  });

  it("reports what is wrong", () => {
    const out = parseRecord(json({ ...valid, category: "potholes", confidence: 2 }));
    expect("problems" in out && out.problems).toMatch(/category/);
    expect("problems" in out && out.problems).toMatch(/confidence/);
  });

  it("rejects non-JSON", () => {
    expect(parseRecord("sure! here you go")).toEqual({ problems: "not valid JSON" });
  });

  it("forces category to null when not civic, and other_civic when civic without one", () => {
    const notCivic = parseRecord(json({ ...valid, is_civic_issue: false }));
    expect("record" in notCivic && notCivic.record.category).toBeNull();
    const noCategory = parseRecord(json({ ...valid, category: null }));
    expect("record" in noCategory && noCategory.record.category).toBe("other_civic");
  });
});

describe("analyzeComplaint fallback chain", () => {
  it("uses the primary model when it works", async () => {
    const call = vi.fn().mockResolvedValue(json(valid));
    const res = await analyzeComplaint(input, { models: ["primary", "fallback"], call });
    expect(res.ok && res.model).toBe("primary");
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("repairs invalid output once with the same model", async () => {
    const call = vi.fn().mockResolvedValueOnce("{oops").mockResolvedValueOnce(json(valid));
    const res = await analyzeComplaint(input, { models: ["primary", "fallback"], call });
    expect(res.ok && res.model).toBe("primary");
    expect(call).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(call.mock.calls[1][0].parts)).toMatch(/did not match the required schema/);
  });

  it("falls back to the second model on quota errors", async () => {
    const call = vi
      .fn()
      .mockRejectedValueOnce(new GeminiCallError("quota", "429"))
      .mockResolvedValueOnce(json(valid));
    const onCall = vi.fn();
    const res = await analyzeComplaint(input, { models: ["primary", "fallback"], call, onCall });
    expect(res.ok && res.model).toBe("fallback");
    expect(onCall).toHaveBeenCalledTimes(2);
    expect(res.attempts.map((a) => a.reason ?? "ok")).toEqual(["quota", "ok"]);
  });

  it("gives up after both models fail, without throwing", async () => {
    const call = vi.fn().mockRejectedValue(new GeminiCallError("timeout", "slow"));
    const res = await analyzeComplaint(input, { models: ["primary", "fallback"], call });
    expect(res).toMatchObject({ ok: false, reason: "timeout" });
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("reports not_configured when no model is set", async () => {
    const res = await analyzeComplaint(input, { models: [] });
    expect(res).toMatchObject({ ok: false, reason: "not_configured" });
  });
});

describe("citizenMessage", () => {
  it("asks for a retake before calling a blurry photo 'not civic'", () => {
    const blurry = { ...valid, is_civic_issue: false, image_quality: "poor" as const, quality_hint: "Hold steady" };
    expect(citizenMessage(blurry)).toEqual({ status: "poor_quality", message: "Hold steady" });
  });

  it("explains a rejection", () => {
    const food = { ...valid, is_civic_issue: false, not_civic_reason: "food" };
    expect(citizenMessage(food).status).toBe("not_civic");
  });

  it("lets the citizen continue when the AI is unavailable", () => {
    expect(citizenMessage(null).status).toBe("pending");
  });
});
