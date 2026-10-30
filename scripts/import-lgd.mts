// Imports the official Local Government Directory (every state, district, sub-district, block and
// local body in India) into lgd_units.
//
// Source: daily Parquet exports of lgdirectory.gov.in published at
// https://ramseraph.github.io/opendata/lgd/ (Government Open Data Licence - India).
// Files are verified against the published SHA-256 before use. Nothing is committed to the repo.
//
// Usage: npm run import:lgd        (reads SUPABASE keys from .env.local)
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { parquetReadObjects } from "hyparquet";
import { compressors } from "hyparquet-compressors";
import { coreName } from "../lib/discovery/lgd-names.ts";

const METADATA_URL = "https://ramseraph.github.io/opendata/lgd/data/metadata.json";
const DATASETS = [
  "states",
  "districts",
  "subdistricts",
  "blocks",
  "district_panchayats",
  "urban_local_bodies",
  "statewise_ulbs_coverage",
  "pri_local_bodies",
  "traditional_local_bodies",
] as const;
type DatasetName = (typeof DATASETS)[number];

// Official LGD urban local body type codes (the urban file only carries the code).
const URBAN_TYPE_NAMES: Record<string, string> = {
  "4": "Municipal Corporation",
  "5": "Municipality",
  "6": "Notified Area Council",
  "7": "Town Panchayat",
  "8": "Municipal Council",
  "21": "NCT Municipal Council",
  "24": "City Municipal Council",
  "25": "Town Municipal Council",
};
const PRI_TIER: Record<string, Tier> = { "1": "district", "2": "intermediate", "3": "village" };
const TLB_TIER: Record<string, Tier> = { District: "district", Intermediate: "intermediate", Village: "village" };

type Tier = "district" | "intermediate" | "village";
type Row = Record<string, string | number | bigint | null | undefined>;
type LgdUnit = {
  level: "state" | "district" | "subdistrict" | "block" | "local_body";
  lgd_code: number;
  name: string;
  name_local: string | null;
  local_body_type_code: number | null;
  local_body_type: string | null;
  state_lgd: number | null;
  district_lgd: number | null;
  parent_lgd: number | null;
  category: "urban" | "rural" | "traditional" | null;
  tier: Tier | null;
  name_core: string;
  imported_at: string;
};
type DatasetInfo = { url: string; sha256: string; observed_on: string | null; rows: number };

const BATCH_SIZE = 1000;
const PARALLEL_BATCHES = 4;

// "0", "" and null all mean "no code" in LGD exports
function code(value: Row[string]): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function text(value: Row[string]): string | null {
  const s = value === null || value === undefined ? "" : String(value).trim();
  return s === "" ? null : s;
}

async function fetchMetadata(): Promise<Record<DatasetName, DatasetInfo>> {
  const res = await fetch(METADATA_URL);
  if (!res.ok) throw new Error(`metadata.json: HTTP ${res.status}`);
  const meta = (await res.json()) as {
    datasets: Record<string, { daily?: { file: { url: string; sha256: string }; observed_on: string; rows: number } }>;
  };
  const out = {} as Record<DatasetName, DatasetInfo>;
  for (const name of DATASETS) {
    const daily = meta.datasets[name]?.daily;
    if (!daily) throw new Error(`dataset ${name} missing from metadata`);
    out[name] = { url: daily.file.url, sha256: daily.file.sha256, observed_on: daily.observed_on, rows: daily.rows };
  }
  return out;
}

async function download(name: string, info: DatasetInfo): Promise<Row[]> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(info.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buffer = await res.arrayBuffer();
      const hash = createHash("sha256").update(Buffer.from(buffer)).digest("hex");
      if (hash !== info.sha256) throw new Error("checksum mismatch (incomplete or altered download)");
      const rows = (await parquetReadObjects({ file: buffer, compressors })) as Row[];
      console.log(`  downloaded ${name}: ${rows.length} rows`);
      return rows;
    } catch (err) {
      console.warn(`  ${name} attempt ${attempt} failed: ${(err as Error).message}`);
      if (attempt === 3) throw err;
    }
  }
  throw new Error("unreachable");
}

function buildUnits(data: Record<DatasetName, Row[]>, importedAt: string): LgdUnit[] {
  const units: LgdUnit[] = [];
  const base = { name_local: null, local_body_type_code: null, local_body_type: null, district_lgd: null,
    parent_lgd: null, category: null, tier: null, imported_at: importedAt } as const;

  for (const r of data.states) {
    const name = text(r.state_name)!;
    units.push({ ...base, level: "state", lgd_code: code(r.state_code)!, name, state_lgd: code(r.state_code),
      name_core: coreName(name) });
  }

  for (const r of data.districts) {
    const name = text(r.district_name)!;
    units.push({ ...base, level: "district", lgd_code: code(r.district_code)!, name, state_lgd: code(r.state_code),
      district_lgd: code(r.district_code), parent_lgd: code(r.state_code), name_core: coreName(name) });
  }

  for (const r of data.subdistricts) {
    const name = text(r.subdistrict_name)!;
    units.push({ ...base, level: "subdistrict", lgd_code: code(r.subdistrict_code)!, name,
      state_lgd: code(r.state_code), district_lgd: code(r.district_code), parent_lgd: code(r.district_code),
      name_core: coreName(name) });
  }

  for (const r of data.blocks) {
    const name = text(r.block_name)!;
    units.push({ ...base, level: "block", lgd_code: code(r.block_code)!, name, name_local: text(r.block_name_local),
      state_lgd: code(r.state_code), district_lgd: code(r.district_code), parent_lgd: code(r.district_code),
      name_core: coreName(name) });
  }

  // Urban bodies: district comes from the coverage file (most common district when a body spans several)
  const ulbDistrictVotes = new Map<number, Map<number, number>>();
  for (const r of data.statewise_ulbs_coverage) {
    const lb = code(r.local_body_code);
    const d = code(r.district_code);
    if (!lb || !d) continue;
    const votes = ulbDistrictVotes.get(lb) ?? new Map<number, number>();
    votes.set(d, (votes.get(d) ?? 0) + 1);
    ulbDistrictVotes.set(lb, votes);
  }
  const ulbDistrict = (lb: number) => {
    const votes = ulbDistrictVotes.get(lb);
    if (!votes) return null;
    return [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0];
  };

  for (const r of data.urban_local_bodies) {
    const lb = code(r.local_body_code)!;
    const typeCode = text(r.local_body_type_code);
    const name = text(r.local_body_name)!;
    units.push({ ...base, level: "local_body", lgd_code: lb, name, name_local: text(r.local_body_name_local),
      local_body_type_code: code(typeCode), local_body_type: typeCode ? URBAN_TYPE_NAMES[typeCode] ?? null : null,
      state_lgd: code(r.state_code), district_lgd: ulbDistrict(lb), category: "urban", name_core: coreName(name) });
  }

  // Panchayats: follow parent links up to the district panchayat, which maps to a district
  const dpDistrict = new Map<number, number>();
  for (const r of data.district_panchayats) {
    const dp = code(r.district_panchayat_code);
    const d = code(r.district_code);
    if (dp && d) dpDistrict.set(dp, d);
  }
  const priParent = new Map<number, number | null>();
  for (const r of data.pri_local_bodies) priParent.set(code(r.local_body_code)!, code(r.parent_local_body_code));
  const priDistrict = (lb: number) => {
    let current: number | null = lb;
    for (let hops = 0; current && hops < 4; hops++) {
      const d = dpDistrict.get(current);
      if (d) return d;
      current = priParent.get(current) ?? null;
    }
    return null;
  };

  for (const r of data.pri_local_bodies) {
    const lb = code(r.local_body_code)!;
    const name = text(r.local_body_name)!;
    units.push({ ...base, level: "local_body", lgd_code: lb, name, name_local: text(r.local_body_name_local),
      local_body_type_code: code(r.local_body_type_code), local_body_type: text(r.local_body_type_name),
      state_lgd: code(r.state_code), district_lgd: priDistrict(lb), parent_lgd: code(r.parent_local_body_code),
      category: "rural", tier: PRI_TIER[String(r.local_body_type_code)] ?? null, name_core: coreName(name) });
  }

  for (const r of data.traditional_local_bodies) {
    const name = text(r.local_body_name)!;
    const level = text(r.local_body_level);
    units.push({ ...base, level: "local_body", lgd_code: code(r.local_body_code)!, name,
      name_local: text(r.local_body_name_local), local_body_type: level ? `Traditional (${level})` : "Traditional",
      state_lgd: code(r.state_code),
      parent_lgd: code(r.intermediate_panchayat_code) ?? code(r.district_panchayat_code),
      category: "traditional", tier: level ? TLB_TIER[level] ?? null : null, name_core: coreName(name) });
  }

  // drop rows without a code or name, and duplicates (the same code can appear in two exports)
  const seen = new Set<string>();
  return units.filter((u) => {
    if (!u.lgd_code || !u.name) return false;
    const key = `${u.level}:${u.lgd_code}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (see .env.example)");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  console.log("Reading LGD metadata...");
  const meta = await fetchMetadata();

  console.log("Downloading datasets...");
  const data = {} as Record<DatasetName, Row[]>;
  for (const name of DATASETS) data[name] = await download(name, meta[name]);

  const importedAt = new Date().toISOString();
  const units = buildUnits(data, importedAt);
  const byLevel = units.reduce<Record<string, number>>((acc, u) => ((acc[u.level] = (acc[u.level] ?? 0) + 1), acc), {});
  console.log("Prepared rows:", byLevel);

  console.log(`Upserting ${units.length} rows...`);
  const batches: LgdUnit[][] = [];
  for (let i = 0; i < units.length; i += BATCH_SIZE) batches.push(units.slice(i, i + BATCH_SIZE));
  let done = 0;
  for (let i = 0; i < batches.length; i += PARALLEL_BATCHES) {
    await Promise.all(
      batches.slice(i, i + PARALLEL_BATCHES).map(async (batch) => {
        const { error } = await supabase.from("lgd_units").upsert(batch, { onConflict: "level,lgd_code" });
        if (error) throw new Error(`upsert failed: ${error.message}`);
        done += batch.length;
      }),
    );
    process.stdout.write(`\r  ${done}/${units.length}`);
  }
  process.stdout.write("\n");

  // Units that disappeared from the directory since the last import
  const { error: pruneError, count } = await supabase
    .from("lgd_units")
    .delete({ count: "exact" })
    .lt("imported_at", importedAt);
  if (pruneError) throw new Error(`prune failed: ${pruneError.message}`);
  console.log(`Removed ${count ?? 0} units no longer in the directory`);

  const sources = DATASETS.map((name) => ({
    name: `lgd:${name}`,
    url: meta[name].url,
    sha256: meta[name].sha256,
    observed_on: meta[name].observed_on,
    rows: data[name].length,
    imported_at: importedAt,
  }));
  const { error: srcError } = await supabase.from("data_sources").upsert(sources);
  if (srcError) throw new Error(`data_sources: ${srcError.message}`);

  console.log("LGD import complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
