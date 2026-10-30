-- Live discovery caches. Both start empty and fill themselves from real reports and Explore taps.

-- Everything discovered about a ~100 m cell: OSM boundaries, Nominatim address, LGD match,
-- nearest road, nearby places and government offices.
create table public.places_cache (
  cell_id    text primary key,              -- computed in lib/discovery (rounded lat/lon)
  osm_admin  jsonb,                         -- boundaries containing the point
  nominatim  jsonb,                         -- reverse-geocoded address
  lgd_match  jsonb,                         -- {state:{code,name,score}, district:{...}, local_body:{...}}
  road       jsonb,                         -- {name, highway, ref}
  nearby     jsonb,                         -- schools, hospitals, bus stops within 200 m
  offices    jsonb,                         -- government offices within ~5 km
  fetched_at timestamptz not null default now()
);

-- Self-building registry of responsible authorities, every row with its sources.
create table public.authorities (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  agency_type         text not null,
  level               text not null check (level in ('national', 'state', 'district', 'local')),
  scope_level         text,                 -- LGD level the authority covers (null = national)
  scope_lgd_code      bigint,               -- LGD code of that unit
  state_lgd           integer,
  issue_categories    text[] not null default '{}',
  portal_url          text,
  app_url             text,
  helpline            text,
  email               text,
  source_urls         text[] not null default '{}',
  found_by            text[] not null default '{}',   -- wikidata / osm / search / moderator
  verification_status text not null default 'ai_found'
                      check (verification_status in ('ai_found', 'human_verified', 'rejected')),
  confidence          numeric(3, 2) check (confidence between 0 and 1),
  verified_at         timestamptz,
  verified_by         uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- one cached answer per (agency type, place)
  unique nulls not distinct (agency_type, scope_level, scope_lgd_code)
);

create index authorities_state on public.authorities (state_lgd);
