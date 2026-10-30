-- Extra LGD columns for the importer (B2) and a record of where reference data came from.

alter table public.lgd_units
  add column category text check (category in ('urban', 'rural', 'traditional')),  -- local bodies only
  add column tier     text check (tier in ('district', 'intermediate', 'village')), -- rural/traditional tiers
  add column name_core text;                                                        -- name without governance words

-- Live matching compares OSM names with name_core, usually inside one state or district
create index lgd_units_core_trgm on public.lgd_units using gin (name_core extensions.gin_trgm_ops);
create index lgd_units_district on public.lgd_units (district_lgd, level);

-- Where each imported dataset came from and how fresh it is (shown with the data, never hidden)
create table public.data_sources (
  name        text primary key,               -- e.g. 'lgd:urban_local_bodies'
  url         text not null,
  sha256      text,
  observed_on date,                           -- date the source was collected
  rows        integer not null,
  imported_at timestamptz not null default now()
);

alter table public.data_sources enable row level security;
create policy "data sources are public" on public.data_sources for select to anon, authenticated using (true);
