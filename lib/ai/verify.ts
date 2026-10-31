// After-photo check: is it the same place, and is the problem fixed? One Gemini call, fallback model.
import "server-only";
import { generateJson } from "@/lib/ai/gemini";

const schema = {
  type: "object",
  properties: { same_place: { type: "boolean" }, fixed: { type: "boolean" }, reason: { type: "string" } },
  required: ["same_place", "fixed", "reason"],
};

export async function compareFix(before: Buffer, after: Buffer): Promise<{ same_place: boolean; fixed: boolean; reason: string; model: string }> {
  const models = [process.env.GEMINI_MODEL_VERIFY, process.env.GEMINI_MODEL_ANALYZE, process.env.GEMINI_MODEL_FALLBACK].filter((m): m is string => !!m);
  let last: unknown;
  for (const model of [...new Set(models)]) {
    try {
      const text = await generateJson({
        model, timeoutMs: 20000, jsonSchema: schema,
        systemInstruction: "You compare two photos of a reported civic problem. Photo 1 is the original report, photo 2 is a claimed fix. Say whether photo 2 shows the same place (matching surroundings) and whether the problem from photo 1 is fixed. Be strict: if unsure, false. Reason: one short sentence.",
        parts: [{ text: "Photo 1 (report):" }, { inlineData: { mimeType: "image/webp", data: before.toString("base64") } }, { text: "Photo 2 (claimed fix):" }, { inlineData: { mimeType: "image/jpeg", data: after.toString("base64") } }],
      });
      return { ...JSON.parse(text), model };
    } catch (err) {
      last = err;
    }
  }
  throw last;
}
