// Per-report pipeline, run after the response is sent: Evidence -> Understand -> Locate -> Score -> Merge -> Route.
// Each step writes a pipeline_steps row (streamed to the browser as the live trace). Steps never throw out:
// a failed step is logged and the pipeline continues with what it has.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ComplaintRecord } from "@/lib/ai/schema";
import { locate, type PlaceInfo } from "@/lib/discovery/locate";
import { dHash, publicPhoto } from "@/lib/media/image";
import { scoreEvidence, scoreSeverity } from "@/lib/rules/score";
import { routeIncident } from "@/lib/pipeline/route";

type Step = "evidence" | "understand" | "locate" | "score" | "merge" | "route";
type Status = "ok" | "fallback" | "failed" | "skipped";

async function step<T>(db: SupabaseClient, reportId: string, name: Step, fn: () => Promise<{ status?: Status; output: T; sources?: string[]; confidence?: number }>): Promise<T | null> {
  const t = Date.now();
  try {
    const r = await fn();
    await db.from("pipeline_steps").insert({ report_id: reportId, step: name, status: r.status ?? "ok", output: r.output, sources: r.sources ?? [], confidence: r.confidence ?? null, ms: Date.now() - t });
    return r.output;
  } catch (err) {
    console.error(`pipeline ${name}:`, err);
    await db.from("pipeline_steps").insert({ report_id: reportId, step: name, status: "failed", error: (err as Error).message.slice(0, 300), ms: Date.now() - t });
    return null;
  }
}

export async function runPipeline(db: SupabaseClient, reportId: string, lat: number, lon: number) {
  const { data: report } = await db.from("reports").select("*, analyses(photo_path, record, status)").eq("id", reportId).single();
  if (!report) return;
  const analysis = report.analyses as { photo_path: string | null; record: ComplaintRecord | null; status: string } | null;

  // 1 Evidence: reuse check, blurred public copy (EXIF dropped)
  const ev = await step<{ hash: string | null; reused: boolean; public_path: string | null; blurred?: number }>(db, reportId, "evidence", async () => {
    if (!analysis?.photo_path) return { status: "skipped" as Status, output: { hash: null, reused: false, public_path: null } };
    const { data: blob, error } = await db.storage.from("raw").download(analysis.photo_path);
    if (error || !blob) throw new Error("photo missing");
    const raw = Buffer.from(await blob.arrayBuffer());
    const hash = await dHash(raw);
    const { data: same } = await db.rpc("similar_photos", { p_hash: hash, p_exclude: reportId });
    const regions = analysis.record?.sensitive_regions ?? [];
    const public_path = `reports/${reportId}.webp`;
    const up = await db.storage.from("public").upload(public_path, await publicPhoto(raw, regions), { contentType: "image/webp", upsert: true });
    if (up.error) throw new Error(`public photo: ${up.error.message}`);
    await db.from("reports").update({ dhash: hash, photo_path: public_path }).eq("id", reportId);
    return { output: { hash, reused: (same?.length ?? 0) > 0, public_path, blurred: regions.length } };
  });

  // 2 Understand: reuse the analysis from the review screen (no second AI call)
  const record = analysis?.status === "ok" ? analysis.record : null;
  const category: string = report.category ?? record?.category ?? "other_civic";
  await step(db, reportId, "understand", async () => ({
    status: record ? "ok" : "fallback",
    output: { category, subtype: record?.subtype ?? null, summary: record?.summary_en ?? report.ai_summary, from: record ? "ai" : "citizen" },
    confidence: record?.confidence,
  }));
  if (!record) await db.from("reports").update({ status: "pending_analysis" }).eq("id", reportId);

  // 3 Locate
  const place = await step(db, reportId, "locate", async () => {
    const p: PlaceInfo = await locate(db, lat, lon);
    const sources = [...new Set(p.admin_chain.flatMap((c) => c.sources))];
    return { status: p.warnings.length ? "fallback" : "ok", output: p, sources };
  });

  // 4 Score
  const rec = record ?? { category: category as ComplaintRecord["category"], subtype: null, damage_level: "moderate" as const, hazard_flags: [], context_flags: [] };
  const sev = scoreSeverity(rec, place?.road ?? null, place?.nearby ?? null);
  const evidence = scoreEvidence({
    live: report.mode === "live",
    accuracy_m: report.accuracy_m,
    capture_to_submit_s: report.captured_at ? (Date.parse(report.submitted_at) - Date.parse(report.captured_at)) / 1000 : null,
    has_photo: !!analysis?.photo_path,
    image_reused: !!ev?.reused,
    scene_fits_place: record?.location_type === "public_space" && !!place?.in_india,
    corroborated: false,
  });
  await step(db, reportId, "score", async () => ({ output: { severity: sev, evidence } }));
  await db.from("reports").update({ evidence_score: evidence.score, evidence_factors: evidence.factors, status: ev?.reused ? "flagged" : record ? "accepted" : "pending_analysis" }).eq("id", reportId);

  // 5 Merge: D = 0.4 geo + 0.35 image + 0.25 text within clamp(25 + accuracy, 25, 100) m
  const summary = record?.summary_en ?? report.ai_summary ?? "";
  const merged = await step(db, reportId, "merge", async () => {
    const radius = Math.min(100, Math.max(25, 25 + (report.accuracy_m ?? 0)));
    const { data: cands, error } = await db.rpc("merge_candidates", { p_lat: lat, p_lon: lon, p_radius_m: radius, p_category: category, p_summary: summary, p_hash: ev?.hash ?? null, p_user: report.user_id });
    if (error) throw new Error(error.message);
    const scored = (cands ?? []).map((c: { incident_id: string; distance_m: number; text_sim: number; min_bits: number | null; same_user: boolean }) => ({
      ...c,
      D: 0.4 * (1 - c.distance_m / radius) + 0.35 * (c.min_bits == null ? 0.3 : Math.max(0, 1 - c.min_bits / 32)) + 0.25 * c.text_sim,
    })).sort((a: { D: number }, b: { D: number }) => b.D - a.D);
    const best = scored[0];
    if (best && best.D >= 0.55) return { output: { incident_id: best.incident_id as string, D: best.D, same_user: best.same_user as boolean, new: false }, confidence: best.D };
    return { output: { incident_id: null as string | null, D: best?.D ?? 0, same_user: false, new: true } };
  });

  let incidentId = merged?.incident_id ?? null;
  if (incidentId && merged?.same_user) {
    // same citizen, same incident: no extra report, no score boost
    await db.from("reports").update({ status: "rejected", incident_id: null }).eq("id", reportId);
    await db.from("pipeline_steps").insert({ report_id: reportId, step: "merge", status: "skipped", output: { already_reported: incidentId } });
    return;
  }

  const chain = place?.admin_chain ?? [];
  const code = (l: string) => chain.find((c) => c.level === l)?.lgd_code ?? null;
  if (incidentId) {
    const { data: inc } = await db.from("incidents").select("report_count, independent_reporters, severity_score").eq("id", incidentId).single();
    await db.from("reports").update({ incident_id: incidentId }).eq("id", reportId);
    if (inc) await db.from("incidents").update({
      report_count: inc.report_count + 1,
      independent_reporters: inc.independent_reporters + 1,
      ...(sev.score > (inc.severity_score ?? 0) ? { severity_score: sev.score, severity_band: sev.band, severity_factors: sev.factors } : {}),
    }).eq("id", incidentId);
    await db.from("events").insert({ incident_id: incidentId, type: "merged", payload: { reports: (inc?.report_count ?? 0) + 1 }, actor_role: "system" });
    return; // already routed when it was created
  }

  const { data: inc, error } = await db.from("incidents").insert({
    category, subtype: record?.subtype ?? null, other_description: record?.other_description ?? null, summary,
    point: `SRID=4326;POINT(${lon} ${lat})`,
    severity_score: sev.score, severity_band: sev.band, severity_factors: sev.factors,
    state_lgd: code("state"), district_lgd: code("district"), local_body_lgd: code("local_body"),
    ward_name: chain.find((c) => c.level === "ward")?.name ?? null, admin_chain: chain,
    cover_photo_path: ev?.public_path ?? null,
  }).select("id").single();
  if (error || !inc) return console.error("create incident:", error?.message);
  incidentId = inc.id as string;
  await db.from("reports").update({ incident_id: incidentId }).eq("id", reportId);
  await db.from("events").insert({ incident_id: incidentId, type: "created", payload: { category, severity: sev.band }, actor_role: "system" });
  if (sev.band === "critical" || category === "other_civic" || !record) {
    await db.from("review_queue").insert({ ref_type: "incident", ref_id: incidentId, reason: !record ? "analysis_pending" : category === "other_civic" ? "other_civic" : "critical", priority: sev.band === "critical" ? 0 : 50 });
  }

  // 6 Route
  await step(db, reportId, "route", async () => {
    const r = await routeIncident(db, { incidentId: incidentId!, category, subtype: record?.subtype ?? null, place });
    return { status: r.status === "verified" ? "ok" : "fallback", output: r, sources: r.sources, confidence: r.confidence };
  });
}
