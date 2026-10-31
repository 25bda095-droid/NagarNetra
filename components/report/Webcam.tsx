"use client";

// Live webcam capture for laptops (phones use the rear camera via the file input).
import { useEffect, useRef, useState } from "react";

export default function Webcam({ onCapture }: { onCapture: (photo: Blob) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [on, setOn] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!on) return;
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment", width: 1280 } })
      .then((s) => {
        stream = s;
        if (video.current) video.current.srcObject = s;
      })
      .catch(() => setErr("Camera permission denied or no camera."));
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, [on]);

  function snap() {
    const v = video.current!;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    c.toBlob((b) => b && (onCapture(b), setOn(false)), "image/jpeg", 0.9);
  }

  if (!on) return <button onClick={() => setOn(true)} className="rounded-md border px-3 py-2 text-sm">Use webcam (live photo)</button>;
  return (
    <div className="flex flex-col gap-2">
      {err ? <p className="text-sm text-red-600">{err}</p> : <video ref={video} autoPlay playsInline muted className="rounded-lg" />}
      <div className="flex gap-2">
        <button onClick={snap} disabled={!!err} className="rounded-md bg-foreground px-3 py-1.5 text-sm text-background">Capture</button>
        <button onClick={() => setOn(false)} className="rounded-md border px-3 py-1.5 text-sm">Cancel</button>
      </div>
    </div>
  );
}
