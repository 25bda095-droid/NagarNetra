// The structured record the AI must return for every photo / voice note / text.
// The AI only describes what it perceives; rules in lib/rules decide severity and routing.
import { z } from "zod";

export const CATEGORIES = [
  "road_damage",
  "garbage",
  "water_sewer",
  "streetlight",
  "electrical_hazard",
  "pollution_burning",
  "other_civic",
] as const;

export const HAZARD_FLAGS = [
  "live_wire",       // fallen, hanging or sparking wire
  "open_pit",        // open manhole, uncovered drain or deep pit on a road/footpath
  "collapse_risk",   // wall, tree, pole or structure that could fall on people
  "fire",            // flames or heavy smoke
  "flooding",        // water deep enough to hide hazards or stop traffic
  "burst_main",      // water main bursting with flowing water
  "sewage_overflow", // sewage on a street or footpath
] as const;

export const CONTEXT_FLAGS = [
  "on_road",
  "on_footpath",
  "blocks_traffic",
  "near_pedestrians",
] as const;

const box = z
  .array(z.number().int().min(0).max(1000))
  .length(4)
  .describe("[ymin, xmin, ymax, xmax] scaled 0-1000");

export const ComplaintRecordSchema = z.object({
  is_civic_issue: z.boolean().describe("true only for a problem in a public space that a public body should fix"),
  not_civic_reason: z.string().max(200).nullable().describe("short reason when is_civic_issue is false"),
  category: z.enum(CATEGORIES).nullable().describe("null when is_civic_issue is false"),
  subtype: z.string().max(60).nullable().describe("snake_case detail, e.g. large_pothole, open_manhole, overflowing_bin, waste_burning"),
  other_description: z.string().max(200).nullable().describe("what the problem is, when category is other_civic"),
  damage_level: z.enum(["none", "minor", "moderate", "major", "severe"]),
  hazard_flags: z.array(z.enum(HAZARD_FLAGS)).max(7),
  context_flags: z.array(z.enum(CONTEXT_FLAGS)).max(4),
  water_type: z.enum(["clean", "sewage", "unclear"]).nullable().describe("only for water_sewer, otherwise null"),
  location_type: z.enum(["public_space", "private_property", "indoor", "unclear"]),
  image_quality: z.enum(["good", "poor", "no_image"]),
  quality_hint: z.string().max(120).nullable().describe("how to retake the photo when quality is poor"),
  summary_en: z.string().min(1).max(300).describe("one or two neutral sentences in English, no personal details"),
  language: z.string().max(10).nullable().describe("ISO 639-1 code of the citizen's voice note or note, e.g. hi, ta, en"),
  summary_local: z.string().max(400).nullable().describe("the same summary in the citizen's language, null if English"),
  transcript: z.string().max(3000).nullable().describe("verbatim voice note in its original script, null if no audio"),
  sensitive_regions: z
    .array(z.object({ kind: z.enum(["face", "plate"]), box_2d: box }))
    .max(30)
    .describe("every visible human face and vehicle number plate, for blurring"),
  confidence: z.number().min(0).max(1).describe("confidence in category and damage level"),
});

export type ComplaintRecord = z.infer<typeof ComplaintRecordSchema>;
export type Category = (typeof CATEGORIES)[number];

// JSON Schema sent to Gemini so the model's output is constrained to this shape.
export const complaintRecordJsonSchema = (() => {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(ComplaintRecordSchema) as Record<string, unknown>;
  return schema;
})();
