"use client";

// Live webcam capture for laptops (phones use the rear camera via the file input).
import { useEffect, useRef, useState } from "react";

export default function Webcam({ onCapture, retake = false }: { onCapture: (photo: Blob) => void; retake?: boolean }) {
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

  if (!on) return <button onClick={() => setOn(true)} className={retake ? "btn-ghost" : "btn-primary py-6 text-base"}>{retake ? "Retake with webcam" : "Open webcam"}</button>;
  return (
    <div className="flex flex-col gap-2">
      {err ? <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{err}</p> : <video ref={video} autoPlay playsInline muted className="w-full rounded-xl bg-black" />}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={snap} disabled={!!err} className="btn-primary">Capture</button>
        <button onClick={() => setOn(false)} className="btn-ghost">Cancel</button>
      </div>
    </div>
  );
}
