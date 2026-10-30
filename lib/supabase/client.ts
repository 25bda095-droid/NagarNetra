// Supabase client for the browser (client components).
// Uses the publishable key, so it can only do what RLS allows: read public data and the user's own rows.
import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

export function createClient() {
  return createBrowserClient(publicEnv.supabaseUrl(), publicEnv.supabasePublishableKey());
}
