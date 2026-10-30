// Image helpers built on sharp.
import sharp from "sharp";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

// Copy sent to the AI: upright (phone orientation applied), at most 1024 px, JPEG.
// Smaller images mean fewer tokens, lower latency and less quota used, with no loss for this task.
export async function prepareImageForAi(input: Buffer): Promise<{ data: Buffer; mimeType: "image/jpeg"; width: number; height: number }> {
  const { data, info } = await sharp(input, { failOn: "error" })
    .rotate()
    .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer({ resolveWithObject: true });
  return { data, mimeType: "image/jpeg", width: info.width, height: info.height };
}
