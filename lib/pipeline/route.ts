// Step 6: rules -> agency type -> authority (cache, else Authority Finder: Wikidata -> OSM offices) ->
// domain check -> routing confidence. Found authorities are saved, so the table builds itself.
// Fetched page content is only checked for names, never fed to a model (prompt-injection guard).
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlaceInfo } from "@/lib/discovery/locate";
import { matchRules, routingConfidence, type AgencyType, type RoutingRule } from "@/lib/rules/score";

const UA = process.env.OSM_USER_AGENT ?? "NagarNetra/0.1";
const STATE_AGENCIES: Record<string, string[]> = {
  state_pwd: ["public works department", "pwd"],
  electricity_discom: ["electricity supply", "power distribution", "vidyut", "electricity distribution", "escom"],
  water_board: ["water supply and sewerage board", "jal board", "water board", "jal nigam"],
  pollution_control_board: ["pollution control board", "pollution control committee"],
  national_highway_authority: ["national highways authority of india"],
};

export const isGovDomain = (url: string) => {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return /(\.|^)(gov\.in|nic\.in|gov)$/.test(h) || /\.(gov|nic)\.in$/.test(h);
  } catch {
    return false;
  }
};

async function pageLoads(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { "User-Agent": UA }, redirect: "follow" });
    return r.ok;
  } catch {
    return false;
  }
}

async function sparql(q: string): Promise<Record<string, { value: string }>[]> {
  const r = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(10000), headers: { "User-Agent": UA, Accept: "application/sparql-results+json" } });
  if (!r.ok) throw new Error(`wikidata HTTP ${r.status}`);
  return (await r.json()).results.bindings;
}

type Found = { name: string; website: string | null; sources: string[]; found_by: string[] };

async function findAuthority(agency: AgencyType, place: PlaceInfo, scopeName: string): Promise<Found | null> {
  if (agency === "local_body") {
    const wd = place.wikidata.local_body;
    if (wd) {
      const rows = await sparql(`SELECT ?l ?site WHERE { wd:${wd} rdfs:label ?l FILTER(lang(?l)="en") OPTIONAL { wd:${wd} wdt:P856 ?site } } LIMIT 1`);
      if (rows[0]) return { name: rows[0].l.value, website: rows[0].site?.value ?? null, sources: [`https://www.wikidata.org/wiki/${wd}`], found_by: ["wikidata"] };
    }
    const office = place.offices.find((o) => o.name && /(municipal|corporation|nagar|panchayat|council|town)/i.test(o.name));
    if (office) return { name: office.name!, website: office.website, sources: [office.source], found_by: ["osm"] };
    return { name: scopeName, website: null, sources: [], found_by: ["lgd"] };
  }
  const words = STATE_AGENCIES[agency];
  const state = place.wikidata.state;
  const filter = words.map((w) => `CONTAINS(LCASE(?l), "${w}")`).join(" || ");
  const scope = agency === "national_highway_authority" ? "" : state ? `?item wdt:P131* wd:${state} .` : "";
  try {
    const rows = await sparql(`SELECT ?item ?l ?site WHERE { ${scope} ?item rdfs:label ?l . FILTER(lang(?l)="en" && (${filter})) ?item wdt:P856 ?site . } LIMIT 5`);
    const row = rows.find((r) => isGovDomain(r.site.value)) ?? rows[0];
    if (row) return { name: row.l.value, website: row.site.value, sources: [row.item.value], found_by: ["wikidata"] };
  } catch (err) {
    console.warn("wikidata:", (err as Error).message);
  }
  const office = place.offices.find((o) => o.name && words.some((w) => o.name!.toLowerCase().includes(w)));
  return office ? { name: office.name!, website: office.website, sources: [office.source], found_by: ["osm"] } : null;
}

export async function routeIncident(db: SupabaseClient, i: { incidentId: string; category: string; subtype: string | null; place: PlaceInfo | null }) {
  const place = i.place;
  const { data: rules } = await db.from("routing_rules").select("*");
  const candidates = matchRules((rules ?? []) as RoutingRule[], i.category, i.subtype, place?.road?.ref ?? null);
  const at = (l: string) => place?.admin_chain.find((c) => c.level === l);
  const lb = at("local_body"), district = at("district"), state = at("state");

  let result: { authority_id: string | null; name: string | null; agency: string | null; status: string; confidence: number; reason: string; sources: string[] } | null = null;
  for (const [rank, rule] of candidates.entries()) {
    const agency = rule.agency_type;
    // scope: local bodies by their LGD unit (district if unmatched), state agencies by state, NHAI national
    const scopeUnit = agency === "local_body" ? (lb?.lgd_code ? lb : district) : agency === "national_highway_authority" ? null : state;
    const scopeLevel = agency === "national_highway_authority" ? null : scopeUnit?.level ?? null;
    const scopeCode = scopeUnit?.lgd_code ?? null;
    if (agency !== "national_highway_authority" && !scopeCode) continue;

    let q = db.from("authorities").select("*").eq("agency_type", agency).neq("verification_status", "rejected");
    q = scopeLevel ? q.eq("scope_level", scopeLevel).eq("scope_lgd_code", scopeCode) : q.is("scope_level", null);
    let { data: auth } = await q.maybeSingle();
    let cacheHit = !!auth;

    if (!auth && place) {
      const f = await findAuthority(agency, place, scopeUnit?.name ?? "");
      if (!f) continue; // e.g. no water board here -> next rule (local body)
      const verified = f.website ? isGovDomain(f.website) && (await pageLoads(f.website)) : false;
      const { data } = await db.from("authorities").upsert({
        name: f.name, agency_type: agency, scope_level: scopeLevel, scope_lgd_code: scopeCode, state_lgd: state?.lgd_code ?? null,
        level: agency === "local_body" ? "local" : agency === "national_highway_authority" ? "national" : "state",
        issue_categories: [i.category], portal_url: verified ? f.website : null, source_urls: [...f.sources, ...(f.website ? [f.website] : [])],
        found_by: f.found_by, verification_status: "ai_found", confidence: verified ? 0.85 : 0.5,
      }, { onConflict: "agency_type,scope_level,scope_lgd_code" }).select("*").single();
      auth = data;
      cacheHit = false;
    }
    if (!auth) continue;
    const jurisdiction = agency === "local_body" ? (lb?.lgd_code ? "local_body" : "district") : state?.lgd_code || agency === "national_highway_authority" ? "local_body" : "none";
    const c = routingConfidence({
      jurisdiction, ruleRank: rank, otherCivic: i.category === "other_civic",
      authority: auth.verification_status === "human_verified" ? "human_verified" : auth.portal_url ? "ai_found" : "none",
    });
    result = { authority_id: auth.id, name: auth.name, agency, ...c, reason: `${rule.note ?? agency}${cacheHit ? " (cached)" : ""}`, sources: auth.source_urls ?? [] };
    break;
  }
  result ??= { authority_id: null, name: null, agency: null, status: "unmapped", confidence: 0, reason: "No authority found for this place yet", sources: [] };

  await db.from("incidents").update({ authority_id: result.authority_id, routing_confidence: result.confidence, routing_status: result.status, routing_reason: result.reason }).eq("id", i.incidentId);
  await db.from("events").insert({ incident_id: i.incidentId, type: "routed", payload: { authority: result.name, status: result.status, confidence: result.confidence }, actor_role: "ai" });
  if (result.status !== "verified") {
    await db.from("review_queue").upsert({ ref_type: "incident", ref_id: i.incidentId, reason: `routing_${result.status}`, priority: 60 }, { ignoreDuplicates: true });
  }
  return result;
}
