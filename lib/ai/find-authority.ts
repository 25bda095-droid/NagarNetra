// Authority Finder, last step: ask Gemini with Google Search for the official website of a body.
// The answer is only a lead: the caller keeps it only if it is a government domain, the page loads,
// and the page names the place (checked in code, never by feeding the page back to a model).
import "server-only";
import { generateGrounded } from "@/lib/ai/gemini";

const AGENCY_LABEL: Record<string, string> = {
  local_body: "local body (municipal corporation / municipality / gram panchayat)",
  state_pwd: "state Public Works Department",
  electricity_discom: "state electricity distribution company (DISCOM)",
  water_board: "water supply and sewerage board",
  pollution_control_board: "state pollution control board",
  national_highway_authority: "National Highways Authority of India",
};

export type SearchLead = { name: string; url: string; phone: string | null; sources: string[]; model: string };

export async function searchAuthority(
  q: { agency: string; body: string | null; district: string | null; state: string | null },
  onCall?: (model: string) => Promise<unknown>,
): Promise<SearchLead | null> {
  const models = [...new Set([process.env.GEMINI_MODEL_SEARCH, process.env.GEMINI_MODEL_FALLBACK, process.env.GEMINI_MODEL_ANALYZE].filter((m): m is string => !!m))];
  const where = [q.body, q.district && `${q.district} district`, q.state, "India"].filter(Boolean).join(", ");
  const prompt =
    `Find the official government website where citizens can contact or file a complaint with the ${AGENCY_LABEL[q.agency] ?? q.agency} responsible for: ${where}. ` +
    `Only official government sites (gov.in, nic.in or a state government domain). If the body has no own website, give the official site of the district or state body that handles its complaints. ` +
    `Reply with one line of JSON only: {"name": "<official name>", "url": "<https url>", "phone": "<helpline or null>"}. If unsure, reply {"name": null, "url": null, "phone": null}.`;
  for (const model of models) {
    try {
      const r = await generateGrounded(model, prompt, 20000);
      await onCall?.(model);
      const json = r.text.match(/\{[\s\S]*?\}/)?.[0];
      if (!json) return null;
      const v = JSON.parse(json) as { name: string | null; url: string | null; phone: string | null };
      return v.name && v.url ? { name: v.name, url: v.url, phone: v.phone || null, sources: r.sources, model } : null;
    } catch {
      // quota or outage on this model: try the next one
    }
  }
  return null;
}
