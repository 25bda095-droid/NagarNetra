-- Database tests: run by scripts/test-db.sh after all migrations.
-- Each check raises an exception on failure, so the script stops at the first broken rule.

\set ON_ERROR_STOP on

-- Helper: act as a given role / user, like a real Supabase request would
create or replace function pg_temp.act_as(p_role text, p_sub uuid default null, p_app_meta jsonb default '{}')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    case when p_sub is null then '' else json_build_object('sub', p_sub, 'role', p_role, 'app_metadata', p_app_meta)::text end,
    false);
  execute format('set role %I', p_role);
end;
$$;

-- ---------- setup (as the database owner) ----------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'citizen-a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'citizen-b@test.local'),
  ('00000000-0000-0000-0000-00000000000c', 'moderator@test.local');

do $$ begin
  assert (select count(*) from public.profiles) = 3, 'profile trigger did not create profiles';
  assert (select bool_and(nickname ~ '^Citizen #\d{4}$') from public.profiles), 'nickname format wrong';
end $$;

insert into public.incidents (id, category, summary, point, state_lgd, local_body_lgd)
values ('10000000-0000-0000-0000-000000000001', 'road_damage', 'Large pothole near bus stop',
        'SRID=4326;POINT(77.2 28.6)', 7, 999001);
insert into public.incidents (id, category, summary, point, hidden)
values ('10000000-0000-0000-0000-000000000002', 'garbage', 'Spam', 'SRID=4326;POINT(77.3 28.7)', true);

insert into public.analyses (id, user_id, transcript, status)
values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'private words', 'ok');

insert into public.reports (id, user_id, analysis_id, incident_id, idempotency_key, mode, category,
                            device_point, accuracy_m, status, evidence_score)
values ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
        '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
        'idem-1', 'live', 'road_damage', 'SRID=4326;POINT(77.2 28.6)', 12, 'accepted', 75);

insert into public.pipeline_steps (report_id, step, status) values
  ('30000000-0000-0000-0000-000000000001', 'locate', 'ok');
insert into public.events (incident_id, type, actor_role, actor_id)
values ('10000000-0000-0000-0000-000000000001', 'created', 'citizen', '00000000-0000-0000-0000-00000000000a');
insert into public.review_queue (ref_type, ref_id, reason)
values ('incident', '10000000-0000-0000-0000-000000000001', 'critical_unverified');

do $$ begin
  assert (select tracking_code ~ '^NN-[2-9A-HJKMNP-Z]{6}$' from public.reports limit 1), 'tracking code format wrong';
end $$;

-- same user, same incident -> blocked
do $$ begin
  begin
    insert into public.reports (user_id, incident_id, idempotency_key, mode, device_point)
    values ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001',
            'idem-2', 'live', 'SRID=4326;POINT(77.2 28.6)');
    raise exception 'FAIL: same user reported the same incident twice';
  exception when unique_violation then null;
  end;
end $$;

-- a report needs some location
do $$ begin
  begin
    insert into public.reports (idempotency_key, mode) values ('idem-3', 'assisted');
    raise exception 'FAIL: report without location accepted';
  exception when check_violation then null;
  end;
end $$;

-- ---------- citizen B ----------
select pg_temp.act_as('authenticated', '00000000-0000-0000-0000-00000000000b');
do $$ begin
  assert (select count(*) from public.reports) = 0, 'B can see A''s reports';
  assert (select count(*) from public.analyses) = 0, 'B can see A''s analyses';
  assert (select count(*) from public.pipeline_steps) = 0, 'B can see A''s trace';
  assert (select count(*) from public.profiles) = 1, 'B should see only own profile';
  assert (select count(*) from public.incidents) = 1, 'B should see 1 public incident (hidden one excluded)';
  assert (select count(*) from public.review_queue) = 0, 'non-moderator sees review queue';
end $$;

do $$ begin
  begin
    insert into public.reports (idempotency_key, mode, device_point) values ('idem-x', 'live', 'SRID=4326;POINT(1 1)');
    raise exception 'FAIL: browser could insert a report directly';
  exception when insufficient_privilege then null;
  end;
end $$;

do $$ begin
  begin
    perform public.check_rate_limit('x', 60, 5);
    raise exception 'FAIL: browser can call check_rate_limit';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------- citizen A ----------
select pg_temp.act_as('authenticated', '00000000-0000-0000-0000-00000000000a');
do $$ begin
  assert (select count(*) from public.reports) = 1, 'A cannot see own report';
  assert (select count(*) from public.analyses) = 1, 'A cannot see own analysis';
  assert (select count(*) from public.pipeline_steps) = 1, 'A cannot see own trace';
end $$;
reset role;

-- ---------- signed-out visitor ----------
select pg_temp.act_as('anon');
do $$ begin
  assert (select count(*) from public.public_incidents) = 1, 'anon should see 1 incident on the map';
  assert (select lat from public.public_incidents) between 28.59 and 28.61, 'lat conversion wrong';
  assert (select total_incidents from public.public_stats) = 1, 'stats should count 1 visible incident';
  assert (select count(*) from public.reports) = 0, 'anon sees reports';
  assert (select count(*) from public.categories) = 7, 'categories not public';
  assert (select count(*) from public.events) = 1, 'events not public';
end $$;
do $$ begin
  begin
    perform actor_id from public.events;
    raise exception 'FAIL: anon can read events.actor_id';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------- moderator ----------
select pg_temp.act_as('authenticated', '00000000-0000-0000-0000-00000000000c', '{"role": "moderator"}');
do $$ begin
  assert (select count(*) from public.review_queue) = 1, 'moderator cannot see review queue';
  assert (select count(*) from public.incidents) = 2, 'moderator should see hidden incident too';
  assert (select count(*) from public.reports) = 1, 'moderator cannot see reports';
  assert (select count(*) from public.analyses) = 0, 'moderator must not see analyses (raw transcripts)';
end $$;
reset role;

-- ---------- server (secret key) ----------
set role service_role;
do $$
declare ok boolean;
begin
  for i in 1..5 loop
    ok := public.check_rate_limit('test:key', 3600, 5);
    assert ok, format('request %s should be allowed', i);
  end loop;
  assert not public.check_rate_limit('test:key', 3600, 5), '6th request should be refused';
  assert public.record_ai_call('gemini', 'test-model') = 1, 'ai usage first call';
  assert public.record_ai_call('gemini', 'test-model') = 2, 'ai usage second call';
end $$;
reset role;

-- ---------- citizen leaderboard (opt-in only) ----------
update public.profiles set leaderboard_opt_in = true where user_id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.act_as('anon');
do $$ begin
  assert (select count(*) from public.citizen_leaderboard()) = 1, 'leaderboard should list only opted-in A';
  assert (select points from public.citizen_leaderboard()) = 10, 'A should have 10 points';
end $$;
reset role;

-- ---------- delete my account ----------
delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  assert (select user_id from public.reports where id = '30000000-0000-0000-0000-000000000001') is null,
    'report should be unlinked from deleted user';
  assert (select count(*) from public.analyses) = 0, 'analyses (transcripts) should be deleted';
  assert (select count(*) from public.incidents) = 2, 'incidents must survive account deletion';
  assert (select count(*) from public.profiles) = 2, 'profile should be deleted';
end $$;

select 'ALL DATABASE TESTS PASSED' as result;
