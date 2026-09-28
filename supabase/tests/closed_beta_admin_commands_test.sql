begin;
select no_plan();
insert into auth.users(id,email) values
 ('acacacac-acac-4cac-8cac-acacacacacac','commands-owner@example.test'),
 ('bdbdbdbd-bdbd-4dbd-8dbd-bdbdbdbdbdbd','commands-other-owner@example.test'),
 ('cececece-cece-4ece-8ece-cececececece','commands-user@example.test'),
 ('dfdfdfdf-dfdf-4fdf-8fdf-dfdfdfdfdfdf','commands-free@example.test');
insert into public.admin_roles(user_id,role,created_by) values
 ('acacacac-acac-4cac-8cac-acacacacacac','owner','acacacac-acac-4cac-8cac-acacacacacac'),
 ('bdbdbdbd-bdbd-4dbd-8dbd-bdbdbdbdbdbd','owner','acacacac-acac-4cac-8cac-acacacacacac');
insert into public.invite_codes(id,code_hash,max_uses,created_by) values
 ('edededed-eded-4ded-8ded-edededededed',repeat('d',64),2,'acacacac-acac-4cac-8cac-acacacacacac');
insert into public.beta_applications(id,email,email_hash,name,role,use_case) values
 ('fafafafa-fafa-4afa-8afa-fafafafafafa','application@example.test',repeat('a',64),'申请人','研究者','管理期限');
create temporary table command_cases(request_id uuid,action text,input jsonb);
insert into command_cases values
 ('10101010-0000-4000-8000-000000000001','create_invite','{"maxUses":2,"note":"receipt-fixture"}'),
 ('10101010-0000-4000-8000-000000000002','grant_entitlement','{"userId":"cececece-cece-4ece-8ece-cececececece","durationDays":7,"grantType":"beta"}'),
 ('10101010-0000-4000-8000-000000000003','grant_quota','{"userId":"cececece-cece-4ece-8ece-cececececece","amount":50}'),
 ('10101010-0000-4000-8000-000000000004','reset_quota','{"userId":"cececece-cece-4ece-8ece-cececececece"}'),
 ('10101010-0000-4000-8000-000000000005','set_account_control','{"userId":"cececece-cece-4ece-8ece-cececececece","status":"restricted"}'),
 ('10101010-0000-4000-8000-000000000006','set_feature_flag','{"key":"command-fixture","enabled":false}'),
 ('10101010-0000-4000-8000-000000000007','disable_invite','{"inviteId":"edededed-eded-4ded-8ded-edededededed","reason":"operator"}'),
 ('10101010-0000-4000-8000-000000000008','review_application','{"applicationId":"fafafafa-fafa-4afa-8afa-fafafafafafa","status":"shortlisted","reviewNote":"合适"}');
create temporary table original_results(request_id uuid,result jsonb);
grant select on command_cases to service_role;
grant select,insert on original_results to service_role;
set local role service_role;
insert into original_results select request_id,public.beta_admin_command('acacacac-acac-4cac-8cac-acacacacacac',request_id,action,input)
 from command_cases order by request_id;
select is(public.beta_admin_command('acacacac-acac-4cac-8cac-acacacacacac',c.request_id,c.action,c.input),o.result,c.action||' exact committed result replay')
 from command_cases c join original_results o using(request_id) order by c.request_id;
select is((select count(*)::integer from public.admin_audit_log a where a.actor_user_id='acacacac-acac-4cac-8cac-acacacacacac' and a.request_id=c.request_id),1,c.action||' exactly one audit')
 from command_cases c;
select is((select count(*)::integer from public.admin_command_receipts r where r.actor_user_id='acacacac-acac-4cac-8cac-acacacacacac' and r.request_id=c.request_id),1,c.action||' exactly one receipt')
 from command_cases c;
select throws_ok(format('select public.beta_admin_command(%L,%L,%L,%L::jsonb)',
 'acacacac-acac-4cac-8cac-acacacacacac',request_id,action,input||'{"changedPayload":true}'::jsonb),
 'P0001','IDEMPOTENCY_KEY_REUSED',action||' changed payload reuses key rejected') from command_cases;
select throws_ok(format('select public.beta_admin_command(%L,%L,%L,%L::jsonb)',
 'acacacac-acac-4cac-8cac-acacacacacac',request_id,case when action='grant_quota' then 'reset_quota' else 'grant_quota' end,input),
 'P0001','IDEMPOTENCY_KEY_REUSED',action||' changed action reuses key rejected') from command_cases;
select is((select count(*)::integer from public.admin_access_grants),1,'membership grant not duplicated');
select is((select count(*)::integer from public.ai_quota_grants where source_kind='manual'),1,'quota grant not duplicated');
select is((select count(*)::integer from public.ai_quota_grants where source_kind='period_reset'),1,'reset not duplicated');
select is((select count(*)::integer from public.invite_codes where note='receipt-fixture'),1,'create invite not duplicated');
select is(public.beta_admin_command('acacacac-acac-4cac-8cac-acacacacacac','10101010-0000-4000-8000-000000000001','create_invite','{"note":"receipt-fixture","maxUses":2}'),
 (select result from original_results where request_id='10101010-0000-4000-8000-000000000001'),'JSON key ordering does not change canonical command identity');
select is((select i.code_hash from public.invite_codes i join original_results o on i.id=(o.result#>>'{invite,id}')::uuid where o.request_id='10101010-0000-4000-8000-000000000001'),
 (select encode(sha256(convert_to(lower(result#>>'{invite,code}'),'UTF8')),'hex') from original_results where request_id='10101010-0000-4000-8000-000000000001'),
 'new invite code hash matches existing case-insensitive registration contract');
select is((select count(*)::integer from public.account_controls),1,'account transition not duplicated');
select is((select count(*)::integer from public.feature_flags where key='command-fixture'),1,'feature flag not duplicated');
select ok((select not enabled from public.invite_codes where id='edededed-eded-4ded-8ded-edededededed'),'disable invite applied');
select is((select status from public.beta_applications where id='fafafafa-fafa-4afa-8afa-fafafafafafa'),'shortlisted','review update applied');
select lives_ok($$select public.beta_admin_command('bdbdbdbd-bdbd-4dbd-8dbd-bdbdbdbdbdbd','10101010-0000-4000-8000-000000000003','grant_quota','{"userId":"cececece-cece-4ece-8ece-cececececece","amount":50}')$$,'same key for different actor is independent');
select is((select count(*)::integer from public.ai_quota_grants where source_kind='manual'),2,'different actor has own committed grant');
select lives_ok($$select public.beta_admin_command('acacacac-acac-4cac-8cac-acacacacacac',gen_random_uuid(),'set_feature_flag','{"key":"command-fixture","enabled":true}')$$,'later new command changes provider truth');
select is(public.beta_admin_command('acacacac-acac-4cac-8cac-acacacacacac','10101010-0000-4000-8000-000000000006','set_feature_flag','{"key":"command-fixture","enabled":false}'),
 (select result from original_results where request_id='10101010-0000-4000-8000-000000000006'),'replay returns old result not newly computed state');
select ok((select enabled from public.feature_flags where key='command-fixture'),'old replay does not undo later command');
select ok((select not(result_json->'invite' ? 'code') and not(result_json->'invite' ? 'code_hash') from public.admin_command_receipts where action='create_invite'),'general receipt excludes invite secret');
select ok(not has_schema_privilege('service_role','vd_admin_private','USAGE'),'backend cannot browse private secret schema');
select throws_ok($$select * from vd_admin_private.invite_command_results$$,'42501',null,'private invite replay secret not directly readable by service role');
select throws_ok($$update public.admin_command_receipts set result_json='{}'$$,'42501',null,'backend cannot rewrite receipts');
select throws_ok($$delete from public.admin_command_receipts$$,'42501',null,'backend cannot delete receipts');
select throws_ok($$select public.beta_create_invite('acacacac-acac-4cac-8cac-acacacacacac',gen_random_uuid(),repeat('b',64),'VD-BBB',null,1,null,null)$$,
 '42501',null,'legacy worker cannot bypass receipt enforcement');
select ok(not has_function_privilege(role,p.oid,'EXECUTE'),role||' cannot bypass dispatcher via '||p.proname)
 from pg_proc p cross join unnest(array['service_role','authenticated','anon']) role
 where p.pronamespace='public'::regnamespace and p.proname in
 ('beta_admin_effective_entitlement','beta_disable_invite','beta_review_application','beta_transition_account','beta_grant_entitlement',
  'beta_revoke_entitlement','beta_create_invite','beta_set_feature_flag','beta_grant_quota','beta_reset_quota');
reset role;
select ok((select before_json->>'enabled'='true' and after_json->>'enabled'='false' and not(before_json ? 'code_hash') and not(after_json ? 'code_hash')
 from public.admin_audit_log where request_id='10101010-0000-4000-8000-000000000007'),'disable audit records safe before/after state');
select ok((select before_json->>'status'='pending' and after_json->>'status'='shortlisted' and after_json->>'reviewed_by'='acacacac-acac-4cac-8cac-acacacacacac'
 from public.admin_audit_log where request_id='10101010-0000-4000-8000-000000000008'),'review audit records before/after and authenticated actor');
select ok(not exists(select 1 from public.admin_audit_log a cross join vd_admin_private.invite_command_results s
 where a.after_json::text like '%'||s.invite_code||'%' or a.before_json::text like '%'||s.invite_code||'%'),'plaintext invite never stored in audit');
select ok(not exists(select 1 from public.admin_command_receipts r cross join vd_admin_private.invite_command_results s
 where r.result_json::text like '%'||s.invite_code||'%'),'plaintext invite never stored in general receipt');
update public.admin_roles set enabled=false where user_id='acacacac-acac-4cac-8cac-acacacacacac';
set local role service_role;
select throws_ok($$select public.beta_admin_command('acacacac-acac-4cac-8cac-acacacacacac','10101010-0000-4000-8000-000000000001','create_invite','{"maxUses":2,"note":"receipt-fixture"}')$$,
 'P0001','ADMIN_REQUIRED','revoked admin cannot replay secret result');
reset role;
update public.admin_roles set enabled=true where user_id='acacacac-acac-4cac-8cac-acacacacacac';

-- Audit and receipt insertion are independently faulted AFTER domain mutation.
create function pg_temp.command_state() returns jsonb language sql security definer as $$
 select jsonb_build_object(
 'invites',(select jsonb_agg(to_jsonb(t) order by id) from public.invite_codes t),
 'applications',(select jsonb_agg(to_jsonb(t) order by id) from public.beta_applications t),
 'grants',(select jsonb_agg(to_jsonb(t) order by id) from public.admin_access_grants t),
 'entitlements',(select jsonb_agg(to_jsonb(t) order by id) from public.entitlements t),
 'quota',(select jsonb_agg(to_jsonb(t) order by id) from public.ai_quota_grants t),
 'controls',(select jsonb_agg(to_jsonb(t) order by id) from public.account_controls t),
 'flags',(select jsonb_agg(to_jsonb(t) order by id) from public.feature_flags t),
 'audits',(select jsonb_agg(to_jsonb(t) order by id) from public.admin_audit_log t),
 'receipts',(select jsonb_agg(to_jsonb(t) order by request_id,actor_user_id) from public.admin_command_receipts t),
 'secrets',(select count(*) from vd_admin_private.invite_command_results));
$$;
create function pg_temp.fail_command_audit() returns trigger language plpgsql as $$
begin if new.request_id='ffffffff-0000-4000-8000-000000000001' then raise exception 'COMMAND_AUDIT_FAULT'; end if; return new; end $$;
create function pg_temp.fail_command_receipt() returns trigger language plpgsql as $$
begin if new.request_id='ffffffff-0000-4000-8000-000000000002' then raise exception 'COMMAND_RECEIPT_FAULT'; end if; return new; end $$;
create trigger command_audit_fault before insert on public.admin_audit_log for each row execute function pg_temp.fail_command_audit();
create trigger command_receipt_fault before insert on public.admin_command_receipts for each row execute function pg_temp.fail_command_receipt();
update public.invite_codes set enabled=true where id='edededed-eded-4ded-8ded-edededededed';
insert into public.ai_usage_events(user_id,request_id,provider,model,feature,status)
 select 'cececece-cece-4ece-8ece-cececececece',gen_random_uuid(),'deepseek','fixture','review','succeeded' from generate_series(1,3);
update command_cases set input=input||'{"status":"approved","reviewNote":"故障时不得保存"}'::jsonb where action='review_application';
create temporary table before_fault as select pg_temp.command_state() state;
grant select on before_fault to service_role;
set local role service_role;
select throws_ok(format('select public.beta_admin_command(%L,%L,%L,%L::jsonb)',
 'acacacac-acac-4cac-8cac-acacacacacac','ffffffff-0000-4000-8000-000000000001',action,input),
 'P0001','COMMAND_AUDIT_FAULT',action||' audit failure rolls back entire command') from command_cases;
select is(pg_temp.command_state(),(select state from before_fault),'all audit faults preserve mutations, receipts and secret state');
select throws_ok(format('select public.beta_admin_command(%L,%L,%L,%L::jsonb)',
 'acacacac-acac-4cac-8cac-acacacacacac','ffffffff-0000-4000-8000-000000000002',action,input),
 'P0001','COMMAND_RECEIPT_FAULT',action||' receipt failure rolls back mutation AND audit') from command_cases;
select is(pg_temp.command_state(),(select state from before_fault),'all receipt faults preserve mutations and audits');
select ok((select enabled from public.invite_codes where id='edededed-eded-4ded-8ded-edededededed'),'failed invite disable remains enabled');
select is((select status from public.beta_applications where id='fafafafa-fafa-4afa-8afa-fafafafafafa'),'shortlisted','failed review retains previous status');
select throws_ok($$select public.beta_admin_command('acacacac-acac-4cac-8cac-acacacacacac',gen_random_uuid(),'review_application',
 '{"applicationId":"fafafafa-fafa-4afa-8afa-fafafafafafa","status":"invented"}')$$,'P0001','ADMIN_INPUT_INVALID','unknown review status rejected');
select lives_ok(format('select public.beta_admin_command(%L,gen_random_uuid(),%L,%L::jsonb)',
 'acacacac-acac-4cac-8cac-acacacacacac','review_application',jsonb_build_object('applicationId','fafafafa-fafa-4afa-8afa-fafafafafafa','status',status)),
 'allowed review status: '||status) from unnest(array['pending','shortlisted','approved','rejected','invited','registered','expired']) status;
select is((select reviewed_by from public.beta_applications where id='fafafafa-fafa-4afa-8afa-fafafafafafa'),
 'acacacac-acac-4cac-8cac-acacacacacac'::uuid,'review actor is recorded');
select ok((select reviewed_at is not null from public.beta_applications where id='fafafafa-fafa-4afa-8afa-fafafafafafa'),'review timestamp is recorded');
select throws_ok($$select public.beta_admin_command('dfdfdfdf-dfdf-4fdf-8fdf-dfdfdfdfdfdf',gen_random_uuid(),'disable_invite','{"inviteId":"edededed-eded-4ded-8ded-edededededed"}')$$,
 'P0001','ADMIN_REQUIRED','non-admin cannot disable invite');
select throws_ok($$select public.beta_admin_command('dfdfdfdf-dfdf-4fdf-8fdf-dfdfdfdfdfdf',gen_random_uuid(),'review_application','{"applicationId":"fafafafa-fafa-4afa-8afa-fafafafafafa","status":"approved"}')$$,
 'P0001','ADMIN_REQUIRED','non-admin cannot review application');
select throws_ok($$select public.beta_admin_command('acacacac-acac-4cac-8cac-acacacacacac',gen_random_uuid(),'disable_invite','{"inviteId":"00000000-0000-4000-8000-000000000000"}')$$,
 'P0001','ADMIN_NOT_FOUND','missing invite has no mutation or receipt');
select throws_ok($$select public.beta_admin_command('acacacac-acac-4cac-8cac-acacacacacac',gen_random_uuid(),'review_application','{"applicationId":"00000000-0000-4000-8000-000000000000","status":"approved"}')$$,
 'P0001','ADMIN_NOT_FOUND','missing application has no mutation or receipt');
select ok((select not enabled from public.ai_quota_policies where tier='pro'),'Pro reserved policy explicitly disabled');
select is(public.beta_ai_quota_snapshot('dfdfdfdf-dfdf-4fdf-8fdf-dfdfdfdfdfdf')->>'tier','free','Free policy reachable');
select is(public.beta_ai_quota_snapshot('cececece-cece-4ece-8ece-cececececece')->>'tier','plus','Plus policy reachable from entitlement');
reset role;
create function pg_temp.fail_invite_secret() returns trigger language plpgsql as $$
begin if new.request_id='ffffffff-0000-4000-8000-000000000003' then raise exception 'INVITE_SECRET_FAULT'; end if; return new; end $$;
create trigger invite_secret_fault before insert on vd_admin_private.invite_command_results for each row execute function pg_temp.fail_invite_secret();
create temporary table before_secret_fault as select pg_temp.command_state() state;
grant select on before_secret_fault to service_role;
set local role service_role;
select throws_ok($$select public.beta_admin_command('acacacac-acac-4cac-8cac-acacacacacac','ffffffff-0000-4000-8000-000000000003','create_invite','{}')$$,
 'P0001','INVITE_SECRET_FAULT','private secret persistence failure rolls back invite, receipt and audit');
select is(pg_temp.command_state(),(select state from before_secret_fault),'secret fault preserves entire committed command state');
reset role;
drop trigger invite_secret_fault on vd_admin_private.invite_command_results;
set local role service_role;
select lives_ok($$select public.beta_admin_command('acacacac-acac-4cac-8cac-acacacacacac','ffffffff-0000-4000-8000-000000000003','create_invite','{}')$$,
 'failed command has no poisoned receipt; same key succeeds after fault removal');
reset role;
select throws_ok($$update public.ai_quota_policies set enabled=true where tier='pro'$$,'23514',null,'unsupported Pro cannot be enabled');
set local role authenticated;
select throws_ok($$select * from public.admin_command_receipts$$,'42501',null,'authenticated receipt read denied');
select throws_ok($$select * from vd_admin_private.invite_command_results$$,'42501',null,'authenticated secret read denied');
select throws_ok($$select public.beta_admin_command('acacacac-acac-4cac-8cac-acacacacacac',gen_random_uuid(),'create_invite','{}')$$,'42501',null,'authenticated command RPC denied');
reset role;
set local role anon;
select throws_ok($$select * from public.admin_command_receipts$$,'42501',null,'anon receipt read denied');
select throws_ok($$select public.beta_admin_command('acacacac-acac-4cac-8cac-acacacacacac',gen_random_uuid(),'create_invite','{}')$$,'42501',null,'anon command RPC denied');
reset role;
select ok(public.consume_ai_quota('dfdfdfdf-dfdf-4fdf-8fdf-dfdfdfdfdfdf','33333333-0000-4000-8000-000000000009','deepseek','fixture-model','review'),'cost fixture quota reserve');
select ok((select cost_status='unknown' and estimated_cost_minor is null and pricing_version is null from public.ai_usage_events
 where request_id='33333333-0000-4000-8000-000000000009'),'missing pricing is unknown not zero');
select throws_ok($$update public.ai_usage_events set estimated_cost_minor=0 where request_id='33333333-0000-4000-8000-000000000009'$$,
 '23514',null,'unknown cost cannot silently store zero');
select lives_ok($$update public.ai_usage_events set cost_status='estimated',estimated_cost_minor=0,pricing_version='fixture-zero-v1'
 where request_id='33333333-0000-4000-8000-000000000009'$$,'explicit priced zero is distinct from unknown');
select * from finish();
rollback;
