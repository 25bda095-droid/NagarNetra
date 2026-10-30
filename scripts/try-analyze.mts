// Developer tool: run the AI analysis on local files without the app.
// Usage: npm run try:analyze -- <photo.jpg> [voice.webm|voice.m4a] [--note "text"]
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { analyzeComplaint, citizenMessage } from "../lib/ai/analyze.ts";
import { prepareImageForAi } from "../lib/media/image.ts";

const AUDIO_TYPES: Record<string, string> = { ".webm": "audio/webm", ".m4a": "audio/mp4", ".mp4": "audio/mp4", ".ogg": "audio/ogg", ".mp3": "audio/mpeg", ".wav": "audio/wav" };

const args = process.argv.slice(2);
const noteIndex = args.indexOf("--note");
const note = noteIndex >= 0 ? args.splice(noteIndex, 2)[1] : null;
const [photoPath, audioPath] = args;
if (!photoPath && !note) {
  console.error('Usage: npm run try:analyze -- <photo> [audio] [--note "text"]');
  process.exit(1);
}

const image = photoPath && photoPath !== "-" ? await prepareImageForAi(readFileSync(photoPath)) : undefined;
const audio = audioPath ? { data: readFileSync(audioPath), mimeType: AUDIO_TYPES[extname(audioPath)] ?? "audio/webm" } : undefined;

const started = Date.now();
const result = await analyzeComplaint({ image, audio, note });
console.log(`total ${Date.now() - started} ms`, JSON.stringify(result.attempts));
if (result.ok) {
  console.log(citizenMessage(result.record));
  console.log(JSON.stringify(result.record, null, 2));
} else {
  console.log("FAILED:", result.reason, citizenMessage(null));
}
