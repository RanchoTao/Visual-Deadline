begin;
select plan(8);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('33333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'legacy@example.test', '', now(), now());

insert into public.goals (id, user_id, data)
values ('legacy-goal-text', '33333333-3333-4333-8333-333333333333', '{"title":"legacy goal"}');
insert into public.tasks (id, user_id, data)
values
  ('legacy-task-text', '33333333-3333-4333-8333-333333333333', '{"title":"legacy task"}'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', '{"title":"uuid-shaped legacy text id"}');

select is((select count(*)::integer from public.goals where user_id = '33333333-3333-4333-8333-333333333333'), 1, 'legacy goal row remains available');
select is((select count(*)::integer from public.tasks where user_id = '33333333-3333-4333-8333-333333333333'), 2, 'legacy task rows remain available');
select is((select data->>'title' from public.goals where id = 'legacy-goal-text'), 'legacy goal', 'legacy goal JSONB is unchanged');
select is((select data->>'title' from public.tasks where id = 'legacy-task-text'), 'legacy task', 'legacy task JSONB is unchanged');
select is((select pg_typeof(id)::text from public.tasks where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'text', 'UUID-shaped legacy ID remains text');
select is((select count(*)::integer from public.v2_goals where user_id = '33333333-3333-4333-8333-333333333333'), 0, 'PR E performs no goal backfill');
select is((select count(*)::integer from public.v2_tasks where user_id = '33333333-3333-4333-8333-333333333333'), 0, 'PR E performs no task backfill');
select is((select count(*)::integer from public.v2_legacy_entity_refs where user_id = '33333333-3333-4333-8333-333333333333'), 0, 'PR E performs no mapping writes');

select * from finish();
rollback;
