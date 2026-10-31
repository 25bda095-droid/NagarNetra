-- Pipeline helper tests (merge candidates, reused photos). Run by scripts/test-db.sh after rls_test.sql.
\set ON_ERROR_STOP on
reset role;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'pipe-a@test.local'),
  ('00000000-0000-0000-0000-0000000000d2', 'pipe-b@test.local');

insert into public.incidents (id, category, summary, point) values
  ('00000000-0000-0000-0000-0000000000e1', 'road_damage', 'Large pothole filled with water on the main road',
   extensions.st_makepoint(75.0, 15.45)::extensions.geography);
insert into public.reports (id, user_id, incident_id, idempotency_key, mode, device_point, dhash) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000e1',
   'pipe-test-1', 'live', extensions.st_makepoint(75.0, 15.45)::extensions.geography, repeat('10', 32)::bit(64));

do $$
declare c record;
begin
  -- same spot, same category, near-identical photo, another user -> one candidate, not same user
  select * into c from public.merge_candidates(15.45001, 75.0, 50, 'road_damage', 'pothole with water on main road', (repeat('10', 31) || '11')::bit(64), '00000000-0000-0000-0000-0000000000d2');
  assert c.incident_id = '00000000-0000-0000-0000-0000000000e1', 'nearby incident not found';
  assert not c.same_user, 'other user flagged as same user';
  assert c.min_bits = 1, 'photo distance wrong';
  assert c.distance_m < 5, 'distance wrong';
  assert c.text_sim > 0.3, 'text similarity too low';

  -- the original reporter again -> same_user (app answers "already reported")
  select * into c from public.merge_candidates(15.45, 75.0, 50, 'road_damage', 'pothole', null, '00000000-0000-0000-0000-0000000000d1');
  assert c.same_user, 'same user not detected';

  -- different category or 300 m away -> no candidate (new incident)
  assert not exists (select 1 from public.merge_candidates(15.45, 75.0, 50, 'garbage', 'x', null, null)), 'category ignored';
  assert not exists (select 1 from public.merge_candidates(15.4527, 75.0, 50, 'road_damage', 'x', null, null)), 'radius ignored';

  -- fixed incidents are never merged into
  update public.incidents set status = 'resolved_verified' where id = '00000000-0000-0000-0000-0000000000e1';
  assert not exists (select 1 from public.merge_candidates(15.45, 75.0, 50, 'road_damage', 'x', null, null)), 'merged into a fixed incident';

  -- reused photo detection
  assert exists (select 1 from public.similar_photos((repeat('10', 30) || '0101')::bit(64), '00000000-0000-0000-0000-000000000000')), 'reused photo missed';
  assert not exists (select 1 from public.similar_photos(repeat('01', 32)::bit(64), '00000000-0000-0000-0000-000000000000')), 'different photo flagged';
end $$;

select 'PIPELINE TESTS PASSED' as result;
