"use client";

// Capture -> review. Photo and voice go straight to Supabase Storage via signed URLs, then
// /api/analyze (one AI call) and /api/locate run in parallel for the review screen.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES, type ComplaintRecord } from "@/lib/ai/schema";
import Webcam from "@/components/report/Webcam";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });
import type { PlaceInfo } from "@/lib/discovery/locate";

type Fix = { lat: number; lon: number; accuracy: number };
type Analysis = {
  analysis_id: string;
  status: string;
  message: string | null;
  record: ComplaintRecord | null;
  hazard: boolean;
  low_confidence: boolean;
};

// spoken or typed words that mean "call 112 now", checked before any AI runs
const HAZARD_WORDS = /\b(wire|current|spark|shock|fire|smoke|manhole|collapse|flood|bijli|taar|aag)\b/i;

export async function api<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message ?? `Request failed (${res.status})`);
  return json as T;
}

export async function upload(kind: "photo" | "audio" | "after_photo", file: Blob): Promise<string> {
  const contentType = file.type || (kind === "audio" ? "audio/webm" : "image/jpeg");
  const { path, token } = await api<{ path: string; token: string }>("/api/upload-url", { kind, contentType });
  const { error } = await createClient().storage.from("raw").uploadToSignedUrl(path, token, file, { contentType });
  if (error) throw new Error("Upload failed. Please try again.");
  return path;
}

export default function ReportFlow() {
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fix, setFix] = useState<Fix | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [audio, setAudio] = useState<Blob | null>(null);
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [place, setPlace] = useState<PlaceInfo | null>(null);
  const [pin, setPin] = useState<{ lat: number; lon: number } | null>(null);
  const [capturedAt, setCapturedAt] = useState<string | null>(null);
  const [assisted, setAssisted] = useState(false);
  const [category, setCategory] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [idemKey] = useState(() => crypto.randomUUID());
  const router = useRouter();
  const isPhone = useSyncExternalStore(() => () => {}, () => /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent), () => true);

  function takePhoto(f: File | Blob, at: number) {
    setPhoto(f as File);
    setPreview(URL.createObjectURL(f));
    setCapturedAt(new Date(at).toISOString());
    setAnalysis(null);
  }

  // keep improving the GPS fix while the user is on this screen
  useEffect(() => {
    if (!navigator.geolocation) {
      queueMicrotask(() => setGpsError("This browser has no location access."));
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => setFix({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }),
      (e) => setGpsError(e.code === e.PERMISSION_DENIED ? "Location permission denied." : "Couldn't get your location."),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  async function toggleRecording() {
    if (recording) return recorder.current?.stop();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ["audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setAudio(new Blob(chunks, { type: rec.mimeType.split(";")[0] }));
        setRecording(false);
      };
      rec.start();
      recorder.current = rec;
      setRecording(true);
      setTimeout(() => rec.state === "recording" && rec.stop(), 60_000); // keep voice notes short
    } catch {
      setError("Microphone permission denied.");
    }
  }

  async function analyze() {
    if ((!photo && !assisted) || !fix) return;
    setBusy(true);
    setError(null);
    try {
      const at = pin ?? fix;
      const [photo_path, audio_path] = await Promise.all([photo && !assisted ? upload("photo", photo) : null, audio ? upload("audio", audio) : null]);
      const [a, p] = await Promise.all([
        photo_path || audio_path || note.trim() ? api<Analysis>("/api/analyze", { photo_path, audio_path, note: note.trim() || null }) : Promise.resolve(null),
        api<PlaceInfo>("/api/locate", { lat: at.lat, lon: at.lon }),
      ]);
      setAnalysis(a);
      setPlace(p);
      setCategory(a?.record?.category ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!fix) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await api<{ tracking_code: string }>("/api/reports", {
        analysis_id: analysis?.analysis_id ?? null, idempotency_key: idemKey, mode: assisted ? "assisted" : "live",
        device: isPhone ? "phone" : "laptop", lat: fix.lat, lon: fix.lon, accuracy_m: fix.accuracy, pin,
        captured_at: assisted ? null : capturedAt, category: category || null, note: note.trim() || null,
      });
      router.push(`/track/${r.tracking_code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed.");
      setSubmitting(false);
    }
  }

  const hazard = analysis?.hazard || HAZARD_WORDS.test(note) || category === "electrical_hazard";
  const blocked = analysis?.status === "not_civic" || analysis?.status === "poor_quality";
  const needsPick = !blocked && (!analysis?.record?.category || analysis.low_confidence);

  return (
    <div className="flex flex-col gap-4">
      {hazard && (
        <div className="rounded-lg border border-red-600 bg-red-600/10 p-3 text-sm">
          <strong>Danger to life?</strong> Call <a href="tel:112" className="underline">112</a> now, then report here.
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={assisted} onChange={(e) => { setAssisted(e.target.checked); setAnalysis(null); }} />
        Assisted mode (no photo: describe it by voice or text, marked as assisted)
      </label>

      {!assisted && !isPhone && !preview && <Webcam onCapture={(b) => takePhoto(b, Date.now())} />}

      {!assisted && <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-4 text-center">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Your photo" className="max-h-72 rounded-md object-contain" />
        ) : (
          <span>Take a photo of the problem</span>
        )}
        <span className="text-sm opacity-70">{preview ? "Tap to retake" : isPhone ? "Opens the rear camera" : "Or choose a photo file"}</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) takePhoto(f, f.lastModified); // an old gallery photo gets a lower evidence score
          }}
        />
      </label>}

      <p className="text-sm">
        {fix ? (
          <>
            Location: {fix.lat.toFixed(5)}, {fix.lon.toFixed(5)}{" "}
            <span className={fix.accuracy > 150 ? "text-amber-600" : "opacity-70"}>(±{fix.accuracy} m)</span>
          </>
        ) : (
          (gpsError ?? "Getting your location...")
        )}
      </p>
      {fix && (
        <>
          <MapView center={[fix.lon, fix.lat]} pin={{ ...(pin ?? fix), accuracy: pin ? 10 : fix.accuracy }} onPinMove={(p) => { setPin(p); setPlace(null); }} />
          <p className="-mt-2 text-xs opacity-70">{pin ? "Pin moved by you. " : fix.accuracy > 150 ? "Location is rough: drag the pin to the exact spot. " : "Drag the pin if it's not exactly right. "}</p>
        </>
      )}

      <div className="flex items-center gap-3">
        <button onClick={toggleRecording} className="rounded-md border px-3 py-1.5 text-sm">
          {recording ? "Stop recording" : audio ? "Re-record voice note" : "Add voice note (any language)"}
        </button>
        {audio && !recording && <span className="text-sm opacity-70">Voice note ready</span>}
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={500}
        rows={2}
        placeholder="Optional note"
        className="rounded-md border bg-transparent p-2 text-sm"
      />

      <button
        onClick={analyze}
        disabled={(!photo && !(assisted && (audio || note.trim()))) || !fix || busy || recording}
        className="rounded-md bg-foreground px-4 py-2 text-background disabled:opacity-50"
      >
        {busy ? "Checking photo and location..." : "Check"}
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {analysis && <AnalysisPanel a={analysis} />}
      {place && <PlacePanel p={place} />}

      {place && !blocked && (
        <div className="flex flex-col gap-3 rounded-lg border p-3">
          {needsPick && (
            <label className="flex flex-col gap-1 text-sm">
              {analysis?.record?.category ? "Please confirm the type of problem" : "What kind of problem is it?"}
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-md border bg-transparent p-2">
                <option value="">Choose...</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
              </select>
            </label>
          )}
          <button onClick={submit} disabled={submitting || (needsPick && !category)} className="rounded-md bg-red-600 px-4 py-2 font-medium text-white disabled:opacity-50">
            {submitting ? "Submitting..." : "Submit report"}
          </button>
          <p className="text-xs opacity-60">Your photo is shown publicly with faces and number plates blurred. Your name, email and exact device location are never public.</p>
        </div>
      )}
    </div>
  );
}

function AnalysisPanel({ a }: { a: Analysis }) {
  const r = a.record;
  return (
    <section className="rounded-lg border p-3 text-sm">
      <h2 className="mb-1 font-medium">What we see</h2>
      {a.message && <p className="mb-1 text-amber-700 dark:text-amber-400">{a.message}</p>}
      {r?.is_civic_issue && (
        <>
          <p>
            {(r.category ?? "unknown").replace(/_/g, " ")}
            {r.subtype && ` · ${r.subtype.replace(/_/g, " ")}`} · damage {r.damage_level}
            {a.low_confidence && " · please confirm"}
          </p>
          <p className="opacity-80">{r.summary_en}</p>
          {r.summary_local && <p className="opacity-80">{r.summary_local}</p>}
        </>
      )}
    </section>
  );
}

function PlacePanel({ p }: { p: PlaceInfo }) {
  return (
    <section className="rounded-lg border p-3 text-sm">
      <h2 className="mb-1 font-medium">This location{p.cached && <span className="opacity-60"> (cached)</span>}</h2>
      {!p.in_india && <p className="text-amber-700">This point seems to be outside India.</p>}
      <ul className="flex flex-col gap-0.5">
        {p.admin_chain.map((c) => (
          <li key={c.level}>
            <span className="opacity-60">{c.level.replace("_", " ")}:</span> {c.name}
            {c.lgd_type && <span className="opacity-60"> ({c.lgd_type})</span>}
            {c.lgd_code && <span className="opacity-60"> · LGD {c.lgd_code}</span>}
          </li>
        ))}
      </ul>
      {p.road && (
        <p className="mt-1 opacity-80">
          Road: {p.road.name ?? p.road.ref ?? "unnamed"} ({p.road.highway}, {Math.round(p.road.distance_m)} m)
        </p>
      )}
      {p.warnings.map((w) => (
        <p key={w} className="text-amber-700">{w}</p>
      ))}
    </section>
  );
}
