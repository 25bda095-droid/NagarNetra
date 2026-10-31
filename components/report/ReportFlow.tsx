"use client";

// Capture -> review. Photo and voice go straight to Supabase Storage via signed URLs, then
// /api/analyze (one AI call) and /api/locate run in parallel for the review screen.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES, type ComplaintRecord } from "@/lib/ai/schema";
import Webcam from "@/components/report/Webcam";
import Turnstile from "@/components/report/Turnstile";
import { SeverityBadge, Tip } from "@/components/ui";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false, loading: () => <div className="h-64 w-full animate-pulse rounded-xl bg-surface-2" /> });
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
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error(navigator.onLine ? "Couldn't reach NagarNetra. Please try again in a moment." : "You're offline. Check your internet connection and try again.");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message ?? (res.status >= 500 ? "Our server had a problem. Please try again in a minute." : `Request failed (${res.status})`));
  return json as T;
}

// Phone photos are often 5-15 MB: shrink to max 1600 px JPEG before upload (faster on mobile data,
// under the storage limit, and turns iPhone HEIC into JPEG). Orientation is applied by the browser.
async function shrinkPhoto(file: Blob): Promise<Blob> {
  try {
    const img = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    img.close();
    return await new Promise<Blob>((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error("encode"))), "image/jpeg", 0.85));
  } catch {
    return file; // browser can't decode it: upload as is
  }
}

export async function upload(kind: "photo" | "audio" | "after_photo", file: Blob): Promise<string> {
  if (kind !== "audio") file = await shrinkPhoto(file);
  const contentType = file.type || (kind === "audio" ? "audio/webm" : "image/jpeg");
  const { path, token } = await api<{ path: string; token: string }>("/api/upload-url", { kind, contentType });
  const { error } = await createClient().storage.from("raw").uploadToSignedUrl(path, token, file, { contentType });
  if (error) throw new Error(`Upload failed (${error.message}). Please try again.`);
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
  const [turnstile, setTurnstile] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  // what the last check ran on: the same photo/voice/note/spot is never sent to the AI twice
  const [checkedKey, setCheckedKey] = useState<string | null>(null);
  const [photoId, setPhotoId] = useState(0);
  const router = useRouter();
  const isPhone = useSyncExternalStore(() => () => {}, () => /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent), () => true);

  function takePhoto(f: File | Blob, at: number) {
    setPhoto(f as File);
    setPreview(URL.createObjectURL(f));
    setCapturedAt(new Date(at).toISOString());
    setAnalysis(null);
    setPlace(null);
    setPhotoId((n) => n + 1);
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

  const inputKey = `${assisted ? "a" : photoId}|${audio?.size ?? 0}|${note.trim()}|${pin ? `${pin.lat.toFixed(5)},${pin.lon.toFixed(5)}` : "gps"}`;
  const checked = checkedKey === inputKey && !!place;

  async function analyze() {
    if ((!photo && !assisted) || !fix) return;
    if (checked) return setStep(4); // nothing changed since the last check
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
      setCheckedKey(inputKey);
      setStep(4);
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
        captured_at: assisted ? null : capturedAt, category: category || null, note: note.trim() || null, turnstile_token: turnstile,
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
  const hasEvidence = assisted ? !!(audio || note.trim()) : !!photo;
  const STEPS = ["Photo", "Location", "Details", "Review"];

  return (
    <div className="flex flex-col gap-4">
      <ol className="grid grid-cols-4 gap-2" aria-label="Steps">
        {STEPS.map((label, i) => {
          const n = i + 1, done = n < step, here = n === step;
          const reachable = n <= step || (n === 2 && hasEvidence) || (n === 3 && hasEvidence && !!fix) || (n === 4 && checked);
          return (
            <li key={label}>
              <button disabled={!reachable || busy || submitting} onClick={() => setStep(n)} className="flex w-full flex-col gap-1.5 text-left disabled:opacity-50">
                <span className={`h-1.5 rounded-full ${done || here ? "bg-brand" : "bg-surface-2"}`} />
                <span className={`text-xs ${here ? "font-semibold text-ink" : "text-muted"}`}>{n}. {label}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {hazard && (
        <div className="nn-rise rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm">
          <strong className="text-danger">Danger to life?</strong> Call <a href="tel:112" className="font-semibold text-danger underline">112</a> now, then finish this report so it gets fixed.
        </div>
      )}

      {step === 1 && (
        <section className="card nn-rise flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-semibold">{assisted ? "No photo: assisted mode" : "Take a live photo of the problem"}</h2>
            <p className="text-sm text-muted">{assisted ? "You'll describe the problem by voice or text in step 3. Assisted reports are labelled and get a lower evidence score." : "Stand where the problem is and capture it clearly. Downloaded or old photos are not accepted."}</p>
          </div>
          {!assisted && (
            <>
              {preview && /* eslint-disable-next-line @next/next/no-img-element */ <img src={preview} alt="Your photo" className="max-h-80 w-full rounded-xl bg-surface-2 object-contain" />}
              {isPhone ? (
                <label className={preview ? "btn-ghost cursor-pointer" : "btn-primary cursor-pointer py-6 text-base"}>
                  {preview ? "Retake photo" : "Open camera"}
                  <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) takePhoto(f, f.lastModified); /* a gallery photo keeps its old time and is refused on submit */ }} />
                </label>
              ) : (
                <Webcam onCapture={(b) => takePhoto(b, Date.now())} retake={!!preview} />
              )}
              <Tip>Good photos: the whole problem in frame, daylight or flash, one issue per report.</Tip>
            </>
          )}
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={assisted} onChange={(e) => { setAssisted(e.target.checked); setAnalysis(null); setPlace(null); }} />
            I can&apos;t take a photo (assisted mode)
          </label>
          <button className="btn-primary" disabled={!assisted && !photo} onClick={() => setStep(2)}>Continue</button>
        </section>
      )}

      {step === 2 && (
        <section className="card nn-rise flex flex-col gap-3">
          <div>
            <h2 className="text-lg font-semibold">Confirm the exact spot</h2>
            <p className="text-sm text-muted">The red pin is where your device says you are; the shaded circle is how accurate that is.</p>
          </div>
          {fix ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="chip font-mono">{(pin ?? fix).lat.toFixed(5)}, {(pin ?? fix).lon.toFixed(5)}</span>
                <span className={`chip ${fix.accuracy > 150 ? "border-warn/40 text-warn" : "border-ok/40 text-ok"}`}>GPS ±{fix.accuracy} m</span>
                {pin && <button className="text-xs text-brand underline" onClick={() => setPin(null)}>Reset pin</button>}
              </div>
              <div className="h-72 overflow-hidden rounded-xl border sm:h-80">
                <MapView className="h-full w-full" center={[fix.lon, fix.lat]} pin={{ ...(pin ?? fix), accuracy: pin ? 10 : fix.accuracy }} onPinMove={(p) => setPin(p)} />
              </div>
              <Tip>{fix.accuracy > 150 ? "Your location is rough. Drag the pin onto the exact spot (up to a few hundred metres)." : "Looks accurate. Drag the pin only if it's not exactly on the problem."} Use two fingers to move the map.</Tip>
            </>
          ) : (
            <p className={`rounded-xl p-4 text-sm ${gpsError ? "bg-danger/10 text-danger" : "bg-surface-2 text-muted"}`}>
              {gpsError ? `${gpsError} Allow location for this site in your browser settings, then reload.` : "Finding your location… keep this screen open."}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-ghost" onClick={() => setStep(1)}>Back</button>
            <button className="btn-primary" disabled={!fix} onClick={() => setStep(3)}>Continue</button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="card nn-rise flex flex-col gap-3">
          <div>
            <h2 className="text-lg font-semibold">Add details {assisted ? "" : <span className="text-sm font-normal text-muted">(optional)</span>}</h2>
            <p className="text-sm text-muted">Speak in any language: Hindi, Kannada, Tamil, English… The AI understands and translates it.</p>
          </div>
          <button onClick={toggleRecording} className={recording ? "btn-danger" : "btn-ghost"}>
            {recording ? "● Recording… tap to stop" : audio ? "Re-record voice note" : "Record a voice note"}
          </button>
          {audio && !recording && <span className="chip w-fit border-ok/40 text-ok">Voice note ready</span>}
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3}
            placeholder={assisted ? "Describe the problem: what, how big, any danger" : "Anything the photo doesn't show (e.g. 'children fall here daily')"}
            className="input min-h-24 py-2" />
          {error && <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-ghost" onClick={() => setStep(2)} disabled={busy}>Back</button>
            <button className="btn-primary" onClick={analyze} disabled={!hasEvidence || !fix || busy || recording}>
              {busy ? "Checking…" : checked ? "Continue" : "Check with AI"}
            </button>
          </div>
          {busy && <Tip>Reading the photo and finding the jurisdiction. This takes 5–15 seconds.</Tip>}
        </section>
      )}

      {step === 4 && place && (
        <section className="nn-rise flex flex-col gap-3">
          {analysis && <AnalysisPanel a={analysis} />}
          <PlacePanel p={place} />
          {blocked ? (
            <div className="card flex flex-col gap-3">
              <p className="text-sm">This can&apos;t be reported as it is. {analysis?.status === "poor_quality" ? "Please retake the photo." : "If it really is a public civic problem, retake the photo or use assisted mode."}</p>
              <button className="btn-primary" onClick={() => setStep(1)}>Retake photo</button>
            </div>
          ) : (
            <div className="card flex flex-col gap-3">
              {needsPick && (
                <label className="flex flex-col gap-1 text-sm font-medium">
                  {analysis?.record?.category ? "Please confirm the type of problem" : "What kind of problem is it?"}
                  <select value={category} onChange={(e) => setCategory(e.target.value)} className="input">
                    <option value="">Choose…</option>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
                  </select>
                </label>
              )}
              <Turnstile onToken={setTurnstile} />
              {error && <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
              <button onClick={submit} disabled={submitting || (needsPick && !category) || (!!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && !turnstile)} className="btn-primary py-6 text-base">
                {submitting ? "Submitting…" : "Submit report"}
              </button>
              <button className="btn-ghost" onClick={() => setStep(3)} disabled={submitting}>Edit details</button>
              <p className="text-xs text-muted">Public: blurred photo, problem type, summary and area. Never public: your name, email, exact device location and voice note.</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function AnalysisPanel({ a }: { a: Analysis }) {
  const r = a.record;
  return (
    <div className="card flex flex-col gap-2">
      <span className="eyebrow">What the AI sees</span>
      {a.message && <p className="rounded-xl bg-warn/10 p-3 text-sm text-warn">{a.message}</p>}
      {r?.is_civic_issue && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold capitalize">{(r.category ?? "unknown").replace(/_/g, " ")}</h3>
            {r.subtype && <span className="chip">{r.subtype.replace(/_/g, " ")}</span>}
            <SeverityBadge band={{ none: "low", minor: "low", moderate: "medium", major: "high", severe: "critical" }[r.damage_level]} />
            {a.low_confidence && <span className="chip border-warn/40 text-warn">please confirm</span>}
          </div>
          <p className="text-sm">{r.summary_en}</p>
          {r.summary_local && <p className="text-sm text-muted">{r.summary_local}</p>}
        </>
      )}
    </div>
  );
}

function PlacePanel({ p }: { p: PlaceInfo }) {
  return (
    <div className="card flex flex-col gap-2 text-sm">
      <span className="eyebrow">This location {p.cached && "· cached"}</span>
      {!p.in_india && <p className="text-warn">This point seems to be outside India.</p>}
      <ol className="flex flex-col gap-1">
        {p.admin_chain.map((c) => (
          <li key={c.level} className="flex flex-wrap items-baseline gap-x-2">
            <span className="w-24 shrink-0 text-xs text-muted capitalize">{c.level.replace("_", " ")}</span>
            <span className="font-medium">{c.name}</span>
            {c.lgd_type && <span className="text-xs text-muted">{c.lgd_type}</span>}
            {c.lgd_code && <span className="chip px-1.5 font-mono text-[10px]">LGD {c.lgd_code}</span>}
          </li>
        ))}
      </ol>
      {p.road && <p className="text-muted">Road: {p.road.name ?? p.road.ref ?? "unnamed"} · {p.road.highway} · {Math.round(p.road.distance_m)} m</p>}
      {p.warnings.map((w) => <p key={w} className="text-xs text-warn">{w}</p>)}
    </div>
  );
}
