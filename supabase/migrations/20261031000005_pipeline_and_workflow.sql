-- Pipeline log, public timeline, after-photo checks and the moderator review queue.

-- One row per pipeline step per report. Streamed to the browser as the live agent trace.
create table public.pipeline_steps (
  id         bigint generated always as identity primary key,
  report_id  uuid not null references public.reports (id) on delete cascade,
  step       text not null check (step in ('evidence', 'understand', 'locate', 'score', 'merge', 'route')),
  status     text not null check (status in ('running', 'ok', 'fallback', 'failed', 'skipped')),
  output     jsonb,
  sources    text[] not null default '{}',  -- URLs the step used (shown in the trace)
  model      text,
  ms         integer,
  confidence numeric(3, 2),
  error      text,
  at         timestamptz not null default now()
);

create index pipeline_steps_report on public.pipeline_steps (report_id, at);

-- Append-only public timeline of an incident. actor_id is private (never exposed publicly),
-- otherwise one person's events could be linked into a map of where they go.
create table public.events (
  id          bigint generated always as identity primary key,
  incident_id uuid not null references public.incidents (id) on delete cascade,
  type        text not null,                -- created, merged, routed, forwarded, ticket_added, ...
  payload     jsonb not null default '{}',  -- must never contain user ids or personal data
  actor_role  text not null check (actor_role in ('system', 'ai', 'citizen', 'moderator')),
  actor_id    uuid references auth.users (id) on delete set null,
  at          timestamptz not null default now()
);

create index events_incident on public.events (incident_id, at);

-- After-photo checks for "Resolved - verified".
create table public.verifications (
  id               uuid primary key default gen_random_uuid(),
  incident_id      uuid not null references public.incidents (id) on delete cascade,
  user_id          uuid references auth.users (id) on delete set null,
  after_photo_path text not null,
  distance_m       real,
  ai_verdict       jsonb,                   -- {same_place, fixed, reason}
  passed           boolean not null,
  at               timestamptz not null default now()
);

create index verifications_incident on public.verifications (incident_id);

-- Work for moderators: low-confidence AI, weak evidence, unmapped routing, critical cases, new authorities.
create table public.review_queue (
  id          bigint generated always as identity primary key,
  ref_type    text not null check (ref_type in ('report', 'authority', 'incident')),
  ref_id      uuid not null,
  reason      text not null,
  priority    smallint not null default 100,   -- lower = more urgent (critical = 0)
  decision    text check (decision in ('approved', 'corrected', 'rejected', 'hidden')),
  decided_by  uuid references auth.users (id) on delete set null,
  decided_at  timestamptz,
  created_at  timestamptz not null default now()
);

-- the same open item is never queued twice
create unique index review_queue_open_item on public.review_queue (ref_type, ref_id, reason)
  where decision is null;
create index review_queue_open on public.review_queue (priority, created_at) where decision is null;
