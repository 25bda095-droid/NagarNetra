-- Reference data: location-neutral, India-wide.
-- Nothing here names a specific place. LGD rows are imported from the official national
-- directory by scripts/import-lgd.ts; categories and routing rules are product logic.

-- Official Local Government Directory units (states, districts, sub-districts, local bodies).
-- Codes are only unique within a level, so the key is (level, lgd_code).
create table public.lgd_units (
  level             text   not null check (level in ('state', 'district', 'subdistrict', 'block', 'local_body')),
  lgd_code          bigint not null,
  name              text   not null,
  name_local        text,
  local_body_type_code integer,            -- e.g. 4 = Municipal Corporation (local bodies only)
  local_body_type   text,                  -- human-readable type name
  state_lgd         integer,
  district_lgd      integer,
  parent_lgd        bigint,                -- next level up where the source gives it
  imported_at       timestamptz not null default now(),
  primary key (level, lgd_code)
);

-- Fuzzy matching on names (trigram index), usually filtered by state first
create index lgd_units_name_trgm on public.lgd_units using gin (lower(name) extensions.gin_trgm_ops);
create index lgd_units_state on public.lgd_units (state_lgd, level);

-- Issue categories the AI can assign. "other_civic" catches real civic problems outside the six.
-- Severity floors live in lib/rules/severity.ts so they can be unit-tested.
create table public.categories (
  code       text primary key,
  labels     jsonb   not null,             -- {"en": "Road damage", ...}
  enabled    boolean not null default true,
  sort_order smallint not null default 100
);

insert into public.categories (code, labels, sort_order) values
  ('road_damage',       '{"en": "Road damage"}',                 10),
  ('garbage',           '{"en": "Garbage"}',                     20),
  ('water_sewer',       '{"en": "Water leak / sewer"}',          30),
  ('streetlight',       '{"en": "Streetlight"}',                 40),
  ('electrical_hazard', '{"en": "Electrical hazard"}',           50),
  ('pollution_burning', '{"en": "Pollution / open burning"}',    60),
  ('other_civic',       '{"en": "Other civic issue"}',           90);

-- India-wide routing rules: category (+ optional subtype + condition) -> type of agency.
-- The lowest priority number that matches wins. The actual body is found by the Authority Finder.
create table public.routing_rules (
  id          bigint generated always as identity primary key,
  category    text not null references public.categories (code),
  subtype     text,                         -- null = any subtype
  condition   jsonb not null default '{}',  -- e.g. {"road_ref_prefix": "NH"}
  agency_type text not null check (agency_type in (
                'national_highway_authority', 'state_pwd', 'local_body', 'water_board',
                'electricity_discom', 'pollution_control_board')),
  priority    smallint not null default 100,
  note        text
);

insert into public.routing_rules (category, subtype, condition, agency_type, priority, note) values
  ('road_damage',       null,            '{"road_ref_prefix": "NH"}', 'national_highway_authority', 10,  'National highway'),
  ('road_damage',       null,            '{"road_ref_prefix": "SH"}', 'state_pwd',                  20,  'State highway'),
  ('road_damage',       null,            '{}',                        'local_body',                 100, 'Any other road'),
  ('garbage',           null,            '{}',                        'local_body',                 100, 'Urban local body or gram panchayat'),
  ('water_sewer',       null,            '{}',                        'water_board',                50,  'Only if a water/sewerage board is found for the place'),
  ('water_sewer',       null,            '{}',                        'local_body',                 100, 'Fallback when no board exists'),
  ('streetlight',       null,            '{}',                        'local_body',                 100, null),
  ('electrical_hazard', null,            '{}',                        'electricity_discom',         100, 'State distribution company'),
  ('pollution_burning', 'waste_burning', '{}',                        'local_body',                 50,  'Waste burning is also a local body matter'),
  ('pollution_burning', null,            '{}',                        'pollution_control_board',    100, 'State pollution control board'),
  ('other_civic',       null,            '{}',                        'local_body',                 100, 'General owner of public spaces; goes to review');
