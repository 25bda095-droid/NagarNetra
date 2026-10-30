-- Row Level Security.
-- Rule of thumb: the browser can only READ. Every write goes through a Next.js route handler
-- that checks the session and uses the secret key (service_role bypasses RLS).

-- True when the signed-in user's JWT carries app_metadata.role = 'moderator'.
-- app_metadata can only be set by the server/dashboard, never by the user.
create function public.is_moderator()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'moderator', false);
$$;

alter table public.lgd_units      enable row level security;
alter table public.categories     enable row level security;
alter table public.routing_rules  enable row level security;
alter table public.places_cache   enable row level security;
alter table public.authorities    enable row level security;
alter table public.profiles       enable row level security;
alter table public.analyses       enable row level security;
alter table public.incidents      enable row level security;
alter table public.reports        enable row level security;
alter table public.pipeline_steps enable row level security;
alter table public.events         enable row level security;
alter table public.verifications  enable row level security;
alter table public.review_queue   enable row level security;
alter table public.rate_limits    enable row level security;
alter table public.ai_usage       enable row level security;

-- Public reference data
create policy "lgd is public"            on public.lgd_units     for select to anon, authenticated using (true);
create policy "categories are public"    on public.categories    for select to anon, authenticated using (true);
create policy "routing rules are public" on public.routing_rules for select to anon, authenticated using (true);

-- Authorities are public (with citations); rejected ones only for moderators
create policy "authorities are public" on public.authorities for select to anon, authenticated
  using (verification_status <> 'rejected' or public.is_moderator());

-- Incidents hold no reporter data, so they are public unless hidden by a moderator
create policy "incidents are public" on public.incidents for select to anon, authenticated
  using (not hidden or public.is_moderator());

-- Own data only
create policy "own profile"  on public.profiles for select to authenticated using (user_id = auth.uid());
create policy "own analyses" on public.analyses for select to authenticated using (user_id = auth.uid());
create policy "own reports, moderators all" on public.reports for select to authenticated
  using (user_id = auth.uid() or public.is_moderator());

-- Live agent trace: only for the owner of the report (and moderators)
create policy "trace of own reports" on public.pipeline_steps for select to authenticated
  using (
    public.is_moderator()
    or exists (select 1 from public.reports r where r.id = report_id and r.user_id = auth.uid())
  );

-- Public timeline, without actor_id (column privileges below)
create policy "events are public" on public.events for select to anon, authenticated using (true);
revoke select on public.events from anon, authenticated;
grant select (id, incident_id, type, payload, actor_role, at) on public.events to anon, authenticated;

-- Moderator-only tables
create policy "moderators read queue"     on public.review_queue  for select to authenticated using (public.is_moderator());
create policy "moderators read ai usage"  on public.ai_usage      for select to authenticated using (public.is_moderator());
create policy "moderators read verifications" on public.verifications for select to authenticated using (public.is_moderator());

-- places_cache and rate_limits: no policies -> server only.
