// Per-user and per-IP rate limits, counted atomically in Postgres (check_rate_limit RPC).
import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { HttpError } from "@/lib/http";

export type Limit = { key: string; windowSeconds: number; max: number };

// Vercel puts the real client address first in x-forwarded-for.
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

// Throws 429 when any limit is exceeded. If the database can't be reached we let the request
// through (and log it): a broken counter must not stop citizens from reporting.
export async function enforceRateLimits(limits: Limit[]): Promise<void> {
  const admin = createAdminClient();
  for (const limit of limits) {
    const { data, error } = await admin.rpc("check_rate_limit", {
      p_key: limit.key,
      p_window_seconds: limit.windowSeconds,
      p_max: limit.max,
    });
    if (error) {
      console.error("rate limit check failed:", error.message);
      continue;
    }
    if (data === false) {
      const minutes = Math.round(limit.windowSeconds / 60);
      throw new HttpError(429, "rate_limited", `Too many requests. Please try again in a while (limit ${limit.max} per ${minutes} min).`);
    }
  }
}
