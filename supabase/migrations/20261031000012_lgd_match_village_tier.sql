-- Local-body matches must be the lowest tier: urban bodies or village panchayats.
-- (A city name like "Dharwad" also names a Zila Panchayat, which is not who fixes a pothole.)
create or replace function public.match_lgd(
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
    -- civic issues belong to the lowest tier: city/municipal bodies or village panchayats,
    -- never district or block panchayats (Zila Parishad, Panchayat Samiti...)
    and (p_level <> 'local_body' or u.tier is null or u.tier = 'village')
    and u.name_core operator(extensions.%) p_core
  order by score desc, u.category nulls last
  limit least(greatest(p_limit, 1), 10);
$$;
