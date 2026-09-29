begin;
select no_plan();
insert into auth.users(id,email,email_confirmed_at,phone_confirmed_at,raw_user_meta_data) values
 ('a1111111-1111-4111-8111-111111111111','owner@fixture.test',now(),null,'{}'),
 ('a2222222-2222-4222-8222-222222222222','uninvited@fixture.test',now(),null,'{"role":"owner","beta":true}'),
 ('a3333333-3333-4333-8333-333333333333','unconfirmed@fixture.test',null,null,'{}'),
 ('a4444444-4444-4444-8444-444444444444',null,null,now(),'{}'),
 ('a5555555-5555-4555-8555-555555555555','oauth@fixture.test',now(),null,'{"provider":"google"}');
insert into public.admin_operator_roles(user_id,role,created_by) values ('a1111111-1111-4111-8111-111111111111','owner','a1111111-1111-4111-8111-111111111111');
select is((select enabled from public.beta_admission_policy),false,'one rollout authority defaults OFF');
select ok(public.beta_workspace_admitted('a2222222-2222-4222-8222-222222222222'),'OFF preserves existing account writes');
select ok(not public.beta_workspace_admitted(null),'null identity rejected');
select ok(not has_table_privilege('anon','public.beta_admission_policy','select'),'anon cannot inspect policy table');
select ok(not has_table_privilege('authenticated','public.beta_admission_policy','update'),'client cannot enable or disable rollout');
select ok(not has_table_privilege('service_role','public.beta_admission_policy','update'),'service key cannot directly change rollout');
select ok(not has_function_privilege('authenticated','public.beta_workspace_admitted(uuid)','execute'),'arbitrary admission lookup is service-only');
select is((select count(*)::int from pg_policy where polname in ('admin_account_insert','admin_account_update','admin_account_delete','admin_account_storage_insert','admin_account_storage_update','admin_account_storage_delete') and not polpermissive),69,'all 22 workspace tables and Storage mutations retain restrictive common admission predicate');
select throws_ok($$update public.beta_admission_policy set enabled=true$$,'23514',null,'enable requires explicit grandfather cutoff');
update public.beta_admission_policy set enabled=true,grandfather_cutoff=now(),reason='Local rollback-only admission verification';
select ok(public.beta_workspace_admitted('a1111111-1111-4111-8111-111111111111'),'verified authoritative owner admitted');
select ok(not public.beta_workspace_admitted('a2222222-2222-4222-8222-222222222222'),'metadata cannot admit uninvited email account');
select ok(not public.beta_workspace_admitted('a4444444-4444-4444-8444-444444444444'),'direct phone signup cannot bypass admission');
select ok(not public.beta_workspace_admitted('a5555555-5555-4555-8555-555555555555'),'direct OAuth signup cannot bypass admission');
select throws_ok($$select public.ai_reserve('a2222222-2222-4222-8222-222222222222','b1111111-1111-4111-8111-111111111111','task_advice','deepseek','configured')$$,'42501','BETA_ADMISSION_REQUIRED','quota reservation independently checks admission');
insert into public.beta_allow_grants(user_id,reason,created_by) values
 ('a2222222-2222-4222-8222-222222222222','Explicit existing account grandfather policy','a1111111-1111-4111-8111-111111111111'),
 ('a3333333-3333-4333-8333-333333333333','Explicit grant requires confirmed identity','a1111111-1111-4111-8111-111111111111');
select ok(public.beta_workspace_admitted('a2222222-2222-4222-8222-222222222222'),'explicit grandfathered existing identity retains login/workspace');
select ok(not public.beta_workspace_admitted('a3333333-3333-4333-8333-333333333333'),'allow grant does not bypass identity confirmation');
update public.beta_allow_grants set revoked_at=now() where user_id='a2222222-2222-4222-8222-222222222222';
select set_config('request.jwt.claim.sub','a2222222-2222-4222-8222-222222222222',true);
set local role authenticated;
select is((public.account_bootstrap()->>'workspaceAdmitted')::boolean,false,'bootstrap reports blocked workspace');
select throws_ok($$insert into public.profiles(id,user_id,display_name) values ('a2222222-2222-4222-8222-222222222222','a2222222-2222-4222-8222-222222222222','Uninvited')$$,'42501',null,'actual profile mutation RLS rejects unadmitted owner');
reset role;
insert into public.invite_codes(code_hash,display_prefix,kind,max_uses,expires_at,created_by) values
 (encode(extensions.digest('VD-Ab_2Ab_2Ab_2Ab_2Ab_2Ab_2Ab_2Ab_2','sha256'),'hex'),'VD-Ab_2','group',5,now()+interval '1 day','a1111111-1111-4111-8111-111111111111');
select ok(public.beta_registration_check(encode(extensions.digest('VD-Ab_2Ab_2Ab_2Ab_2Ab_2Ab_2Ab_2Ab_2','sha256'),'hex'),'uninvited@fixture.test',repeat('a',64)),'invited registration validates canonical PR140 hash');
select lives_ok($$select public.beta_redeem('a2222222-2222-4222-8222-222222222222',encode(extensions.digest('VD-Ab_2Ab_2Ab_2Ab_2Ab_2Ab_2Ab_2Ab_2','sha256'),'hex'))$$,'invitation redeem commits authority');
select ok(public.beta_workspace_admitted('a2222222-2222-4222-8222-222222222222'),'redemption admits verified identity');
select set_config('request.jwt.claim.sub','a2222222-2222-4222-8222-222222222222',true);
set local role authenticated;
select lives_ok($$insert into public.profiles(id,user_id,display_name) values ('a2222222-2222-4222-8222-222222222222','a2222222-2222-4222-8222-222222222222','Admitted')$$,'admitted owner writes through real RLS');
reset role;
select lives_ok($$select public.ai_reserve('a2222222-2222-4222-8222-222222222222','b1111111-1111-4111-8111-111111111111','capture_interpret','deepseek','configured')$$,'Free quota reserve under admission');
select lives_ok($$select public.ai_settle('a2222222-2222-4222-8222-222222222222','b1111111-1111-4111-8111-111111111111','succeeded','{"model":"actual-provider-model","generatedAt":"2026-09-28T01:02:03Z","inputTokens":4}')$$,'quota settle stores actual provenance');
select is((select model from public.ai_usage_ledger where request_id='b1111111-1111-4111-8111-111111111111'),'actual-provider-model','ledger model is actual response model');
select ok((select generated_at is not null from public.ai_usage_ledger where request_id='b1111111-1111-4111-8111-111111111111'),'server generation time persisted');
select throws_ok($$select public.ai_reserve('a2222222-2222-4222-8222-222222222222','b1111111-1111-4111-8111-111111111111','capture_interpret','deepseek','configured')$$,'23505','AI_REQUEST_REPLAY','durable replay rejected before another provider call');
select lives_ok($$select public.admin_command('a1111111-1111-4111-8111-111111111111','owner','entitlements','grant','a2222222-2222-4222-8222-222222222222','Local accepted Plus grant','{"tier":"plus","source":"beta_gift","days":1}','c1111111-1111-4111-8111-111111111111',repeat('s',32),null)$$,'Plus grant uses PR140 transaction');
select is(public.admin_effective_tier('a2222222-2222-4222-8222-222222222222'),'plus','Plus outranks Free');
select lives_ok($$select public.ai_reserve('a2222222-2222-4222-8222-222222222222','b2222222-2222-4222-8222-222222222222','goal_decompose','deepseek','configured')$$,'Plus quota reserve');
select lives_ok($$select public.ai_settle('a2222222-2222-4222-8222-222222222222','b2222222-2222-4222-8222-222222222222','succeeded','{}')$$,'Plus quota settle');
select lives_ok($$select public.admin_command('a1111111-1111-4111-8111-111111111111','owner','entitlements','grant','a2222222-2222-4222-8222-222222222222','Local accepted Pro grant','{"tier":"pro","source":"admin_grant","days":1}','c2222222-2222-4222-8222-222222222222',repeat('s',32),null)$$,'Pro grant uses PR140 authority');
select is(public.admin_effective_tier('a2222222-2222-4222-8222-222222222222'),'pro','Pro outranks Plus');
select lives_ok($$select public.ai_reserve('a2222222-2222-4222-8222-222222222222','b3333333-3333-4333-8333-333333333333','review_history','deepseek','configured')$$,'Pro quota reserve');
select lives_ok($$select public.ai_settle('a2222222-2222-4222-8222-222222222222','b3333333-3333-4333-8333-333333333333','succeeded','{}')$$,'Pro quota settle');
select is(jsonb_array_length(public.admin_read('a1111111-1111-4111-8111-111111111111','owner','entitlements','{}')->'items'),2,'source list contains one row per independent grant, no duplicate inherited Plus');
select is(jsonb_array_length(public.admin_user_dto('a2222222-2222-4222-8222-222222222222')->'entitlementSources'),2,'Pro user detail preserves independent Plus and Pro sources');
select ok((public.admin_read('a1111111-1111-4111-8111-111111111111','owner','entitlements','{}')->'items'->0) ?& array['id','userId','email','tier','source','effectiveTier','validFrom','validUntil','status','reason'],'source DTO has operational contract');
select is((select count(*)::int from public.subscriptions),0,'admin grants never create or mutate Paddle subscriptions');
select is((select count(*)::int from public.admin_audit_events),2,'grant mutations each produce committed authoritative audit');
update public.account_controls set status='banned' where user_id='a2222222-2222-4222-8222-222222222222';
insert into public.account_controls(user_id,status,reason_code,reason,updated_by) values ('a2222222-2222-4222-8222-222222222222','banned','manual','Local control verification','a1111111-1111-4111-8111-111111111111') on conflict(user_id) do update set status='banned';
select set_config('request.jwt.claim.sub','a2222222-2222-4222-8222-222222222222',true);
set local role authenticated;
select ok(not public.admin_may_operate(),'admission never overrides account controls');
reset role;
select * from finish();
rollback;
