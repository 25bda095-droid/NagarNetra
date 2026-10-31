"use client";

// Shown once before the first report: what is collected, what is public, how to delete.
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Consent() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function agree() {
    setBusy(true);
    const r = await fetch("/api/me/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ consent: true }) });
    if (r.ok) router.refresh(); else setBusy(false);
  }
  return (
    <section className="card nn-rise flex flex-col gap-3 text-sm">
      <h2 className="text-lg font-semibold">Before your first report</h2>
      <p><b>We collect:</b> the photo you take, an optional voice note, and your location at that moment.</p>
      <p><b>Public:</b> the photo with faces and number plates blurred, the problem type and AI summary, the area (local body / ward) and the incident point.</p>
      <p><b>Never public:</b> your name, email, exact device location, voice note and transcript.</p>
      <p>You can delete your account any time from My reports. Your voice notes and transcripts are then deleted and your reports unlinked from you.</p>
      <button onClick={agree} disabled={busy} className="btn-primary">I agree, continue</button>
    </section>
  );
}
