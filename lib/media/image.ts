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

// 64-bit difference hash as a "0101..." string (Postgres bit(64)); near-identical photos differ in few bits.
export async function dHash(input: Buffer): Promise<string> {
  const px = await sharp(input).rotate().grayscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
  let bits = "";
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += px[y * 9 + x] < px[y * 9 + x + 1] ? "1" : "0";
  return bits;
}

// Public copy: upright, max 1280 px, faces/plates blurred, WebP (sharp drops EXIF incl. GPS by default).
export async function publicPhoto(input: Buffer, regions: { box_2d: number[] }[]): Promise<Buffer> {
  const base = await sharp(input).rotate().resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true }).toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = base.info;
  const patches = await Promise.all(
    regions.map(async ({ box_2d: [y0, x0, y1, x1] }) => {
      const left = Math.max(0, Math.floor((x0 / 1000) * W)), top = Math.max(0, Math.floor((y0 / 1000) * H));
      const width = Math.min(W - left, Math.ceil(((x1 - x0) / 1000) * W)), height = Math.min(H - top, Math.ceil(((y1 - y0) / 1000) * H));
      if (width < 2 || height < 2) return null;
      const input = await sharp(base.data).extract({ left, top, width, height }).blur(Math.max(8, Math.min(width, height) / 4)).toBuffer();
      return { input, left, top };
    }),
  );
  return sharp(base.data).composite(patches.filter((p) => p !== null)).webp({ quality: 72 }).toBuffer();
}
