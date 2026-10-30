// POST /api/locate { lat, lon } -> the "This location" panel: administrative chain matched to the
// official directory, nearest road, nearby schools/hospitals/bus stops, government offices.
// Public (used by Explore mode too); rate limited per IP.
import { z } from "zod";
import { clientIp, enforceRateLimits } from "@/lib/guards/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorResponse, HttpError } from "@/lib/http";
import { locate } from "@/lib/discovery/locate";

export const maxDuration = 30;

// generous box around India; the exact check uses the address country
const Body = z.object({
  lat: z.number().min(5).max(38),
  lon: z.number().min(67).max(98),
});

export async function POST(request: Request) {
  try {
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "bad_request", "Send { lat, lon } for a point in India.");
    await enforceRateLimits([{ key: `locate:ip:${await clientIp()}`, windowSeconds: 3600, max: 120 }]);

    const place = await locate(createAdminClient(), parsed.data.lat, parsed.data.lon);
    return Response.json(place);
  } catch (err) {
    return errorResponse(err);
  }
}
