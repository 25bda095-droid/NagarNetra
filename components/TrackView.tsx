"use client";

// Public status of a report: live agent trace (polled while the pipeline runs), incident, timeline,
// and for its reporters: Forwarded / ticket / after-photo verification.
import { useCallback, useEffect, useState } from "react";
import { api, upload } from "@/components/report/ReportFlow";
import { createClient } from "@/lib/supabase/client";
import { SeverityBadge, StatusLabel, StatusStepper, Tip } from "@/components/ui";

type Step = { step: string; status: string; output: Record<string, unknown> | null; sources: string[]; ms: number | null; confidence: number | null; error: string | null };
type Data = {
  code: string | null;
  report_id?: string;
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

  // Live trace: Supabase Realtime pushes each pipeline step to the reporter (RLS allows own reports
  // only). Polling stays as the fallback for everyone else, slower when Realtime is connected.
  const [live, setLive] = useState(false);
  const reportId = d?.report_id;
  useEffect(() => {
    if (!reportId) return;
    const supabase = createClient();
    const ch = supabase
      .channel(`trace-${reportId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "pipeline_steps", filter: `report_id=eq.${reportId}` }, () => void load())
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => void supabase.removeChannel(ch);
  }, [reportId, load]);

  useEffect(() => {
    let n = 0;
    let t: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const j = await load().catch(() => null);
      const done = !code || j?.trace?.some((s) => s.step === "route" || (s.step === "merge" && s.status === "skipped")) || j?.report?.status === "rejected";
      if (!done && ++n < 40) t = setTimeout(tick, live ? 5000 : 2000);
    };
    t = setTimeout(tick, 0);
    return () => clearTimeout(t);
  }, [load, code, live]);

  async function setStatus(status: string) {
    try {
      await api(`/api/incidents/${d!.incident!.id}/status`, { status, ticket_id: ticket.trim() || null });
      setMsg("Updated.");
      load();
    } catch (e) { setMsg((e as Error).message); }
  }

  const [rerouting, setRerouting] = useState(false);
  async function reroute() {
    setRerouting(true);
    setMsg("Searching official sources again… this can take up to 30 seconds.");
    try {
      const r = await api<{ name: string | null; status: string }>(`/api/incidents/${d!.incident!.id}/reroute`, {});
      setMsg(r.name ? `Found: ${r.name} (${r.status}).` : "Still no authority found. A moderator will look into it.");
      load();
    } catch (e) { setMsg((e as Error).message); }
    setRerouting(false);
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

  if (err) return <div className="card text-danger">{err}</div>;
  if (!d) return <div className="card h-64 animate-pulse" />;
  const inc = d.incident;
  const byStep = new Map(d.trace.map((s) => [s.step, s]));
  const traceDone = d.trace.some((s) => s.step === "route");
  const copy = () => navigator.clipboard?.writeText(location.href).then(() => setMsg("Link copied."));

  return (
    <>
      {d.code && (
        <section className="card nn-rise flex flex-col gap-2">
          <span className="eyebrow">Tracking code</span>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-3xl font-semibold tracking-wider">{d.code}</h1>
            <button className="btn-ghost min-h-9 px-3" onClick={copy}>Copy link</button>
          </div>
          <p className="text-sm text-muted">Save this code. Anyone with it can follow this report, so share it with neighbours or quote it to the authority.</p>
        </section>
      )}

      {inc?.severity_band === "critical" && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm"><b className="text-danger">Danger to life?</b> Call <a href="tel:112" className="font-semibold text-danger underline">112</a>.</div>
      )}

      {d.code && (
        <section className="card flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">AI agent at work</h2>
            {live && !traceDone ? <span className="chip border-ok/40 text-ok">● live</span> : traceDone ? <span className="chip border-ok/40 text-ok">Done</span> : null}
          </div>
          <ol className="relative flex flex-col gap-3 border-l pl-5">
            {STEPS.map((k) => {
              const s = byStep.get(k);
              const dot = !s ? "bg-surface-2 animate-pulse" : s.status === "ok" ? "bg-ok" : s.status === "failed" ? "bg-danger" : s.status === "skipped" ? "bg-muted" : "bg-warn";
              return (
                <li key={k} className={`relative ${s ? "nn-rise" : "opacity-50"}`}>
                  <span className={`absolute top-1.5 -left-[25px] h-2.5 w-2.5 rounded-full ring-4 ring-surface ${dot}`} />
                  <p className="text-sm font-medium">{LABEL[k]}{s?.ms != null && <span className="font-normal text-muted"> · {(s.ms / 1000).toFixed(1)}s</span>}</p>
                  {s && <p className="text-sm text-muted">{summary(s)}</p>}
                  {s?.sources?.length ? <p className="truncate text-xs">{s.sources.slice(0, 3).map((u) => <a key={u} href={u} target="_blank" rel="noreferrer" className="mr-2 text-brand underline">{new URL(u).host}</a>)}</p> : null}
                </li>
              );
            })}
          </ol>
          {byStep.get("merge")?.output?.already_reported ? <Tip>You already reported this problem, so no new report was added. Your earlier report keeps counting.</Tip> : null}
        </section>
      )}

      {inc && (
        <section className="card nn-rise flex flex-col gap-4">
          {inc.cover_photo_path && /* eslint-disable-next-line @next/next/no-img-element */ <img src={photoUrl(String(inc.cover_photo_path))} alt="Reported problem (faces and plates blurred)" className="max-h-80 w-full rounded-xl bg-surface-2 object-cover" />}
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold">{inc.category_label}</h2>
            <SeverityBadge band={inc.severity_band as string} score={inc.severity_score as number} />
            <StatusLabel status={String(inc.status)} />
            <span className="chip">{inc.independent_reporters} reporter{inc.independent_reporters === 1 ? "" : "s"}</span>
          </div>
          <p className="text-sm">{inc.summary}</p>
          <StatusStepper status={String(inc.status)} />
          <div className="rounded-xl bg-surface-2 p-3 text-sm">
            <span className="eyebrow">Responsible authority</span>
            <p className="font-medium">{inc.authority_name ?? "Not found yet: a moderator will review"}</p>
            <p className="text-xs text-muted">
              Routing {inc.routing_status}{inc.routing_confidence != null && ` · confidence ${inc.routing_confidence}`}{inc.authority_verification && ` · ${String(inc.authority_verification).replace("_", " ")}`}
            </p>
            {inc.routing_reason && <p className="text-xs text-muted">{inc.routing_reason}</p>}
            {inc.routing_status !== "verified" && (
              <button onClick={reroute} disabled={rerouting} className="btn-ghost mt-2 min-h-9">
                {rerouting ? "Searching…" : "Search for the authority again"}
              </button>
            )}
          </div>
        </section>
      )}

      {inc && inc.status !== "resolved_verified" && (
        <section className="card flex flex-col gap-3">
          <h2 className="font-semibold">Help get it fixed</h2>
          <ol className="flex flex-col gap-3 text-sm">
            <li className="flex flex-col gap-2">
              <span><b>1. Forward it</b> <span className="text-muted">to the authority above (portal, app or helpline), then add their complaint number here.</span></span>
              <div className="flex gap-2">
                <input value={ticket} onChange={(e) => setTicket(e.target.value)} placeholder="Complaint / ticket ID (optional)" className="input" />
                <button onClick={() => setStatus("forwarded")} className="btn-ghost shrink-0">I forwarded it</button>
              </div>
            </li>
            <li className="flex flex-wrap items-center gap-2"><span className="flex-1"><b>2. Did they respond?</b></span>
              <button onClick={() => setStatus("acknowledged")} className="btn-ghost">Acknowledged</button>
              <button onClick={() => setStatus("resolved_claimed")} className="btn-ghost">They say it&apos;s fixed</button>
            </li>
            <li className="flex flex-col gap-2"><span><b>3. Verify the fix</b> <span className="text-muted">Stand at the spot and take a live photo. The AI compares it with the original.</span></span>
              <label className="btn-primary cursor-pointer">
                Verify with a live photo
                <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && verify(e.target.files[0])} />
              </label>
            </li>
          </ol>
          <p className="text-xs text-muted">Only people who reported this incident can update it.</p>
          {msg && <p className="rounded-xl bg-surface-2 p-3 text-sm">{msg}</p>}
        </section>
      )}

      {d.events.length > 0 && (
        <section className="card flex flex-col gap-2 text-sm">
          <h2 className="font-semibold">Public timeline</h2>
          <ul className="flex flex-col gap-1.5">
            {d.events.map((e, i) => (
              <li key={i} className="flex flex-wrap gap-x-2">
                <span className="w-36 shrink-0 text-xs text-muted tabular-nums">{new Date(e.at).toLocaleString()}</span>
                <span className="capitalize">{e.type.replace(/_/g, " ")}</span>
                <span className="text-xs text-muted">({e.actor_role}){e.payload?.reason ? ` · ${e.payload.reason}` : ""}{e.payload?.authority ? ` · ${e.payload.authority}` : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
