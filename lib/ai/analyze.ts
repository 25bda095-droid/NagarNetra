// Turns a photo (+ optional voice note / note) into a validated ComplaintRecord.
//
// Order of attempts: primary model -> (one self-repair if the JSON is invalid) -> fallback model
// -> (one self-repair) -> give up with "pending". The caller saves the report either way,
// so a citizen is never blocked by the AI.
import type { Part } from "@google/genai";
import { ComplaintRecordSchema, complaintRecordJsonSchema, type ComplaintRecord } from "./schema.ts";
import { ANALYZE_SYSTEM_INSTRUCTION, analyzeUserPrompt, repairPrompt } from "./prompt.ts";
import { generateJson, GeminiCallError, type FailureReason, type JsonCall } from "./gemini.ts";

export type AnalyzeInput = {
  image?: { data: Buffer; mimeType: string };
  audio?: { data: Buffer; mimeType: string };
  note?: string | null;
};

export type Attempt = { model: string; ok: boolean; ms: number; reason?: FailureReason | "invalid_output"; repair?: boolean };

export type AnalyzeResult =
  | { ok: true; record: ComplaintRecord; model: string; attempts: Attempt[] }
  | { ok: false; reason: FailureReason | "invalid_output" | "not_configured"; attempts: Attempt[] };

export type AnalyzeOptions = {
  models?: string[];
  timeoutMs?: number;
  // injected in tests; defaults to the real Gemini call
  call?: (call: JsonCall) => Promise<string>;
  // called after every model call (used to count usage)
  onCall?: (model: string) => void | Promise<void>;
};

function configuredModels(): string[] {
  const models = [process.env.GEMINI_MODEL_ANALYZE, process.env.GEMINI_MODEL_FALLBACK].filter(
    (m): m is string => !!m,
  );
  return [...new Set(models)];
}

// Parses and validates model output. Returns the record or a short description of what is wrong.
export function parseRecord(text: string): { record: ComplaintRecord } | { problems: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { problems: "not valid JSON" };
  }
  const parsed = ComplaintRecordSchema.safeParse(json);
  if (parsed.success) return { record: normalise(parsed.data) };
  return {
    problems: parsed.error.issues
      .slice(0, 8)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; "),
  };
}

// Small consistency fixes that don't need another model call.
function normalise(record: ComplaintRecord): ComplaintRecord {
  const r = { ...record };
  if (!r.is_civic_issue) r.category = null;
  if (r.is_civic_issue && !r.category) r.category = "other_civic";
  if (r.category !== "water_sewer") r.water_type = null;
  if (r.language === "en") r.summary_local = null;
  r.hazard_flags = [...new Set(r.hazard_flags)];
  r.context_flags = [...new Set(r.context_flags)];
  return r;
}

export async function analyzeComplaint(input: AnalyzeInput, options: AnalyzeOptions = {}): Promise<AnalyzeResult> {
  const models = options.models ?? configuredModels();
  if (models.length === 0) return { ok: false, reason: "not_configured", attempts: [] };
  const call = options.call ?? generateJson;
  const timeoutMs = options.timeoutMs ?? 15000;

  const parts: Part[] = [];
  if (input.image) parts.push({ inlineData: { mimeType: input.image.mimeType, data: input.image.data.toString("base64") } });
  if (input.audio) parts.push({ inlineData: { mimeType: input.audio.mimeType, data: input.audio.data.toString("base64") } });
  parts.push({ text: analyzeUserPrompt({ hasImage: !!input.image, hasAudio: !!input.audio, note: input.note ?? null }) });

  const attempts: Attempt[] = [];
  let lastReason: FailureReason | "invalid_output" = "error";

  for (const model of models) {
    let requestParts = parts;
    for (const repair of [false, true]) {
      const started = Date.now();
      let text: string;
      try {
        text = await call({ model, systemInstruction: ANALYZE_SYSTEM_INSTRUCTION, parts: requestParts, jsonSchema: complaintRecordJsonSchema, timeoutMs });
      } catch (err) {
        const reason = err instanceof GeminiCallError ? err.reason : "error";
        attempts.push({ model, ok: false, ms: Date.now() - started, reason, repair });
        lastReason = reason;
        await options.onCall?.(model);
        break; // network/quota/timeout problems: move on to the next model
      }
      await options.onCall?.(model);

      const parsed = parseRecord(text);
      if ("record" in parsed) {
        attempts.push({ model, ok: true, ms: Date.now() - started, repair });
        return { ok: true, record: parsed.record, model, attempts };
      }
      attempts.push({ model, ok: false, ms: Date.now() - started, reason: "invalid_output", repair });
      lastReason = "invalid_output";
      // one self-repair with the same model, then move on
      requestParts = [...parts, { text: repairPrompt(text, parsed.problems) }];
    }
  }

  return { ok: false, reason: lastReason, attempts };
}

// What the citizen sees after analysis (the UI shows it next to the photo).
export function citizenMessage(record: ComplaintRecord | null): { status: "ok" | "not_civic" | "poor_quality" | "pending"; message: string } {
  if (!record) {
    return { status: "pending", message: "Our AI is busy right now (daily limit reached or service down). Pick the issue type yourself and submit; a moderator will review it." };
  }
  // a blurry or dark photo can't be judged, so ask for a retake before deciding it isn't civic
  if (record.image_quality === "poor") {
    return { status: "poor_quality", message: record.quality_hint ?? "The photo is hard to read. Please retake it." };
  }
  if (!record.is_civic_issue) {
    return {
      status: "not_civic",
      message: `This doesn't look like a public civic problem${record.not_civic_reason ? ` (${record.not_civic_reason})` : ""}. Retake the photo, or describe the issue in Assisted mode.`,
    };
  }
  return { status: "ok", message: record.summary_en };
}
