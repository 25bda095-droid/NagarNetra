// Thin wrapper around the Gemini SDK: one place for the API key, model-specific thinking
// settings, timeouts and turning SDK errors into a small set of reasons we can act on.
import { ApiError, GoogleGenAI, ThinkingLevel, type Part, type ThinkingConfig } from "@google/genai";

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY (see .env.example)");
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

// Gemini 2.x models switch thinking off with a zero budget; Gemini 3.x models use levels.
// Thinking adds seconds of latency and is not needed to describe a photo.
export function thinkingConfigFor(model: string): ThinkingConfig {
  if (/^gemini-2\./.test(model)) return { thinkingBudget: 0 };
  return { thinkingLevel: ThinkingLevel.MINIMAL };
}

export type FailureReason = "timeout" | "quota" | "unavailable" | "rejected" | "error";

// (field declared explicitly: Node's built-in TypeScript support can't run parameter properties)
export class GeminiCallError extends Error {
  reason: FailureReason;
  constructor(reason: FailureReason, message: string) {
    super(message);
    this.reason = reason;
  }
}

function classify(err: unknown): GeminiCallError {
  if (err instanceof GeminiCallError) return err;
  if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError" || /aborted/i.test(err.message))) {
    return new GeminiCallError("timeout", "the model took too long");
  }
  if (err instanceof ApiError) {
    if (err.status === 429) return new GeminiCallError("quota", "rate limit or daily quota reached");
    if (err.status >= 500) return new GeminiCallError("unavailable", `service error ${err.status}`);
    return new GeminiCallError("rejected", `request rejected (${err.status})`);
  }
  return new GeminiCallError("error", err instanceof Error ? err.message : String(err));
}

export type JsonCall = {
  model: string;
  systemInstruction: string;
  parts: Part[];
  jsonSchema: unknown;
  timeoutMs: number;
};

// Calls the model and returns its raw JSON text. Throws GeminiCallError on any failure.
export async function generateJson(call: JsonCall): Promise<string> {
  try {
    const res = await getClient().models.generateContent({
      model: call.model,
      contents: [{ role: "user", parts: call.parts }],
      config: {
        systemInstruction: call.systemInstruction,
        responseMimeType: "application/json",
        responseJsonSchema: call.jsonSchema,
        thinkingConfig: thinkingConfigFor(call.model),
        temperature: 0.2,
        abortSignal: AbortSignal.timeout(call.timeoutMs),
      },
    });
    const text = res.text;
    if (!text) throw new GeminiCallError("error", `empty response (finish reason: ${res.candidates?.[0]?.finishReason ?? "unknown"})`);
    return text;
  } catch (err) {
    throw classify(err);
  }
}

// Plain-text call with Google Search grounding (used by the Authority Finder as a last resort).
// Returns the answer text and the web pages Google cited.
export async function generateGrounded(model: string, prompt: string, timeoutMs: number): Promise<{ text: string; sources: string[] }> {
  try {
    const res = await getClient().models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { tools: [{ googleSearch: {} }], thinkingConfig: thinkingConfigFor(model), temperature: 0, abortSignal: AbortSignal.timeout(timeoutMs) },
    });
    const sources = (res.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []).map((c) => c.web?.uri).filter((u): u is string => !!u);
    return { text: res.text ?? "", sources };
  } catch (err) {
    throw classify(err);
  }
}
