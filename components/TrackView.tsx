"use client";

// Public status of a report: live agent trace (polled while the pipeline runs), incident, timeline,
// and for its reporters: Forwarded / ticket / after-photo verification.
import { useCallback, useEffect, useState } from "react";
import { api, upload } from "@/components/report/ReportFlow";

type Step = { step: string; status: string; output: Record<string, unknown> | null; sources: string[]; ms: number | null; confidence: number | null; error: string | null };
type Data = {
  code: string | null;
  report: null | { status: string; mode: string; category: string | null; evidence_score: number | null; evidence_factors: Record<string, number> | null; photo_path: string | null };
  trace: Step[];
  incident: Record<string, string | number | null> | null;
  events: { type: string; payload: Record<string, unknown>; actor_role: string; at: string }[];
};

const STEPS = ["evidence", "understand", "locate", "score", "merge", "route"];
const LABEL: Record<string, string> = { evidence: "Checking evidence", understand: "Understanding the issue", locate: "Finding the jurisdiction", score: "Scoring severity", merge: "Checking for duplicates", route: "Finding the responsible authority" };
const photoUrl = (p: string) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/public/${p}`;

function summary(s: Step): string {
  const o = s.output ?? {};
  if (s.error) return s.error;
  switch (s.step) {
    case "evidence": return o.reused ? "Photo seen before: flagged" : `New photo${o.blurred ? `, ${o.blurred} face/plate blurred` : ""}`;
    case "understand": return `${String(o.category).replace(/_/g, " ")}${o.from === "citizen" ? " (chosen by you)" : ""}`;
    case "locate": return ((o.admin_chain as { name: string }[] | undefined) ?? []).map((c) => c.name).join(" › ");
    case "score": { const sv = o.severity as { band: string; score: number }; const ev = o.evidence as { band: string; score: number }; return `Severity ${sv?.band} (${sv?.score}) · evidence ${ev?.band} (${ev?.score})`; }
    case "merge": return o.already_reported ? "You already reported this incident" : o.new ? "New incident" : `Merged with an existing incident (D=${Number(o.D).toFixed(2)})`;
    case "route": return o.name ? `${o.name} · ${o.status} (${o.confidence})` : String(o.reason ?? "");
  }
  return s.status;
}

export default function TrackView({ code, incidentId }: { code?: string; incidentId?: string }) {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [ticket, setTicket] = useState("");

  const load = useCallback(() => fetch(code ? `/api/track/${code}` : `/api/incidents/${incidentId}`).then(async (r) => {
    const j = await r.json();
    if (!r.ok) setErr(j.message); else setD(j);
    return j as Data;
  }), [code, incidentId]);

  useEffect(() => {
    let n = 0;
    const tick = async () => {
      const j = await load().catch(() => null);
      const done = !code || j?.trace?.some((s) => s.step === "route" || (s.step === "merge" && s.status === "skipped")) || j?.report?.status === "rejected";
      if (!done && ++n < 40) t = setTimeout(tick, 2000);
    };
    let t = setTimeout(tick, 0);
    return () => clearTimeout(t);
  }, [load]);

  async function setStatus(status: string) {
    try {
      await api(`/api/incidents/${d!.incident!.id}/status`, { status, ticket_id: ticket.trim() || null });
      setMsg("Updated.");
      load();
    } catch (e) { setMsg((e as Error).message); }
  }

  async function verify(f: File) {
    setMsg("Checking the after-photo...");
    navigator.geolocation.getCurrentPosition(async (p) => {
      try {
        const path = await upload("after_photo", f);
        const r = await api<{ passed: boolean; reason: string }>(`/api/incidents/${d!.incident!.id}/verify`, { after_photo_path: path, lat: p.coords.latitude, lon: p.coords.longitude, accuracy_m: p.coords.accuracy });
        setMsg(r.passed ? `Verified fixed: ${r.reason}` : `Not verified, reopened: ${r.reason}`);
        load();
      } catch (e) { setMsg((e as Error).message); }
    }, () => setMsg("Location is needed to verify a fix."), { enableHighAccuracy: true });
  }

  if (err) return <p className="text-red-600">{err}</p>;
  if (!d) return <p className="opacity-60">Loading...</p>;
  const inc = d.incident;
  const byStep = new Map(d.trace.map((s) => [s.step, s]));

  return (
    <>
      {d.code && <div>
        <p className="text-sm opacity-60">Tracking code</p>
        <h1 className="font-mono text-2xl font-semibold">{d.code}</h1>
        <p className="text-xs opacity-60">Anyone with this link can see the status. Share it with neighbours or quote it to the authority.</p>
      </div>}

      {inc?.severity_band === "critical" && <div className="rounded-lg border border-red-600 bg-red-600/10 p-3 text-sm">Danger to life? Call <a href="tel:112" className="underline">112</a>.</div>}

      {d.code && <section className="rounded-lg border p-3 text-sm">
        <h2 className="mb-2 font-medium">AI agent trace</h2>
        <ol className="flex flex-col gap-1.5">
          {STEPS.map((k) => {
            const s = byStep.get(k);
            const icon = !s ? "…" : s.status === "ok" ? "✓" : s.status === "failed" ? "✗" : s.status === "skipped" ? "–" : "≈";
            return (
              <li key={k} className={s ? "" : "opacity-40"}>
                <span className="inline-block w-5">{icon}</span>{LABEL[k]}
                {s && <span className="opacity-70"> · {summary(s)}{s.ms != null && ` · ${(s.ms / 1000).toFixed(1)}s`}</span>}
                {s?.sources?.length ? <span className="ml-5 block truncate text-xs opacity-50">{s.sources.slice(0, 3).map((u) => <a key={u} href={u} target="_blank" rel="noreferrer" className="mr-2 underline">{new URL(u).host}</a>)}</span> : null}
              </li>
            );
          })}
        </ol>
      </section>}

      {inc && (
        <section className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
          {inc.cover_photo_path && /* eslint-disable-next-line @next/next/no-img-element */ <img src={photoUrl(String(inc.cover_photo_path))} alt="Reported problem (blurred)" className="max-h-64 rounded-md object-contain" />}
          <p><b>{inc.category_label}</b> · severity {inc.severity_band} ({inc.severity_score}) · {inc.independent_reporters} reporter(s)</p>
          <p className="opacity-80">{inc.summary}</p>
          <p>Status: <b>{String(inc.status).replace(/_/g, " ")}</b></p>
          <p>Responsible: {inc.authority_name ?? "not found yet"} <span className="opacity-60">({inc.routing_status}{inc.routing_confidence != null && `, confidence ${inc.routing_confidence}`}{inc.authority_verification && `, ${String(inc.authority_verification).replace("_", " ")}`})</span></p>
          {inc.routing_reason && <p className="text-xs opacity-60">{inc.routing_reason}</p>}

          <div className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2">
            <input value={ticket} onChange={(e) => setTicket(e.target.value)} placeholder="Complaint / ticket ID" className="w-40 rounded-md border bg-transparent px-2 py-1" />
            <button onClick={() => setStatus("forwarded")} className="rounded-md border px-2 py-1">I forwarded it</button>
            <button onClick={() => setStatus("acknowledged")} className="rounded-md border px-2 py-1">Authority acknowledged</button>
            <button onClick={() => setStatus("resolved_claimed")} className="rounded-md border px-2 py-1">They say it&apos;s fixed</button>
            <label className="cursor-pointer rounded-md bg-green-700 px-2 py-1 text-white">
              Verify fix with a live photo
              <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && verify(e.target.files[0])} />
            </label>
          </div>
          {msg && <p className="text-xs">{msg}</p>}
        </section>
      )}

      {d.events.length > 0 && (
        <section className="rounded-lg border p-3 text-sm">
          <h2 className="mb-1 font-medium">Timeline</h2>
          <ul className="flex flex-col gap-0.5">
            {d.events.map((e, i) => <li key={i}><span className="opacity-60">{new Date(e.at).toLocaleString()}</span> · {e.type.replace(/_/g, " ")} <span className="opacity-60">({e.actor_role}){e.payload?.reason ? ` · ${e.payload.reason}` : ""}{e.payload?.authority ? ` · ${e.payload.authority}` : ""}</span></li>)}
          </ul>
        </section>
      )}
    </>
  );
}
