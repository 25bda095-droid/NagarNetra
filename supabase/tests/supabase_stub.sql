-- TEST ONLY. Recreates the small part of Supabase that our migrations depend on
-- (roles, auth schema, storage.buckets, realtime publication) so they can be tested
-- on a plain PostGIS container. Never run this against a real Supabase project.

-- The postgis image pre-installs PostGIS in "public"; Supabase keeps it in "extensions"
drop extension if exists postgis_tiger_geocoder, postgis_topology, fuzzystrmatch, postgis cascade;

create schema if not exists extensions;
create schema if not exists auth;
create schema if not exists storage;

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

grant usage on schema public, extensions, auth to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  raw_app_meta_data  jsonb not null default '{}',
  raw_user_meta_data jsonb not null default '{}'
);

-- Supabase reads the JWT from the request.jwt.claims setting
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid;
$$;
grant execute on function auth.jwt(), auth.uid() to anon, authenticated, service_role;

create table storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[]
);

create publication supabase_realtime;

-- Like Supabase migrations: "extensions" is NOT on the search path, so extension types must be schema-qualified
alter database postgres set search_path = "$user", public;
