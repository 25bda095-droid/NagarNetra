// After-photo check: is it the same place, and is the problem fixed? One Gemini call, fallback model.
import "server-only";
import { generateJson } from "@/lib/ai/gemini";

const schema = {
  type: "object",
  properties: { same_place: { type: "boolean" }, fixed: { type: "boolean" }, reason: { type: "string" } },
  required: ["same_place", "fixed", "reason"],
};

export async function compareFix(problem: string, before: Buffer, after: Buffer): Promise<{ same_place: boolean; fixed: boolean; reason: string; model: string }> {
  const models = [process.env.GEMINI_MODEL_VERIFY, process.env.GEMINI_MODEL_ANALYZE, process.env.GEMINI_MODEL_FALLBACK].filter((m): m is string => !!m);
  let last: unknown;
  for (const model of [...new Set(models)]) {
    try {
      const text = await generateJson({
        model, timeoutMs: 20000, jsonSchema: schema,
        systemInstruction:
          "You check whether a reported civic problem has been fixed. Photo 1 is the original report (faces and number plates are blurred). Photo 2 was just taken by a citizen whose phone GPS confirms they are at the same spot, possibly from a different angle, distance, time of day or weather. " +
          "same_place: true unless photo 2 clearly shows a different kind of place (e.g. indoors, a field instead of a road, a different building type); a different angle of a similar road or surface counts as the same place. " +
          "fixed: true only if the specific problem described is no longer visible where it was (e.g. the pothole is filled or patched, the garbage is cleared, the light works, the leak is stopped). If the problem is still visible, or photo 2 doesn't show the relevant area, false. " +
          "reason: one short, plain sentence for the citizen.",
        parts: [{ text: `Reported problem: ${problem.slice(0, 300)}` }, { text: "Photo 1 (report):" }, { inlineData: { mimeType: "image/webp", data: before.toString("base64") } }, { text: "Photo 2 (claimed fix):" }, { inlineData: { mimeType: "image/jpeg", data: after.toString("base64") } }],
      });
      return { ...JSON.parse(text), model };
    } catch (err) {
      last = err;
    }
  }
  throw last;
}
