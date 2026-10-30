-- Users, AI analyses, incidents and reports.

-- Public-facing profile. Created automatically on sign-up; no email or Google name is copied here.
create table public.profiles (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  nickname           text not null,
  leaderboard_opt_in boolean not null default false,
  consent_at         timestamptz,
  created_at         timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, nickname)
  values (new.id, 'Citizen #' || lpad((floor(random() * 10000))::int::text, 4, '0'));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- One AI analysis per captured photo, made at preview time and reused on submit
-- (so each report costs a single model call). Private: holds the raw transcript.
create table public.analyses (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  photo_path    text,                       -- raw upload in the private bucket
  audio_path    text,
  transcript    text,
  language      text,
  record        jsonb,                      -- validated ComplaintRecord
  provider      text,                       -- gemini / groq
  model         text,
  ai_confidence numeric(3, 2),
  status        text not null default 'pending'
                check (status in ('ok', 'not_civic', 'poor_quality', 'pending')),
  created_at    timestamptz not null default now()
);

create index analyses_user on public.analyses (user_id, created_at desc);

-- An incident is one real-world problem; several reports can merge into it.
create table public.incidents (
  id                    uuid primary key default gen_random_uuid(),
  category              text not null references public.categories (code),
  subtype               text,
  other_description     text,               -- AI description when category = other_civic
  summary               text,               -- public AI summary
  point                 extensions.geography(Point, 4326) not null,
  status                text not null default 'open'
                        check (status in ('open', 'forwarded', 'acknowledged',
                                          'resolved_claimed', 'resolved_verified', 'reopened')),
  hidden                boolean not null default false,   -- set by moderators for abuse
  severity_score        smallint check (severity_score between 0 and 100),
  severity_band         text check (severity_band in ('low', 'medium', 'high', 'critical')),
  severity_factors      jsonb,
  state_lgd             integer,
  district_lgd          integer,
  local_body_lgd        bigint,
  ward_name             text,
  admin_chain           jsonb,              -- state -> district -> ... with sources
  authority_id          uuid references public.authorities (id) on delete set null,
  routing_confidence    numeric(3, 2) check (routing_confidence between 0 and 1),
  routing_status        text not null default 'pending'
                        check (routing_status in ('pending', 'verified', 'partial', 'unmapped')),
  routing_reason        text,
  independent_reporters integer not null default 1,
  report_count          integer not null default 1,
  ticket_id             text,
  cover_photo_path      text,               -- blurred photo in the public bucket
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  resolved_at           timestamptz
);

create index incidents_point on public.incidents using gist (point);
create index incidents_status on public.incidents (status) where not hidden;
create index incidents_local_body on public.incidents (local_body_lgd);
create index incidents_state on public.incidents (state_lgd);
create index incidents_summary_trgm on public.incidents using gin (summary extensions.gin_trgm_ops);

-- Short human-friendly tracking code, e.g. NN-7K3Q9P (no 0/O/1/I/L to avoid confusion).
create function public.generate_tracking_code()
returns text
language sql
volatile
as $$
  select 'NN-' || string_agg(substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + floor(random() * 31)::int, 1), '')
  from generate_series(1, 6);
$$;

-- A single submission by a citizen.
create table public.reports (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users (id) on delete set null,   -- null after account deletion
  analysis_id      uuid references public.analyses (id) on delete set null,
  incident_id      uuid references public.incidents (id) on delete set null,
  tracking_code    text not null unique default public.generate_tracking_code(),
  idempotency_key  text not null unique,    -- sent by the browser; a retried submit can't duplicate
  mode             text not null check (mode in ('live', 'assisted')),
  device           text not null default 'unknown' check (device in ('phone', 'laptop', 'tablet', 'unknown')),
  category         text references public.categories (code),
  ai_summary       text,
  photo_path       text,                    -- blurred photo in the public bucket
  device_point     extensions.geography(Point, 4326),  -- where the device said it was
  corrected_point  extensions.geography(Point, 4326),  -- where the user moved the pin
  accuracy_m       real,
  location_source  text check (location_source in ('gps', 'network', 'manual_pin')),
  captured_at      timestamptz,
  submitted_at     timestamptz not null default now(),
  dhash            bit(64),                 -- perceptual hash for reuse detection
  evidence_score   smallint check (evidence_score between 0 and 100),
  evidence_factors jsonb,
  status           text not null default 'processing'
                   check (status in ('processing', 'accepted', 'pending_analysis', 'flagged', 'rejected')),
  constraint reports_has_location check (device_point is not null or corrected_point is not null)
);

create index reports_user on public.reports (user_id, submitted_at desc);
create index reports_incident on public.reports (incident_id);
-- one report per person per incident ("You already reported this")
create unique index reports_one_per_user_incident on public.reports (incident_id, user_id)
  where incident_id is not null and user_id is not null;

-- keep updated_at fresh
create function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger incidents_touch before update on public.incidents
  for each row execute function public.touch_updated_at();
create trigger authorities_touch before update on public.authorities
  for each row execute function public.touch_updated_at();
