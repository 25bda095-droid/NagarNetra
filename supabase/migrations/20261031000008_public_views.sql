-- Public numbers for the map, stats page and leaderboards. All computed live from real rows.
-- security_invoker = true: the views obey the caller's RLS (hidden incidents stay hidden).

-- Incidents with readable category and authority names, and plain lat/lon for the map.
create view public.public_incidents with (security_invoker = true) as
select
  i.id,
  i.category,
  c.labels ->> 'en'                    as category_label,
  i.subtype,
  i.other_description,
  i.summary,
  extensions.st_y(i.point::extensions.geometry) as lat,
  extensions.st_x(i.point::extensions.geometry) as lon,
  i.status,
  i.severity_score,
  i.severity_band,
  i.state_lgd,
  i.district_lgd,
  i.local_body_lgd,
  i.ward_name,
  i.admin_chain,
  i.authority_id,
  a.name                               as authority_name,
  a.verification_status                as authority_verification,
  i.routing_confidence,
  i.routing_status,
  i.routing_reason,
  i.independent_reporters,
  i.report_count,
  i.cover_photo_path,
  i.created_at,
  i.updated_at,
  i.resolved_at
from public.incidents i
join public.categories c on c.code = i.category
left join public.authorities a on a.id = i.authority_id;

-- One-row summary for the stats page. An incident counts as overdue after 7 days unresolved.
create view public.public_stats with (security_invoker = true) as
select
  coalesce(sum(report_count), 0)::bigint                                      as total_reports,
  count(*)                                                                    as total_incidents,
  count(*) filter (where status in ('open', 'forwarded', 'acknowledged', 'reopened')) as open_incidents,
  count(*) filter (where status in ('open', 'forwarded', 'acknowledged', 'reopened')
                     and created_at < now() - interval '7 days')              as overdue_incidents,
  count(*) filter (where status = 'resolved_claimed')                         as resolved_claimed,
  count(*) filter (where status = 'resolved_verified')                        as resolved_verified,
  round((percentile_cont(0.5) within group (
          order by extract(epoch from resolved_at - created_at) / 3600)
        filter (where status = 'resolved_verified'))::numeric, 1)             as median_hours_to_verified_fix,
  count(distinct state_lgd)                                                   as states_covered,
  count(distinct local_body_lgd)                                              as local_bodies_covered,
  (select count(*) from public.authorities where verification_status = 'ai_found')       as authorities_ai_found,
  (select count(*) from public.authorities where verification_status = 'human_verified') as authorities_human_verified
from public.incidents;

-- Breakdowns
create view public.stats_by_category with (security_invoker = true) as
select i.category, c.labels ->> 'en' as category_label,
       count(*) as incidents,
       count(*) filter (where i.status = 'resolved_verified') as resolved_verified
from public.incidents i
join public.categories c on c.code = i.category
group by i.category, c.labels;

create view public.stats_by_state with (security_invoker = true) as
select i.state_lgd, s.name as state_name,
       count(*) as incidents,
       count(*) filter (where i.status = 'resolved_verified') as resolved_verified,
       count(distinct i.local_body_lgd) as local_bodies
from public.incidents i
left join public.lgd_units s on s.level = 'state' and s.lgd_code = i.state_lgd
group by i.state_lgd, s.name;

-- Accountability leaderboard (the main one): places, ranked by verified fixes.
-- A place needs at least 3 incidents to be ranked, so one lucky fix doesn't top the table.
create view public.place_leaderboard with (security_invoker = true) as
select i.local_body_lgd, lb.name as local_body_name, lb.local_body_type, i.state_lgd,
       count(*) as incidents,
       count(*) filter (where i.status = 'resolved_verified') as resolved_verified,
       round(count(*) filter (where i.status = 'resolved_verified')::numeric / count(*), 3) as verified_fix_rate,
       round((percentile_cont(0.5) within group (
               order by extract(epoch from i.resolved_at - i.created_at) / 3600)
             filter (where i.status = 'resolved_verified'))::numeric, 1) as median_hours_to_fix
from public.incidents i
left join public.lgd_units lb on lb.level = 'local_body' and lb.lgd_code = i.local_body_lgd
where i.local_body_lgd is not null
group by i.local_body_lgd, lb.name, lb.local_body_type, i.state_lgd
having count(*) >= 3;

create view public.authority_leaderboard with (security_invoker = true) as
select a.id as authority_id, a.name, a.agency_type, a.verification_status,
       count(*) as incidents,
       count(*) filter (where i.status = 'resolved_verified') as resolved_verified,
       round(count(*) filter (where i.status = 'resolved_verified')::numeric / count(*), 3) as verified_fix_rate
from public.incidents i
join public.authorities a on a.id = i.authority_id
group by a.id, a.name, a.agency_type, a.verification_status
having count(*) >= 3;

-- Citizen leaderboard: opt-in only, nickname + points, nothing else.
-- 10 points per accepted report with at least Moderate evidence (score >= 40),
-- 5 points per passed after-photo check. Security definer because it must count
-- other people's reports, but it only ever returns nickname and points.
create function public.citizen_leaderboard(p_limit integer default 20)
returns table (nickname text, points bigint, reports bigint, verified_fixes bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with r as (
    select user_id, count(*) as n
    from public.reports
    where status = 'accepted' and evidence_score >= 40 and user_id is not null
    group by user_id
  ), v as (
    select user_id, count(*) as n
    from public.verifications
    where passed and user_id is not null
    group by user_id
  )
  select p.nickname,
         coalesce(r.n, 0) * 10 + coalesce(v.n, 0) * 5 as points,
         coalesce(r.n, 0) as reports,
         coalesce(v.n, 0) as verified_fixes
  from public.profiles p
  left join r on r.user_id = p.user_id
  left join v on v.user_id = p.user_id
  where p.leaderboard_opt_in and (r.n is not null or v.n is not null)
  order by points desc, p.nickname
  limit least(greatest(p_limit, 1), 100);
$$;

grant execute on function public.citizen_leaderboard(integer) to anon, authenticated;
