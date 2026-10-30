// POST /api/upload-url { kind: "photo" | "audio" | "after_photo", contentType }
// -> { path, signedUrl, token }: the browser then uploads the file directly to Supabase Storage.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireUser } from "@/lib/guards/auth";
import { clientIp, enforceRateLimits } from "@/lib/guards/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorResponse, HttpError } from "@/lib/http";
import { isAllowedType, UPLOAD_KINDS, uploadPath } from "@/lib/media/uploads";

const Body = z.object({
  kind: z.enum(Object.keys(UPLOAD_KINDS) as [keyof typeof UPLOAD_KINDS, ...(keyof typeof UPLOAD_KINDS)[]]),
  contentType: z.string().min(3).max(100),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = Body.safeParse(await request.json().catch(() => null));
    if (!body.success) throw new HttpError(400, "bad_request", "Expected { kind, contentType }.");
    const { kind, contentType } = body.data;
    if (!isAllowedType(kind, contentType)) {
      throw new HttpError(415, "unsupported_type", `This file type isn't accepted for ${kind}.`);
    }

    await enforceRateLimits([
      { key: `upload:user:${user.userId}`, windowSeconds: 3600, max: 60 },
      { key: `upload:ip:${await clientIp()}`, windowSeconds: 3600, max: 120 },
    ]);

    const path = uploadPath(user.userId, kind, contentType, randomUUID());
    const { data, error } = await createAdminClient().storage.from("raw").createSignedUploadUrl(path);
    if (error || !data) throw new Error(`signed upload url: ${error?.message}`);

    return Response.json({ path, signedUrl: data.signedUrl, token: data.token, maxBytes: UPLOAD_KINDS[kind].maxBytes });
  } catch (err) {
    return errorResponse(err);
  }
}
