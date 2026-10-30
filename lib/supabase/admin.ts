// Supabase client with the secret key. Bypasses RLS, so it is only used in route handlers
// AFTER the guard in lib/guards/auth.ts has checked who the user is.
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv, serverEnv } from "@/lib/env";

export function createAdminClient() {
  return createClient(publicEnv.supabaseUrl(), serverEnv.supabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
