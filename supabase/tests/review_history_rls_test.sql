begin;
select plan(20);

select has_table('public', 'review_records', 'review records table exists');
select has_table('public', 'review_events', 'review events table exists');
select has_table('public', 'review_archive_events', 'review archive events table exists');
select has_table('public', 'review_tombstones', 'review tombstones table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.review_records'::regclass), 'review records RLS is enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.review_events'::regclass), 'review events RLS is enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.review_archive_events'::regclass), 'review archive events RLS is enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.review_tombstones'::regclass), 'review tombstones RLS is enabled');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'review-a@example.test', '', now(), now()),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'review-b@example.test', '', now(), now());

insert into public.review_records (user_id, id, data, created_at, updated_at)
values ('22222222-2222-4222-8222-222222222222', 'review-b', '{"id":"review-b"}', '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z');

set local role anon;
select throws_ok($$select * from public.review_records$$, '42501', null, 'anonymous REVIEW select is denied');
select throws_ok(
  $$insert into public.review_records (user_id, id, data, created_at, updated_at) values ('11111111-1111-4111-8111-111111111111', 'anon-review', '{}', now(), now())$$,
  '42501', null, 'anonymous REVIEW insert is denied'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select results_eq(
  $$insert into public.review_records (user_id, id, data, created_at, updated_at) values ('11111111-1111-4111-8111-111111111111', 'review-a', '{"id":"review-a"}', '2026-09-24T01:00:00Z', '2026-09-24T01:00:00Z') returning id$$,
  array['review-a'], 'owner inserts own ReviewRecord'
);
select is((select count(*)::integer from public.review_records where id = 'review-a'), 1, 'owner selects own ReviewRecord');
select throws_ok(
  $$insert into public.review_records (user_id, id, data, created_at, updated_at) values ('22222222-2222-4222-8222-222222222222', 'forged-review', '{}', now(), now())$$,
  '42501', null, 'forged REVIEW user_id insert is denied'
);
select throws_ok($$update public.review_records set data = '{"forged":true}' where id = 'review-a'$$, '42501', null, 'authenticated REVIEW update is denied');
select throws_ok($$delete from public.review_records where id = 'review-a'$$, '42501', null, 'authenticated REVIEW delete is denied');
select results_eq(
  $$insert into public.review_events (user_id, id, data, occurred_at, recorded_at) values ('11111111-1111-4111-8111-111111111111', 'event-a', '{"id":"event-a"}', '2026-09-24T01:01:00Z', '2026-09-24T01:01:00Z') returning id$$,
  array['event-a'], 'owner inserts own REVIEW event'
);
select results_eq(
  $$insert into public.review_archive_events (user_id, id, review_id, data, changed_at) values ('11111111-1111-4111-8111-111111111111', 'archive-a', 'review-a', '{"archived":true}', '2026-09-24T01:02:00Z') returning id$$,
  array['archive-a'], 'owner inserts own archive event'
);
select results_eq(
  $$insert into public.review_tombstones (user_id, review_id, deleted_at) values ('11111111-1111-4111-8111-111111111111', 'deleted-review-a', '2026-09-24T01:03:00Z') returning review_id$$,
  array['deleted-review-a'], 'owner inserts own permanent-delete tombstone'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select is((select count(*)::integer from public.review_records where id = 'review-a'), 0, 'cross-user REVIEW select returns no rows');
select is((select count(*)::integer from public.review_archive_events where review_id = 'review-a'), 0, 'cross-user archive state is hidden');

select * from finish();
rollback;
