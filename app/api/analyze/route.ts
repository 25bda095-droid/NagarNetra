// POST /api/analyze { photo_path?, audio_path?, note? }
// Runs the AI on what the citizen captured, saves the result in `analyses` and returns it, so the
// review screen can show the detected issue before submitting. Submitting reuses this analysis,
// so each report costs one AI call.
import { z } from "zod";
import { requireUser } from "@/lib/guards/auth";
import { clientIp, enforceRateLimits } from "@/lib/guards/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorResponse, HttpError } from "@/lib/http";
import { analyzeComplaint, citizenMessage } from "@/lib/ai/analyze";
import { prepareImageForAi } from "@/lib/media/image";
import { mimeFromPath, ownsPath, UPLOAD_KINDS } from "@/lib/media/uploads";

export const maxDuration = 60;

const Body = z
  .object({
    photo_path: z.string().max(200).nullish(),
    audio_path: z.string().max(200).nullish(),
    note: z.string().trim().max(500).nullish(),
  })
  .refine((b) => b.photo_path || b.audio_path || b.note, { message: "Send a photo, a voice note or a note." });

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "bad_request", parsed.error.issues[0]?.message ?? "Invalid request.");
    const { photo_path, audio_path, note } = parsed.data;

    if (photo_path && !ownsPath(user.userId, "photo", photo_path)) throw new HttpError(403, "forbidden", "Not your photo.");
    if (audio_path && !ownsPath(user.userId, "audio", audio_path)) throw new HttpError(403, "forbidden", "Not your voice note.");

    // each analysis is one AI call, so this is the main quota guard
    await enforceRateLimits([
      { key: `analyze:user:${user.userId}`, windowSeconds: 3600, max: 20 },
      { key: `analyze:ip:${await clientIp()}`, windowSeconds: 3600, max: 40 },
    ]);

    const admin = createAdminClient();
    const download = async (path: string, maxBytes: number) => {
      const { data, error } = await admin.storage.from("raw").download(path);
      if (error || !data) throw new HttpError(404, "upload_missing", "The uploaded file wasn't found. Please try again.");
      if (data.size > maxBytes) throw new HttpError(413, "too_large", "The file is too large.");
      return Buffer.from(await data.arrayBuffer());
    };

    let image: { data: Buffer; mimeType: string } | undefined;
    if (photo_path) {
      try {
        image = await prepareImageForAi(await download(photo_path, UPLOAD_KINDS.photo.maxBytes));
      } catch (err) {
        if (err instanceof HttpError) throw err;
        throw new HttpError(422, "bad_image", "That photo couldn't be read. Please take it again.");
      }
    }
    const audio = audio_path
      ? { data: await download(audio_path, UPLOAD_KINDS.audio.maxBytes), mimeType: mimeFromPath(audio_path) ?? "audio/webm" }
      : undefined;

    const result = await analyzeComplaint(
      { image, audio, note: note ?? null },
      {
        // count every model call (shown on the moderator page); failures to count are ignored
        onCall: async (model) => {
          await admin.rpc("record_ai_call", { p_provider: "gemini", p_model: model });
        },
      },
    );

    const record = result.ok ? result.record : null;
    const outcome = citizenMessage(record);

    const { data: row, error } = await admin
      .from("analyses")
      .insert({
        user_id: user.userId,
        photo_path: photo_path ?? null,
        audio_path: audio_path ?? null,
        transcript: record?.transcript ?? null,
        language: record?.language ?? null,
        record: record ?? { note: note ?? null, failure: result.ok ? null : result.reason },
        provider: "gemini",
        model: result.ok ? result.model : null,
        ai_confidence: record?.confidence ?? null,
        status: outcome.status,
      })
      .select("id")
      .single();
    if (error) throw new Error(`save analysis: ${error.message}`);

    return Response.json({
      analysis_id: row.id,
      status: outcome.status,
      message: outcome.message,
      record,
      // the 112 banner and the category picker use these
      hazard: (record?.hazard_flags.length ?? 0) > 0,
      low_confidence: !record || record.confidence < 0.6,
      attempts: result.attempts.map(({ model, ok, ms, reason }) => ({ model, ok, ms, reason })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
