begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

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

reset role;
insert into public.beta_existing_users(user_id) values
 ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');
insert into public.admin_roles(user_id,role) values ('11111111-1111-4111-8111-111111111111','owner');

-- Real Auth DB authority; public user_metadata is never preauthorization.
set local role supabase_auth_admin;
select throws_ok($$insert into auth.users(id,email) values ('33333333-3333-4333-8333-333333333331','ungated@example.test')$$,'P0001','BETA_INVITE_REQUIRED','ungated auth user creation is denied');
select throws_ok($$insert into auth.users(id,email,raw_user_meta_data) values ('33333333-3333-4333-8333-333333333332','forged@example.test','{"vd_beta_preauthorized":true}')$$,'P0001','BETA_INVITE_REQUIRED','forged user metadata cannot bypass invite authority');
select lives_ok($$insert into auth.users(id,email,raw_app_meta_data) values ('33333333-3333-4333-8333-333333333333','invited@example.test','{"vd_beta_preauthorized":true}')$$,'trusted admin-created user is allowed');
select lives_ok($$insert into auth.users(id,email,raw_app_meta_data) values ('44444444-4444-4444-8444-444444444444','not-redeemed@example.test','{"vd_beta_preauthorized":true}')$$,'preauthorized auth creation is not workspace admission');
reset role;

-- Replay after every possible prior state never creates another reservation.
insert into public.ai_usage_events(user_id,request_id,provider,model,feature,status) values
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-0000-4000-8000-000000000001','deepseek','test','task_analysis','processing'),
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-0000-4000-8000-000000000002','deepseek','test','task_analysis','rejected'),
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-0000-4000-8000-000000000003','deepseek','test','task_analysis','failed');
set local role service_role;
select throws_ok($$select public.consume_ai_quota('11111111-1111-4111-8111-111111111111','11111111-0000-4000-8000-000000000001','deepseek','test','task_analysis')$$,'P0001','AI_REQUEST_REPLAY','succeeded request cannot reserve quota again');
select throws_ok($$select public.consume_ai_quota('11111111-1111-4111-8111-111111111111','aaaaaaaa-0000-4000-8000-000000000001','deepseek','test','task_analysis')$$,'P0001','AI_REQUEST_REPLAY','processing request cannot reserve quota again');
select throws_ok($$select public.consume_ai_quota('11111111-1111-4111-8111-111111111111','aaaaaaaa-0000-4000-8000-000000000002','deepseek','test','task_analysis')$$,'P0001','AI_REQUEST_REPLAY','rejected request cannot reserve quota again');
select throws_ok($$select public.consume_ai_quota('11111111-1111-4111-8111-111111111111','aaaaaaaa-0000-4000-8000-000000000003','deepseek','test','task_analysis')$$,'P0001','AI_REQUEST_REPLAY','failed request cannot reserve quota again');
select is((select count(*)::integer from public.ai_usage_events),4,'replays preserve exactly original ledger rows');
select ok(public.consume_ai_quota('11111111-1111-4111-8111-111111111111','aaaaaaaa-0000-4000-8000-000000000004','deepseek','test','task_analysis'),'fresh request reserves once');
select throws_ok($$update public.admin_audit_log set action='forged'$$,'42501',null,'backend audit updates are denied');
select throws_ok($$delete from public.admin_audit_log$$,'42501',null,'backend audit deletes are denied');
reset role;

-- Fixtures for product writes/read-only export. Admission alone is not sufficient when banned.
insert into public.tasks(id,user_id,data) values ('beta-task','22222222-2222-4222-8222-222222222222','{"title":"preserved"}');
insert into public.goals(id,user_id,data) values ('beta-goal','22222222-2222-4222-8222-222222222222','{}');
insert into public.profiles(id,user_id) values ('22222222-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222222');
insert into public.life_events(user_id,type,occurred_at) values ('22222222-2222-4222-8222-222222222222','sleep',now());
insert into public.review_records(user_id,id,data,created_at,updated_at) values ('22222222-2222-4222-8222-222222222222','beta-review','{}',now(),now());

-- A newer expired historical control must not hide an older still-live restriction.
update public.account_controls set effective_at=now()-interval '2 days' where user_id='22222222-2222-4222-8222-222222222222';
insert into public.account_controls(user_id,status,effective_at,expires_at) values ('22222222-2222-4222-8222-222222222222','active',now()-interval '1 day',now()-interval '1 hour');
select is((select status from public.account_controls where user_id='22222222-2222-4222-8222-222222222222' and superseded_at is null and effective_at<=now() and (expires_at is null or expires_at>now()) order by effective_at desc,id desc limit 1),'restricted','expired newer control does not hide older live restriction');

-- Force audit failure AFTER other writes to prove statement/transaction rollback.
insert into public.subscriptions(user_id,provider,provider_environment,provider_subscription_id,provider_customer_id,plan_code,catalog_version,status,current_period_start,current_period_end,provider_updated_at)
 values ('22222222-2222-4222-8222-222222222222','paddle','sandbox','sub_fixture','ctm_fixture','vd.plus.monthly.v1','vd-recurring-v1','active',now()-interval '1 day',now()+interval '30 days',now());
create temporary table subscription_before as select to_jsonb(s) data from public.subscriptions s;
create function pg_temp.reject_fixture_audit() returns trigger language plpgsql as $$begin
 if new.request_id='ffffffff-ffff-4fff-8fff-ffffffffffff' then raise exception 'TEST_AUDIT_FAILURE'; end if; return new;
end $$;
create trigger fixture_audit_failure before insert on public.admin_audit_log for each row execute function pg_temp.reject_fixture_audit();
set local role service_role;
select throws_ok($$select public.beta_grant_entitlement('11111111-1111-4111-8111-111111111111','ffffffff-ffff-4fff-8fff-ffffffffffff','22222222-2222-4222-8222-222222222222',now(),now()+interval '7 days','beta','fixture')$$,'P0001','TEST_AUDIT_FAILURE','failed audit rolls back grant transaction');
select is((select count(*)::integer from public.admin_access_grants),0,'failed grant leaves no gift');
select is((select count(*)::integer from public.entitlements),0,'failed grant leaves no entitlement');
select throws_ok($$select public.beta_create_invite('11111111-1111-4111-8111-111111111111','ffffffff-ffff-4fff-8fff-ffffffffffff',repeat('e',64),'VD-EEE',null,1,null,null)$$,'P0001','TEST_AUDIT_FAILURE','failed audit rolls back invite transaction');
select is((select count(*)::integer from public.invite_codes where code_hash=repeat('e',64)),0,'failed invite leaves no active orphan code');
select throws_ok($$select public.beta_transition_account('11111111-1111-4111-8111-111111111111','ffffffff-ffff-4fff-8fff-ffffffffffff','22222222-2222-4222-8222-222222222222','banned','fixture')$$,'P0001','TEST_AUDIT_FAILURE','failed audit rolls back account transition');
select is((select count(*)::integer from public.account_controls where superseded_at is null),2,'failed transition preserves previous controls');
select lives_ok($$select public.beta_grant_entitlement('11111111-1111-4111-8111-111111111111',gen_random_uuid(),'22222222-2222-4222-8222-222222222222',now(),now()+interval '7 days','beta','fixture')$$,'grant and entitlement and audit commit together');
select is((select count(*)::integer from public.admin_access_grants),1,'committed grant exists once');
select is((select count(*)::integer from public.entitlements where source_type='admin_grant'),1,'committed entitlement exists once');
select is((select count(*)::integer from public.admin_audit_log where action='membership_grant'),1,'committed grant audit exists once');
reset role;
insert into public.entitlements(user_id,capability,source_type,source_id,status,valid_from,valid_until,reason)
 select user_id,'vd.plus','subscription',id::text,'active',current_period_start,current_period_end,'recurring_active' from public.subscriptions;
set local role service_role;
select throws_ok($$select public.beta_revoke_entitlement('11111111-1111-4111-8111-111111111111','ffffffff-ffff-4fff-8fff-ffffffffffff',(select id from public.admin_access_grants limit 1),'fixture')$$,'P0001','TEST_AUDIT_FAILURE','failed audit rolls back revoke transaction');
select is((select revoked_at is null from public.admin_access_grants limit 1),true,'failed revoke retains gift');
select is((select status from public.entitlements where source_type='admin_grant' limit 1),'active','failed revoke retains active entitlement');
select lives_ok($$select public.beta_revoke_entitlement('11111111-1111-4111-8111-111111111111',gen_random_uuid(),(select id from public.admin_access_grants limit 1),'fixture')$$,'revoke and audit commit together');
select is((select status from public.entitlements where source_type='admin_grant' limit 1),'revoked','successful revoke disables only gift entitlement');
select is((select count(*)::integer from public.admin_audit_log where action='membership_revoke'),1,'successful revoke has audit');
select lives_ok($$select public.beta_set_feature_flag('11111111-1111-4111-8111-111111111111',gen_random_uuid(),'fixture','global',null,false,'fixture')$$,'flag false first insert succeeds');
select lives_ok($$select public.beta_set_feature_flag('11111111-1111-4111-8111-111111111111',gen_random_uuid(),'fixture','global',null,true,'fixture')$$,'flag false to true succeeds');
select is((select enabled from public.feature_flags where key='fixture'),true,'flag became true');
select lives_ok($$select public.beta_set_feature_flag('11111111-1111-4111-8111-111111111111',gen_random_uuid(),'fixture','global',null,false,'fixture')$$,'flag true to false succeeds');
select is((select enabled from public.feature_flags where key='fixture'),false,'flag became false again');
select is((select count(*)::integer from public.feature_flags where key='fixture'),1,'repeated flag changes keep one row');
reset role;
select is((select to_jsonb(s) from public.subscriptions s),(select data from subscription_before),'admin grant/revoke leaves all Paddle subscription evidence unchanged');
select is((select status from public.entitlements where source_type='subscription'),'active','revoking gift never revokes recurring entitlement');
set local role service_role;
select lives_ok($$select public.beta_create_invite('11111111-1111-4111-8111-111111111111',gen_random_uuid(),repeat('e',64),'VD-EEE',null,1,null,null)$$,'successful invite and audit commit together');
select is((select count(*)::integer from public.invite_codes where code_hash=repeat('e',64)),1,'committed invite exists once');
select is((select count(*)::integer from public.admin_audit_log where action='invite_create'),1,'committed invite audit exists once');
select ok((select not (after_json ? 'code_hash') from public.admin_audit_log where action='invite_create'),'invite audit never exposes secret hash or plaintext');
select lives_ok($$select public.redeem_beta_invite(repeat('e',64),'33333333-3333-4333-8333-333333333333',repeat('f',64),'invite')$$,'trusted registration redeems invite atomically');
select is((select used_count from public.invite_codes where code_hash=repeat('e',64)),1,'redemption consumes invite once');
select throws_ok($$select public.redeem_beta_invite(repeat('e',64),'33333333-3333-4333-8333-333333333333',repeat('f',64),'invite')$$,'P0001',null,'duplicate redemption never consumes twice');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
select ok(public.beta_may_operate(),'redeemed new account receives workspace admission');
reset role;

set local role service_role;
select lives_ok($$select public.beta_transition_account('11111111-1111-4111-8111-111111111111',gen_random_uuid(),'22222222-2222-4222-8222-222222222222','restricted','fixture')$$,'transactional restricted replaces previous control');
select is((select count(*)::integer from public.account_controls where user_id='22222222-2222-4222-8222-222222222222' and superseded_at is null),1,'restricted has one current control');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select is(public.beta_may_operate(),false,'restricted denies workspace authority');
select throws_ok($$insert into public.tasks(id,user_id) values ('denied-restricted','22222222-2222-4222-8222-222222222222')$$,'42501',null,'restricted task insert denied');
select throws_ok($$insert into public.goals(id,user_id) values ('denied-restricted','22222222-2222-4222-8222-222222222222')$$,'42501',null,'restricted goal insert denied');
select throws_ok($$insert into public.life_events(user_id,type,occurred_at) values ('22222222-2222-4222-8222-222222222222','sleep',now())$$,'42501',null,'restricted life event insert denied');
select throws_ok($$insert into public.review_records(user_id,id,data,created_at,updated_at) values ('22222222-2222-4222-8222-222222222222','denied-restricted','{}',now(),now())$$,'42501',null,'restricted review insert denied');
with changed as (update public.tasks set data='{"changed":true}' where id='beta-task' returning id) select is((select count(*)::integer from changed),0,'restricted task update blocked');
with changed as (delete from public.goals where id='beta-goal' returning id) select is((select count(*)::integer from changed),0,'restricted goal delete blocked');
with changed as (update public.profiles set data='{"changed":true}' returning id) select is((select count(*)::integer from changed),0,'restricted profile workspace update blocked');
select is((select count(*)::integer from public.tasks),1,'restricted task export still allowed');
select is((select count(*)::integer from public.review_records),1,'restricted review export still allowed');
select throws_ok($$select public.beta_transition_account('11111111-1111-4111-8111-111111111111',gen_random_uuid(),'22222222-2222-4222-8222-222222222222','active','forged')$$,'42501',null,'restricted cannot self-unban through RPC');
reset role;

set local role service_role;
select lives_ok($$select public.beta_transition_account('11111111-1111-4111-8111-111111111111',gen_random_uuid(),'22222222-2222-4222-8222-222222222222','suspended','fixture')$$,'transactional suspended replaces previous control');
select is((select count(*)::integer from public.account_controls where user_id='22222222-2222-4222-8222-222222222222' and superseded_at is null),1,'suspended has one current control');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select is(public.beta_may_operate(),false,'suspended denies workspace authority');
select throws_ok($$insert into public.tasks(id,user_id) values ('denied-suspended','22222222-2222-4222-8222-222222222222')$$,'42501',null,'suspended task insert denied');
select throws_ok($$insert into public.goals(id,user_id) values ('denied-suspended','22222222-2222-4222-8222-222222222222')$$,'42501',null,'suspended goal insert denied');
select throws_ok($$insert into public.life_events(user_id,type,occurred_at) values ('22222222-2222-4222-8222-222222222222','sleep',now())$$,'42501',null,'suspended life event insert denied');
select throws_ok($$insert into public.review_records(user_id,id,data,created_at,updated_at) values ('22222222-2222-4222-8222-222222222222','denied-suspended','{}',now(),now())$$,'42501',null,'suspended review insert denied');
with changed as (update public.tasks set data='{"changed":true}' where id='beta-task' returning id) select is((select count(*)::integer from changed),0,'suspended task update blocked');
with changed as (delete from public.goals where id='beta-goal' returning id) select is((select count(*)::integer from changed),0,'suspended goal delete blocked');
with changed as (update public.profiles set data='{"changed":true}' returning id) select is((select count(*)::integer from changed),0,'suspended profile workspace update blocked');
select is((select count(*)::integer from public.tasks),1,'suspended task export still allowed');
select is((select count(*)::integer from public.review_records),1,'suspended review export still allowed');
select throws_ok($$select public.beta_transition_account('11111111-1111-4111-8111-111111111111',gen_random_uuid(),'22222222-2222-4222-8222-222222222222','active','forged')$$,'42501',null,'suspended cannot self-unban through RPC');
reset role;

set local role service_role;
select lives_ok($$select public.beta_transition_account('11111111-1111-4111-8111-111111111111',gen_random_uuid(),'22222222-2222-4222-8222-222222222222','banned','fixture')$$,'transactional banned replaces previous control');
select is((select count(*)::integer from public.account_controls where user_id='22222222-2222-4222-8222-222222222222' and superseded_at is null),1,'banned has one current control');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select is(public.beta_may_operate(),false,'banned denies workspace authority');
select throws_ok($$insert into public.tasks(id,user_id) values ('denied-banned','22222222-2222-4222-8222-222222222222')$$,'42501',null,'banned task insert denied');
select throws_ok($$insert into public.goals(id,user_id) values ('denied-banned','22222222-2222-4222-8222-222222222222')$$,'42501',null,'banned goal insert denied');
select throws_ok($$insert into public.life_events(user_id,type,occurred_at) values ('22222222-2222-4222-8222-222222222222','sleep',now())$$,'42501',null,'banned life event insert denied');
select throws_ok($$insert into public.review_records(user_id,id,data,created_at,updated_at) values ('22222222-2222-4222-8222-222222222222','denied-banned','{}',now(),now())$$,'42501',null,'banned review insert denied');
with changed as (update public.tasks set data='{"changed":true}' where id='beta-task' returning id) select is((select count(*)::integer from changed),0,'banned task update blocked');
with changed as (delete from public.goals where id='beta-goal' returning id) select is((select count(*)::integer from changed),0,'banned goal delete blocked');
with changed as (update public.profiles set data='{"changed":true}' returning id) select is((select count(*)::integer from changed),0,'banned profile workspace update blocked');
select is((select count(*)::integer from public.tasks),1,'banned task export still allowed');
select is((select count(*)::integer from public.review_records),1,'banned review export still allowed');
select throws_ok($$select public.beta_transition_account('11111111-1111-4111-8111-111111111111',gen_random_uuid(),'22222222-2222-4222-8222-222222222222','active','forged')$$,'42501',null,'banned cannot self-unban through RPC');
reset role;

set local role service_role;
select lives_ok($$select public.beta_transition_account('11111111-1111-4111-8111-111111111111',gen_random_uuid(),'22222222-2222-4222-8222-222222222222','active','unban')$$,'unban after indefinite ban succeeds');
select is((select count(*)::integer from public.account_controls where user_id='22222222-2222-4222-8222-222222222222' and superseded_at is null),1,'unban has one current control');
select ok((select count(*)>3 from public.account_controls where superseded_at is not null),'superseded history is retained');
select lives_ok($$insert into public.user_feedback(user_id,type,message) values ('22222222-2222-4222-8222-222222222222','bug','support remains available')$$,'server support feedback remains available');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select ok(public.beta_may_operate(),'unbanned admitted user has authority');
select lives_ok($$insert into public.tasks(id,user_id) values ('unbanned-task','22222222-2222-4222-8222-222222222222')$$,'unbanned task insert succeeds');
select lives_ok($$insert into public.goals(id,user_id) values ('unbanned-goal','22222222-2222-4222-8222-222222222222')$$,'unbanned goal insert succeeds');
select lives_ok($$insert into public.life_events(user_id,type,occurred_at) values ('22222222-2222-4222-8222-222222222222','sleep',now())$$,'unbanned life event insert succeeds');
select lives_ok($$insert into public.review_records(user_id,id,data,created_at,updated_at) values ('22222222-2222-4222-8222-222222222222','unbanned-review','{}',now(),now())$$,'unbanned review insert succeeds');
select lives_ok($$update public.profiles set display_name='unbanned'$$,'unbanned profile edit succeeds');
select throws_ok($$insert into public.tasks(id,user_id) values ('forged-owner','11111111-1111-4111-8111-111111111111')$$,'42501',null,'unban never weakens same-owner RLS');
select throws_ok($$update public.profiles set signup_source='forged'$$,'P0001','SIGNUP_ATTRIBUTION_IMMUTABLE','browser cannot forge signup provenance');
select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',true);
select is(public.beta_may_operate(),false,'new auth account before redemption has no workspace authority');
select throws_ok($$insert into public.tasks(id,user_id) values ('unadmitted','44444444-4444-4444-8444-444444444444')$$,'42501',null,'unadmitted direct workspace write is denied');
reset role;
select * from finish();
rollback;
