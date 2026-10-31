"use client";

// "Track a report": open the status page for a tracking code (no login).
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function TrackSearch() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [err, setErr] = useState(false);
  return (
    <form
      className="flex w-full max-w-sm gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const c = code.trim().toUpperCase().replace(/^(NN)?-?/, "NN-");
        if (/^NN-[2-9A-Z]{6}$/.test(c)) router.push(`/track/${c}`);
        else setErr(true);
      }}
    >
      <input value={code} onChange={(e) => { setCode(e.target.value); setErr(false); }} placeholder="Tracking code, e.g. NN-QVTYS5" className={`flex-1 rounded-md border bg-transparent px-3 py-2 text-sm ${err ? "border-red-600" : ""}`} />
      <button className="rounded-md border px-3 py-2 text-sm">Track</button>
    </form>
  );
}
