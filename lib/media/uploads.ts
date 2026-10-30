// Rules for files citizens upload. Uploads go straight from the browser to Supabase Storage
// (signed URLs), so large photos never pass through Vercel's 4.5 MB request limit.

export const UPLOAD_KINDS = {
  photo: { types: ["image/jpeg", "image/png", "image/webp"], maxBytes: 10 * 1024 * 1024 },
  audio: { types: ["audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg", "audio/wav"], maxBytes: 3 * 1024 * 1024 },
  after_photo: { types: ["image/jpeg", "image/png", "image/webp"], maxBytes: 10 * 1024 * 1024 },
} as const;

export type UploadKind = keyof typeof UPLOAD_KINDS;

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
};

// "audio/webm;codecs=opus" -> "audio/webm"
export function baseMimeType(contentType: string): string {
  return contentType.split(";")[0].trim().toLowerCase();
}

export function isAllowedType(kind: UploadKind, contentType: string): boolean {
  return (UPLOAD_KINDS[kind].types as readonly string[]).includes(baseMimeType(contentType));
}

// Every upload lives under raw/<userId>/<kind>/..., so ownership can be checked from the path
// and "delete my account" can remove a user's files together.
export function uploadPath(userId: string, kind: UploadKind, contentType: string, id: string): string {
  return `${userId}/${kind}/${id}.${EXTENSIONS[baseMimeType(contentType)]}`;
}

export function ownsPath(userId: string, kind: UploadKind, path: string): boolean {
  return new RegExp(`^${userId}/${kind}/[0-9a-f-]{36}\\.[a-z0-9]+$`).test(path);
}

export function mimeFromPath(path: string): string | null {
  const ext = path.split(".").pop();
  return Object.entries(EXTENSIONS).find(([, e]) => e === ext)?.[0] ?? null;
}
