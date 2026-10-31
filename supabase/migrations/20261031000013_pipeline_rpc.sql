-- Helpers for the report pipeline (called with the service key only).

-- Earlier reports whose photo is (nearly) the same image: reuse detection.
create function public.similar_photos(p_hash bit(64), p_exclude uuid, p_max_bits integer default 6)
returns table (report_id uuid, bits integer)
language sql stable set search_path = '' as $$
  select r.id, bit_count(r.dhash # p_hash)::int
  from public.reports r
  where r.dhash is not null and r.id <> p_exclude and bit_count(r.dhash # p_hash) <= p_max_bits
  order by 2 limit 5;
$$;

-- Open incidents of the same category near a point, with the signals the merge rule needs.
create function public.merge_candidates(p_lat double precision, p_lon double precision, p_radius_m double precision,
                                        p_category text, p_summary text, p_hash bit(64), p_user uuid)
returns table (incident_id uuid, distance_m double precision, text_sim real, min_bits integer, same_user boolean)
language sql stable set search_path = '' as $$
  select i.id,
         extensions.st_distance(i.point, extensions.st_makepoint(p_lon, p_lat)::extensions.geography),
         extensions.similarity(coalesce(i.summary, ''), coalesce(p_summary, '')),
         (select min(bit_count(r.dhash # p_hash))::int from public.reports r where r.incident_id = i.id and r.dhash is not null and p_hash is not null),
         exists (select 1 from public.reports r where r.incident_id = i.id and r.user_id = p_user)
  from public.incidents i
  where i.category = p_category and not i.hidden and i.status <> 'resolved_verified'
    and extensions.st_dwithin(i.point, extensions.st_makepoint(p_lon, p_lat)::extensions.geography, p_radius_m)
  order by 2 limit 10;
$$;

revoke execute on function public.similar_photos(bit, uuid, integer) from public, anon, authenticated;
revoke execute on function public.merge_candidates(double precision, double precision, double precision, text, text, bit, uuid) from public, anon, authenticated;
grant execute on function public.similar_photos(bit, uuid, integer) to service_role;
grant execute on function public.merge_candidates(double precision, double precision, double precision, text, text, bit, uuid) to service_role;
