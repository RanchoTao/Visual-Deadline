begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

select has_table('public', 'beta_applications', 'beta applications table exists');
select has_table('public', 'invite_codes', 'invite codes table exists');
select has_table('public', 'admin_audit_log', 'admin audit log table exists');
select has_table('public', 'ai_usage_events', 'AI usage events table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.beta_applications'::regclass), 'beta applications RLS is enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.invite_codes'::regclass), 'invite codes RLS is enabled');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'beta-a@example.test', '', now(), now()),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'beta-b@example.test', '', now(), now());
insert into public.ai_usage_events (user_id, request_id, provider, model, feature, status)
values ('11111111-1111-4111-8111-111111111111', '11111111-0000-4000-8000-000000000001', 'deepseek', 'test', 'task_analysis', 'succeeded');

set local role anon;
select throws_ok($$insert into public.beta_applications (email, email_hash, name, role, use_case) values ('anon@example.test', repeat('a', 64), '匿名', '学生', '测试')$$, '42501', null, 'anonymous beta application insert is denied');
select throws_ok($$select * from public.invite_codes$$, '42501', null, 'anonymous invite select is denied');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok($$select * from public.admin_roles$$, '42501', null, 'authenticated admin role select is denied');
select is((select count(*)::integer from public.ai_usage_events), 1, 'owner ai usage select is allowed');
select throws_ok($$insert into public.invite_codes (code_hash) values (repeat('b', 64))$$, '42501', null, 'authenticated invite insert is denied');

reset role;
insert into public.account_controls (user_id, status) values ('22222222-2222-4222-8222-222222222222', 'restricted');
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select is((select count(*)::integer from public.account_controls), 0, 'cross-user account control select returns no rows');

reset role;
set local role service_role;
select lives_ok($$insert into public.beta_applications (email, email_hash, name, role, use_case) values ('service@example.test', repeat('c', 64), '服务端', '测试', '测试')$$, 'service role can mutate closed beta operational tables');
select lives_ok($$insert into public.invite_codes (code_hash) values (repeat('d', 64))$$, 'service role can create invite codes');
select lives_ok($$insert into public.admin_audit_log (action, target_type, target_id, request_id) values ('test', 'fixture', 'fixture', '11111111-0000-4000-8000-000000000002')$$, 'service role can append audit records');

select * from finish();
rollback;
