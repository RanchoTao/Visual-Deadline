begin;
select plan(48);

select has_table('public', 'v2_goals', 'v2 goals table exists');
select has_table('public', 'v2_milestones', 'v2 milestones table exists');
select has_table('public', 'v2_tasks', 'v2 tasks table exists');
select has_table('public', 'v2_task_dependencies', 'v2 task dependencies table exists');
select has_table('public', 'v2_import_jobs', 'v2 import jobs table exists');
select has_table('public', 'v2_legacy_entity_refs', 'v2 legacy reference table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.v2_goals'::regclass), 'v2 goals RLS is enabled');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'v2-a@example.test', '', now(), now()),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'v2-b@example.test', '', now(), now());

insert into public.v2_goals (id, user_id, title, status, importance, provenance)
values ('22222222-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'B goal', 'active', 5, '{"origin":"user","actor":"user","confirmation":"user_confirmed"}');
insert into public.v2_milestones (id, user_id, goal_id, title, status, sequence, provenance)
values ('22222222-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', '22222222-0000-4000-8000-000000000001', 'B milestone', 'ready', 0, '{"origin":"user","actor":"user","confirmation":"user_confirmed"}');
insert into public.v2_tasks (id, user_id, goal_id, milestone_id, title, status, importance, progress, actionable, provenance)
values ('22222222-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', '22222222-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'B task', 'ready', 5, 0, true, '{"origin":"user","actor":"user","confirmation":"user_confirmed"}');

set local role anon;
select throws_ok(
  $$select count(*) from public.v2_goals$$,
  '42501', null, 'anonymous goal read is denied'
);
select throws_ok(
  $$insert into public.v2_goals (user_id, title, importance, provenance) values ('11111111-1111-4111-8111-111111111111', 'anon goal', 5, '{}')$$,
  '42501', null, 'anonymous goal insert is denied'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$insert into public.v2_goals (id, user_id, title, status, importance, provenance) values ('11111111-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'A goal', 'active', 8, '{"origin":"user","actor":"user","confirmation":"user_confirmed"}')$$,
  'user A inserts own goal'
);
select is((select count(*)::integer from public.v2_goals where id = '11111111-0000-4000-8000-000000000001'), 1, 'user A reads own goal');
select lives_ok($$update public.v2_goals set title = 'A goal updated' where id = '11111111-0000-4000-8000-000000000001'$$, 'user A updates own goal');
select is((select title from public.v2_goals where id = '11111111-0000-4000-8000-000000000001'), 'A goal updated', 'own goal update is visible');
select lives_ok(
  $$insert into public.v2_goals (id, user_id, title, importance, provenance) values ('11111111-0000-4000-8000-000000000099', '11111111-1111-4111-8111-111111111111', 'temporary', 1, '{}')$$,
  'user A inserts temporary own goal'
);
select lives_ok($$delete from public.v2_goals where id = '11111111-0000-4000-8000-000000000099'$$, 'user A deletes own goal');
select is((select count(*)::integer from public.v2_goals where id = '11111111-0000-4000-8000-000000000099'), 0, 'own goal delete is visible');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select is((select count(*)::integer from public.v2_goals where id = '11111111-0000-4000-8000-000000000001'), 0, 'user B cannot read user A goal');
select lives_ok($$update public.v2_goals set title = 'forged' where id = '11111111-0000-4000-8000-000000000001'$$, 'cross-user goal update exposes no row');
select lives_ok($$delete from public.v2_goals where id = '11111111-0000-4000-8000-000000000001'$$, 'cross-user goal delete exposes no row');

reset role;
select is((select count(*)::integer from public.v2_goals where id = '11111111-0000-4000-8000-000000000001' and title = 'A goal updated'), 1, 'user A goal survived user B update/delete attempts');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select throws_ok(
  $$insert into public.v2_goals (user_id, title, importance, provenance) values ('22222222-2222-4222-8222-222222222222', 'forged owner', 5, '{}')$$,
  '42501', null, 'forged user_id insert is rejected'
);
select lives_ok(
  $$insert into public.v2_milestones (id, user_id, goal_id, title, status, sequence, provenance) values ('11111111-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', '11111111-0000-4000-8000-000000000001', 'A milestone', 'ready', 0, '{}')$$,
  'own milestone under own goal succeeds'
);
select throws_ok(
  $$insert into public.v2_milestones (user_id, goal_id, title, status, sequence, provenance) values ('11111111-1111-4111-8111-111111111111', '22222222-0000-4000-8000-000000000001', 'cross goal', 'ready', 1, '{}')$$,
  '23503', null, 'cross-user milestone to goal is rejected by ownership FK'
);
select lives_ok(
  $$insert into public.v2_tasks (id, user_id, goal_id, milestone_id, title, status, importance, progress, actionable, provenance) values ('11111111-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', '11111111-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000002', 'A task 1', 'ready', 8, 0, true, '{}')$$,
  'own task under own goal and milestone succeeds'
);
select lives_ok(
  $$insert into public.v2_tasks (id, user_id, goal_id, title, status, importance, progress, actionable, provenance) values ('11111111-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', '11111111-0000-4000-8000-000000000001', 'A task 2', 'ready', 7, 0, true, '{}')$$,
  'second own task succeeds'
);
select throws_ok(
  $$insert into public.v2_tasks (user_id, goal_id, title, status, importance, progress, actionable, provenance) values ('11111111-1111-4111-8111-111111111111', '22222222-0000-4000-8000-000000000001', 'cross goal task', 'ready', 5, 0, true, '{}')$$,
  '23503', null, 'cross-user task to goal is rejected'
);
select throws_ok(
  $$insert into public.v2_tasks (user_id, goal_id, milestone_id, title, status, importance, progress, actionable, provenance) values ('11111111-1111-4111-8111-111111111111', '11111111-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'cross milestone task', 'ready', 5, 0, true, '{}')$$,
  '23503', null, 'cross-user task to milestone is rejected'
);
select throws_ok(
  $$insert into public.v2_tasks (user_id, parent_task_id, title, status, importance, progress, actionable, provenance) values ('11111111-1111-4111-8111-111111111111', '22222222-0000-4000-8000-000000000003', 'cross parent task', 'ready', 5, 0, true, '{}')$$,
  '23503', null, 'cross-user parent task is rejected'
);
select lives_ok(
  $$insert into public.v2_task_dependencies (id, user_id, predecessor_task_id, successor_task_id, provenance) values ('11111111-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', '11111111-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000004', '{}')$$,
  'own task dependency succeeds'
);
select throws_ok(
  $$insert into public.v2_task_dependencies (user_id, predecessor_task_id, successor_task_id, provenance) values ('11111111-1111-4111-8111-111111111111', '11111111-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000004', '{}')$$,
  '23505', null, 'duplicate dependency is rejected'
);
select throws_ok(
  $$insert into public.v2_task_dependencies (user_id, predecessor_task_id, successor_task_id, provenance) values ('11111111-1111-4111-8111-111111111111', '11111111-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000003', '{}')$$,
  '23514', null, 'self dependency is rejected'
);
select throws_ok(
  $$insert into public.v2_task_dependencies (user_id, predecessor_task_id, successor_task_id, provenance) values ('11111111-1111-4111-8111-111111111111', '11111111-0000-4000-8000-000000000003', '22222222-0000-4000-8000-000000000003', '{}')$$,
  '23503', null, 'cross-user dependency is rejected'
);

reset role;
set local role service_role;
select lives_ok(
  $$insert into public.v2_import_jobs (id, user_id, source_system, source_schema_version, client_request_id) values ('11111111-0000-4000-8000-000000000010', '11111111-1111-4111-8111-111111111111', 'visualdeadline-v1', '0.9', 'job-a')$$,
  'service role creates import job'
);
select lives_ok(
  $$insert into public.v2_legacy_entity_refs (id, import_job_id, user_id, source_system, source_schema_version, source_domain, source_entity_type, source_legacy_id, source_checksum) values ('11111111-0000-4000-8000-000000000011', '11111111-0000-4000-8000-000000000010', '11111111-1111-4111-8111-111111111111', 'visualdeadline-v1', '0.9', 'tasks', 'task', 'legacy-task-a', 'fnv:a')$$,
  'service role creates legacy mapping'
);
select throws_ok(
  $$insert into public.v2_legacy_entity_refs (import_job_id, user_id, source_system, source_schema_version, source_domain, source_entity_type, source_legacy_id, source_checksum) values ('11111111-0000-4000-8000-000000000010', '11111111-1111-4111-8111-111111111111', 'visualdeadline-v1', '0.9', 'tasks', 'task', 'legacy-task-a', 'fnv:a')$$,
  '23505', null, 'legacy mapping uniqueness makes retry idempotent'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select is((select count(*)::integer from public.v2_import_jobs), 1, 'user A reads own import job');
select is((select count(*)::integer from public.v2_legacy_entity_refs), 1, 'user A reads own migration mapping');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select is((select count(*)::integer from public.v2_import_jobs), 0, 'user B cannot read user A import job');
select is((select count(*)::integer from public.v2_legacy_entity_refs), 0, 'user B cannot read user A mapping');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select throws_ok(
  $$insert into public.v2_legacy_entity_refs (import_job_id, user_id, source_system, source_schema_version, source_domain, source_entity_type, source_legacy_id, source_checksum) values ('11111111-0000-4000-8000-000000000010', '22222222-2222-4222-8222-222222222222', 'visualdeadline-v1', '0.9', 'tasks', 'task', 'forged', 'fnv:b')$$,
  '42501', null, 'ordinary user cannot forge another user migration mapping'
);
select lives_ok(
  $$insert into public.notifications (id, user_id, type, title, summary, is_read, dedupe_key) values ('11111111-0000-4000-8000-000000000020', '11111111-1111-4111-8111-111111111111', 'SYSTEM', 'Beta', 'Ready', false, 'beta-ready')$$,
  'user A inserts own notification'
);
select lives_ok(
  $$update public.notifications set is_read = true, read_at = now() where id = '11111111-0000-4000-8000-000000000020'$$,
  'user A marks own notification read'
);
select ok((select read_at is not null from public.notifications where id = '11111111-0000-4000-8000-000000000020'), 'notification durable read timestamp is visible');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select is((select count(*)::integer from public.notifications where id = '11111111-0000-4000-8000-000000000020'), 0, 'user B cannot read user A notification');
select lives_ok($$update public.notifications set title = 'forged' where id = '11111111-0000-4000-8000-000000000020'$$, 'cross-user notification update exposes no row');

reset role;
select is((select count(*)::integer from public.notifications where id = '11111111-0000-4000-8000-000000000020' and is_read and read_at is not null and title = 'Beta'), 1, 'notification remains owned and read after cross-user attempt');

set local role service_role;
select lives_ok(
  $$insert into public.v2_legacy_entity_refs (import_job_id, user_id, source_system, source_schema_version, source_domain, source_entity_type, source_legacy_id, source_checksum, status) values ('11111111-0000-4000-8000-000000000010', '11111111-1111-4111-8111-111111111111', 'visualdeadline-v1', '0.9', 'goals', 'goal', 'legacy-goal-a', 'fnv:c', 'quarantined')$$,
  'service role can record unresolved mapping state'
);
select is((select count(*)::integer from public.v2_legacy_entity_refs where user_id = '11111111-1111-4111-8111-111111111111'), 2, 'service role sees complete mapping audit state');

select * from finish();
rollback;
