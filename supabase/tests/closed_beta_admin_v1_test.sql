begin;
select no_plan();
insert into auth.users(id,email,encrypted_password,raw_user_meta_data,created_at)
 select ('a1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'admin-v1-'||n||'@example.test','PRIVATE_AUTH',
  '{"privateTask":"PRIVATE_CONTENT"}'::jsonb,now() from generate_series(1,130) n;
create temporary table adapter_actors as
 select ('a1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid actor,role
 from unnest(array['owner','admin','support','analyst','reviewer']) with ordinality r(role,n);
insert into public.admin_roles(user_id,role,created_by) select actor,role,'a1000000-0000-4000-8000-000000000001' from adapter_actors;
insert into public.invite_codes(id,code_hash,display_prefix,max_uses,created_by) values
 ('a2000000-0000-4000-8000-000000000001',repeat('a',64),'VD-TEST',2,'a1000000-0000-4000-8000-000000000001');
insert into public.beta_applications(id,email,email_hash,name,role,use_case) values
 ('a3000000-0000-4000-8000-000000000001','v1-app@example.test',repeat('a',64),'申请人','开发者','管理期限');
insert into public.user_feedback(user_id,type,message,metadata) values
 ('a1000000-0000-4000-8000-000000000010','feedback','PRIVATE_CONTENT','{"secret":"PRIVATE_CONTENT"}');
insert into public.ai_usage_events(user_id,request_id,provider,model,feature,status) values
 ('a1000000-0000-4000-8000-000000000010',gen_random_uuid(),'deepseek','fixture','review','succeeded');
grant select on adapter_actors to service_role;
set local role service_role;
select is(public.beta_admin_v1_authorize(actor,'users',false),role,role||' explicitly allowed user read') from adapter_actors where role in ('owner','admin','support');
select throws_ok(format('select public.beta_admin_v1_authorize(%L,%L,false)',actor,'users'),'P0001','ADMIN_FORBIDDEN',role||' cannot read users') from adapter_actors where role in ('analyst','reviewer');
select is(public.beta_admin_v1_authorize(actor,'ai-usage',false),role,role||' allowed usage read') from adapter_actors where role in ('owner','analyst');
select throws_ok(format('select public.beta_admin_v1_authorize(%L,%L,false)',actor,'ai-usage'),'P0001','ADMIN_FORBIDDEN',role||' cannot read usage') from adapter_actors where role in ('admin','support','reviewer');
select is(public.beta_admin_v1_authorize(actor,'beta-applications',true),role,role||' allowed application review') from adapter_actors where role in ('owner','admin','reviewer');
select throws_ok(format('select public.beta_admin_v1_authorize(%L,%L,true)',actor,'entitlements'),'P0001','ADMIN_FORBIDDEN',role||' cannot grant membership') from adapter_actors where role in ('support','analyst','reviewer');
select throws_ok($$select public.beta_admin_v1_read('a1000000-0000-4000-8000-000000000010','users','{}')$$,'P0001','ADMIN_REQUIRED','forged non-admin actor rejected');
select throws_ok($$select public.beta_admin_v1_read('a1000000-0000-4000-8000-000000999999','users','{}')$$,'P0001','ADMIN_REQUIRED','nonexistent actor rejected');
select throws_ok($$select public.beta_admin_v1_read('a1000000-0000-4000-8000-000000000001','restricted-content','{}')$$,'P0001','RESTRICTED_CONTENT_DISABLED','private content stays disabled even for owner');
select throws_ok(format('select public.beta_admin_v1_read(%L,%L,%L::jsonb)','a1000000-0000-4000-8000-000000000001',resource,'{}'),
 'P0001','ADMIN_RESOURCE_UNSUPPORTED',resource||' is explicitly pending') from unnest(array['email','analytics','infrastructure','deployments']) resource;
select lives_ok(format('select public.beta_admin_v1_read(%L,%L,%L::jsonb)','a1000000-0000-4000-8000-000000000001',resource,'{}'),resource||' read implemented')
 from unnest(array['dashboard','users','beta-applications','invitations','entitlements','quotas','bans','audit','feedback','ai-usage','settings']) resource;
select is(public.beta_admin_v1_read('a1000000-0000-4000-8000-000000000001','settings','{}')#>'{summary,adminGrantSupport,grantableTiers}','["plus"]'::jsonb,'authoritative support is Plus only');
select is(public.beta_admin_v1_read('a1000000-0000-4000-8000-000000000001','dashboard','{}')#>>'{summary,timezone}','UTC','dashboard natural-day timezone explicit');
select is(public.beta_admin_v1_read('a1000000-0000-4000-8000-000000000001','dashboard','{}')#>'{summary,aiEstimatedCostToday}','null'::jsonb,'unknown cost is not fabricated zero');
select ok(not(public.beta_admin_v1_read('a1000000-0000-4000-8000-000000000001','users','{}')::text like '%PRIVATE%'),'user DTO source excludes Auth and arbitrary private content');
select ok(not(public.beta_admin_v1_read('a1000000-0000-4000-8000-000000000001','feedback','{}')::text like '%PRIVATE%'),'support feedback metadata excludes raw message and payload');
select ok(not(public.beta_admin_v1_read('a1000000-0000-4000-8000-000000000001','invitations','{}')::text like '%code_hash%'),'invite list excludes hash');
create temporary table page1 as select public.beta_admin_v1_read('a1000000-0000-4000-8000-000000000001','users','{"q":"admin-v1-","limit":50}') page;
create temporary table page2 as select public.beta_admin_v1_read('a1000000-0000-4000-8000-000000000001','users',jsonb_build_object('q','admin-v1-','limit',50,'after',page->>'nextId')) page from page1;
create temporary table page3 as select public.beta_admin_v1_read('a1000000-0000-4000-8000-000000000001','users',jsonb_build_object('q','admin-v1-','limit',50,'after',page->>'nextId')) page from page2;
select is((select jsonb_array_length(page->'items') from page1),50,'first page bounded');
select is((select jsonb_array_length(page->'items') from page2),50,'second page bounded');
select is((select jsonb_array_length(page->'items') from page3),30,'fresh device traverses beyond 100 rows');
select is((select page->'nextId' from page3),'null'::jsonb,'pagination ends only at exhaustion');
select is((select count(distinct item->>'id')::integer from (select page from page1 union all select page from page2 union all select page from page3) pages cross join jsonb_array_elements(page->'items') item),130,'stable keyset has no duplicates');
select ok((select (a.page#>>'{items,49,id}')<(b.page#>>'{items,0,id}') from page1 a cross join page2 b),'pages preserve deterministic ascending UUID order');
select is(jsonb_array_length(public.beta_admin_v1_read('a1000000-0000-4000-8000-000000000001','users','{"id":"a1000000-0000-4000-8000-000000000010"}')->'items'),1,'detail id filter exact');
select is(jsonb_array_length(public.beta_admin_v1_read('a1000000-0000-4000-8000-000000000001','users','{"q":"%"}')->'items'),0,'literal q is not SQL LIKE wildcard');
select is(jsonb_array_length(public.beta_admin_v1_read('a1000000-0000-4000-8000-000000000001','invitations','{"status":"disabled"}')->'items'),0,'invitation status filters authoritative current state');
reset role;

create temporary table adapter_cases(n integer,resource text,action text,target text,input jsonb,command text,args jsonb);
insert into adapter_cases values
 (1,'entitlements','grant','a1000000-0000-4000-8000-000000000010','{"days":7,"source":"beta_gift"}','grant_entitlement','{"userId":"a1000000-0000-4000-8000-000000000010","durationDays":7,"grantType":"beta","reason":"适配器验证"}'),
 (2,'invitations','create','new','{"kind":"personal","limit":1}','create_invite','{"maxUses":1,"reason":"适配器验证"}'),
 (3,'invitations','disable','a2000000-0000-4000-8000-000000000001','{}','disable_invite','{"inviteId":"a2000000-0000-4000-8000-000000000001","reason":"适配器验证"}'),
 (4,'beta-applications','shortlist','a3000000-0000-4000-8000-000000000001','{}','review_application','{"applicationId":"a3000000-0000-4000-8000-000000000001","status":"shortlisted","reviewNote":"适配器验证"}'),
 (5,'beta-applications','approve','a3000000-0000-4000-8000-000000000001','{}','review_application','{"applicationId":"a3000000-0000-4000-8000-000000000001","status":"approved","reviewNote":"适配器验证"}'),
 (6,'beta-applications','reject','a3000000-0000-4000-8000-000000000001','{}','review_application','{"applicationId":"a3000000-0000-4000-8000-000000000001","status":"rejected","reviewNote":"适配器验证"}'),
 (7,'quotas','adjust','a1000000-0000-4000-8000-000000000010','{"delta":20}','grant_quota','{"userId":"a1000000-0000-4000-8000-000000000010","amount":20,"reason":"适配器验证"}'),
 (8,'quotas','reset','a1000000-0000-4000-8000-000000000010','{}','reset_quota','{"userId":"a1000000-0000-4000-8000-000000000010","reason":"适配器验证"}'),
 (9,'bans','restrict','a1000000-0000-4000-8000-000000000010','{}','set_account_control','{"userId":"a1000000-0000-4000-8000-000000000010","status":"restricted","reason":"适配器验证"}'),
 (10,'bans','suspend','a1000000-0000-4000-8000-000000000010','{"days":7}','set_account_control','{"userId":"a1000000-0000-4000-8000-000000000010","status":"suspended","durationDays":7,"reason":"适配器验证"}'),
 (11,'bans','ban','a1000000-0000-4000-8000-000000000010','{}','set_account_control','{"userId":"a1000000-0000-4000-8000-000000000010","status":"banned","reason":"适配器验证"}'),
 (12,'bans','unban','a1000000-0000-4000-8000-000000000010','{}','unban','{"userId":"a1000000-0000-4000-8000-000000000010","reason":"适配器验证"}');
update adapter_cases set args=args||jsonb_build_object('_adminV1',jsonb_build_object('contract','vd-admin-v1','resource',resource,'action',action,'target',target,'reason','适配器验证','input',input));
create temporary table adapter_results(n integer,result jsonb,audit jsonb);
grant select on adapter_cases to service_role;
grant select,insert on adapter_results to service_role;
set local role service_role;
insert into adapter_results(n,result) select n,public.beta_admin_command('a1000000-0000-4000-8000-000000000001',('a4000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,command,args) from adapter_cases order by n;
reset role;
update adapter_results set audit=public.beta_admin_v1_audit_receipt('a1000000-0000-4000-8000-000000000001',('a4000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid);
insert into adapter_cases select 13,'entitlements','revoke','a1000000-0000-4000-8000-000000000010',jsonb_build_object('grantId',result#>>'{grant,id}'),'revoke_entitlement',
 jsonb_build_object('grantId',result#>>'{grant,id}','reason','适配器验证','_adminV1',jsonb_build_object('contract','vd-admin-v1','resource','entitlements','action','revoke','target','a1000000-0000-4000-8000-000000000010','reason','适配器验证','input',jsonb_build_object('grantId',result#>>'{grant,id}'))) from adapter_results where n=1;
set local role service_role;
insert into adapter_results(n,result) select n,public.beta_admin_command('a1000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000013',command,args) from adapter_cases where n=13;
reset role;
update adapter_results set audit=public.beta_admin_v1_audit_receipt('a1000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000013') where n=13;
set local role service_role;
select is(public.beta_admin_command('a1000000-0000-4000-8000-000000000001',('a4000000-0000-4000-8000-'||lpad(c.n::text,12,'0'))::uuid,c.command,c.args),r.result,c.action||' returns exact ORIGINAL result on replay') from adapter_cases c join adapter_results r using(n) order by n;
select is(public.beta_admin_v1_audit_receipt('a1000000-0000-4000-8000-000000000001',('a4000000-0000-4000-8000-'||lpad(c.n::text,12,'0'))::uuid),r.audit,c.action||' returns exact ORIGINAL committed audit') from adapter_cases c join adapter_results r using(n);
select ok(r.audit->'adapter_command'=c.args->'_adminV1',c.action||' aliases and reason were captured during INSERT') from adapter_cases c join adapter_results r using(n);
select is((select count(*)::integer from public.admin_audit_log where request_id=('a4000000-0000-4000-8000-'||lpad(c.n::text,12,'0'))::uuid),1,c.action||' exactly one committed audit') from adapter_cases c;
select is(jsonb_array_length(public.beta_admin_v1_read('a1000000-0000-4000-8000-000000000001','entitlements','{"q":"admin-v1-","status":"active"}')->'items'),0,'entitlement active filter does not mistake active account for paid access');
select is(jsonb_array_length(public.beta_admin_v1_read('a1000000-0000-4000-8000-000000000001','entitlements','{"q":"admin-v1-","status":"inactive","limit":100}')->'items'),100,'entitlement inactive filter uses existing authoritative union');
select is(jsonb_array_length(public.beta_admin_v1_read('a1000000-0000-4000-8000-000000000001','beta-applications','{}')#>'{items,0,history}'),3,'application review history comes from actual audit rows');
select throws_ok(format('select public.beta_admin_command(%L,%L,%L,%L::jsonb)','a1000000-0000-4000-8000-000000000001',
 ('a4000000-0000-4000-8000-'||lpad(n::text,12,'0')),command,jsonb_set(args,'{_adminV1,reason}','"changed"')), 'P0001','IDEMPOTENCY_KEY_REUSED',action||' changed adapter reason rejects reused key') from adapter_cases;
select ok((select result ? 'quota' from adapter_results where n=7),'quota projection committed with receipt rather than recomputed during replay');
select ok((select (result#>>'{control,expires_at}')::timestamptz=now()+interval '7 days' from adapter_results where n=10),'suspension days resolved once inside command');
select ok((select result#>>'{invite,code}' ~ '^VD-[0-9A-F]{32}$' from adapter_results where n=2),'invite create returns existing private replay plaintext');
select ok(not exists(select 1 from public.admin_audit_log where request_id='a4000000-0000-4000-8000-000000000002' and to_jsonb(admin_audit_log)::text like '%'||(select result#>>'{invite,code}' from adapter_results where n=2)||'%'),'plaintext absent from entire audit including adapter metadata');
select ok((select not(result_json::text like '%'||(select result#>>'{invite,code}' from adapter_results where n=2)||'%') from public.admin_command_receipts where request_id='a4000000-0000-4000-8000-000000000002'),'plaintext absent from general command receipt');
select throws_ok($$select public.beta_admin_v1_audit_receipt('a1000000-0000-4000-8000-000000000001',gen_random_uuid())$$,'P0001','AUDIT_RECEIPT_MISSING','no fabricated audit when row absent');
select throws_ok($$select public.beta_admin_command('a1000000-0000-4000-8000-000000000001',gen_random_uuid(),'grant_entitlement',
 '{"userId":"a1000000-0000-4000-8000-000000000010","durationDays":7,"_adminV1":{"contract":"vd-admin-v1","resource":"entitlements","action":"grant","target":"a1000000-0000-4000-8000-000000000010","reason":"理由","input":{"tier":"pro"}}}')$$,'P0001','PRO_NOT_SUPPORTED','SQL independently rejects Pro');
select throws_ok(format('select public.beta_admin_command(%L,gen_random_uuid(),%L,%L::jsonb)','a1000000-0000-4000-8000-000000000001','revoke_entitlement',
 jsonb_set((select args from adapter_cases where n=13),'{_adminV1,target}','"a1000000-0000-4000-8000-000000000011"')),'P0001','ADMIN_NOT_FOUND','grant id must belong to requested user');
select lives_ok(format('select public.beta_admin_command(%L,gen_random_uuid(),%L,%L::jsonb)','a1000000-0000-4000-8000-000000000005','review_application',(select args from adapter_cases where n=5)), 'reviewer can execute application command via same dispatcher');
select throws_ok(format('select public.beta_admin_command(%L,gen_random_uuid(),%L,%L::jsonb)','a1000000-0000-4000-8000-000000000005','grant_entitlement',(select args from adapter_cases where n=1)), 'P0001','ADMIN_REQUIRED','reviewer cannot execute membership commands');
select lives_ok($$select public.beta_admin_command('a1000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000099','grant_quota','{"userId":"a1000000-0000-4000-8000-000000000010","amount":1}')$$,'legacy command remains valid');
select ok((select adapter_command is null from public.admin_audit_log where request_id='a4000000-0000-4000-8000-000000000099'),'adapter metadata cannot leak into later legacy command');
select throws_ok($$select public.beta_admin_v1_audit_receipt('a1000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000099')$$,'P0001','AUDIT_RECEIPT_MISSING','legacy row cannot masquerade as adapter receipt');
reset role;

-- A historical audit with the same UUID must not leave a newly committed effect
-- that the HTTP receipt reader cannot disambiguate. Reject inside the transaction.
insert into public.admin_audit_log(actor_user_id,action,target_type,target_id,request_id) values
 ('a1000000-0000-4000-8000-000000000001','legacy_fixture','fixture','legacy','a4000000-0000-4000-8000-000000000097');
create temporary table adapter_before_ambiguous as select count(*) grants from public.admin_access_grants;
grant select on adapter_before_ambiguous to service_role;
set local role service_role;
select throws_ok(format('select public.beta_admin_command(%L,%L,%L,%L::jsonb)','a1000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000097','grant_entitlement',
 (select args from adapter_cases where n=1)),'P0001','AUDIT_RECEIPT_MISSING','ambiguous historical audit key fails inside command');
select is((select count(*) from public.admin_access_grants),(select grants from adapter_before_ambiguous),'ambiguous audit rolls back grant');
select is((select count(*)::integer from public.admin_command_receipts where request_id='a4000000-0000-4000-8000-000000000097'),0,'ambiguous audit leaves no receipt');
select is((select count(*)::integer from public.admin_audit_log where request_id='a4000000-0000-4000-8000-000000000097'),1,'ambiguous audit preserves only original historical row');
reset role;

create function pg_temp.fail_adapter_audit() returns trigger language plpgsql as $$begin
 if new.adapter_command->>'reason'='FAIL_ADAPTER_AUDIT' then raise exception 'ADAPTER_AUDIT_FAULT'; end if; return new; end $$;
create trigger adapter_audit_fault after insert on public.admin_audit_log for each row execute function pg_temp.fail_adapter_audit();
create temporary table adapter_before_fault as select count(*) grants from public.admin_access_grants;
grant select on adapter_before_fault to service_role;
set local role service_role;
select throws_ok(format('select public.beta_admin_command(%L,%L,%L,%L::jsonb)','a1000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000098','grant_entitlement',
 jsonb_set((select args from adapter_cases where n=1),'{_adminV1,reason}','"FAIL_ADAPTER_AUDIT"')),'P0001','ADAPTER_AUDIT_FAULT','audit insertion fault rolls back entitlement command');
select is((select count(*) from public.admin_access_grants),(select grants from adapter_before_fault),'audit fault leaves no grant');
select is((select count(*)::integer from public.admin_command_receipts where request_id='a4000000-0000-4000-8000-000000000098'),0,'audit fault leaves no poisoned receipt');
reset role;
update public.admin_roles set enabled=false where user_id='a1000000-0000-4000-8000-000000000001';
set local role service_role;
select throws_ok($$select public.beta_admin_v1_read('a1000000-0000-4000-8000-000000000001','users','{}')$$,'P0001','ADMIN_REQUIRED','revoked actor cannot read');
select throws_ok(format('select public.beta_admin_command(%L,%L,%L,%L::jsonb)','a1000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000002','create_invite',(select args from adapter_cases where n=2)), 'P0001','ADMIN_REQUIRED','revoked actor cannot replay invite');
select throws_ok($$select public.beta_admin_v1_audit_receipt('a1000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000002')$$,'P0001','ADMIN_REQUIRED','revoked actor cannot fetch original audit');
reset role;
select ok(not has_function_privilege(role,p.oid,'EXECUTE'),role||' denied adapter RPC '||p.proname)
 from pg_proc p cross join unnest(array['anon','authenticated']) role where p.pronamespace='public'::regnamespace and p.proname like 'beta_admin_v1_%';
select ok(not has_function_privilege('service_role',p.oid,'EXECUTE'),'service role cannot execute internal helper '||p.proname)
 from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('beta_admin_v1_rows','beta_admin_v1_user','beta_admin_v1_capture_audit','beta_review_application');
select ok(has_function_privilege('service_role',p.oid,'EXECUTE'),'service role can execute adapter entry '||p.proname)
 from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('beta_admin_v1_authorize','beta_admin_v1_read','beta_admin_v1_audit_receipt','beta_admin_command');
select * from finish();
rollback;
