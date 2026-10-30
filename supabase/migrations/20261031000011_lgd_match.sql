-- Fuzzy match a name from OpenStreetMap/Nominatim to official LGD units.
-- p_core must already be normalised with coreName() (lib/discovery/lgd-names.ts).
-- Uses the trigram index on name_core; optional state/district filters keep it fast and precise.
create function public.match_lgd(
  p_level    text,
  p_core     text,
  p_state    integer default null,
  p_district integer default null,
  p_limit    integer default 3
)
returns table (
  lgd_code bigint, name text, local_body_type text, category text, tier text,
  state_lgd integer, district_lgd integer, score real
)
language sql
stable
set search_path = ''
as $$
  select u.lgd_code, u.name, u.local_body_type, u.category, u.tier, u.state_lgd, u.district_lgd,
         extensions.similarity(u.name_core, p_core) as score
  from public.lgd_units u
  where u.level = p_level
    and (p_state is null or u.state_lgd = p_state)
    and (p_district is null or u.district_lgd = p_district)
    and u.name_core operator(extensions.%) p_core
  order by score desc, u.category nulls last
  limit least(greatest(p_limit, 1), 10);
$$;

grant execute on function public.match_lgd(text, text, integer, integer, integer) to anon, authenticated, service_role;
