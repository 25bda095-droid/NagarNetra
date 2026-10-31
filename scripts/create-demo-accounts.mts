// Creates (or resets) the shared tester and judge accounts and prints env lines for them.
// Usage: node --env-file=.env.local scripts/create-demo-accounts.mts >> .env.local   (never commit the output)
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)!);
const pass = () => randomBytes(24).toString("base64url");

async function upsert(email: string, role: "tester" | "moderator") {
  const password = pass();
  const { data } = await db.auth.admin.listUsers({ perPage: 1000 });
  const existing = data.users.find((u) => u.email === email);
  const attrs = { password, email_confirm: true, app_metadata: { role } };
  const { error } = existing ? await db.auth.admin.updateUserById(existing.id, attrs) : await db.auth.admin.createUser({ email, ...attrs });
  if (error) throw new Error(`${email}: ${error.message}`);
  return password;
}

const tester = await upsert("tester@nagarnetra.app", "tester");
const judge = await upsert("judge@nagarnetra.app", "moderator");
const code = randomBytes(5).toString("hex").toUpperCase();
console.log(`\n# shared test accounts (scripts/create-demo-accounts.mts)\nTESTER_EMAIL=tester@nagarnetra.app\nTESTER_PASSWORD=${tester}\nJUDGE_EMAIL=judge@nagarnetra.app\nJUDGE_PASSWORD=${judge}\nJUDGE_ACCESS_CODE=${code}`);
