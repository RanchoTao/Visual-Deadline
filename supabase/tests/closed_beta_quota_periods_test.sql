begin;
select no_plan();

insert into auth.users(id,email) values
  ('abababab-abab-4bab-8bab-abababababab','quota-admin@example.test'),
  ('cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd','quota-user@example.test'),
  ('efefefef-efef-4fef-8fef-efefefefefef','quota-unauthorized@example.test');
insert into public.admin_roles(user_id,role,created_by)
  values('abababab-abab-4bab-8bab-abababababab','admin','abababab-abab-4bab-8bab-abababababab');
update public.ai_quota_policies set requests_per_period=200,period_interval=interval '1 month' where tier='free';
insert into public.ai_usage_events(user_id,request_id,provider,model,feature,status,created_at)
  select 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd',gen_random_uuid(),'deepseek','test','task_analysis','succeeded',now() from generate_series(1,100);

set local role service_role;
select is((public.beta_ai_quota_snapshot('cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd')->>'remaining')::integer,100,'base 200 used 100 leaves 100');
select lives_ok($$select public.beta_admin_command('abababab-abab-4bab-8bab-abababababab',gen_random_uuid(),'reset_quota',jsonb_build_object('userId','cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd','reason','reset-test'))$$,'reset and audit commit together');
select is((public.beta_ai_quota_snapshot('cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd')->>'remaining')::integer,200,'reset restores 200 remaining THIS period');
select is((select amount from public.ai_quota_grants where user_id='cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd' and source_kind='period_reset'),100,'reset compensation equals used not a permanent boost');
select is((select valid_until from public.ai_quota_grants where user_id='cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd'),(public.beta_ai_quota_snapshot('cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd')->>'period_end')::timestamptz,'reset expires exactly at authoritative period boundary');
select is((select count(*)::integer from public.admin_audit_log where action='quota_reset' and reason='reset-test'),1,'reset has audit evidence');
select is((public.beta_ai_quota_snapshot('cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd',(public.beta_ai_quota_snapshot('cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd')->>'period_end')::timestamptz)->>'remaining')::integer,200,'next period returns to base 200 not 300');
select lives_ok($$select public.beta_admin_command('abababab-abab-4bab-8bab-abababababab',gen_random_uuid(),'reset_quota',jsonb_build_object('userId','cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd','reason','repeat-test'))$$,'repeated reset is supported');
select is((select count(*)::integer from public.ai_quota_grants where user_id='cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd' and source_kind='period_reset'),1,'repeated reset updates one compensation row');
select is((public.beta_ai_quota_snapshot('cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd')->>'remaining')::integer,200,'repeated reset does not compound current allowance');
select is((public.beta_ai_quota_snapshot('cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd',now()+interval '2 months')->>'remaining')::integer,200,'repeated reset cannot compound future quota');
select throws_ok($$select public.beta_admin_command('efefefef-efef-4fef-8fef-efefefefefef',gen_random_uuid(),'reset_quota',jsonb_build_object('userId','cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd','reason','forged'))$$,'P0001','ADMIN_REQUIRED','RPC rechecks mutation actor role');

-- Genuine SQL trigger failure: no fake repository or compensation request.
reset role;
create function public.quota_test_audit_fault() returns trigger language plpgsql as $$
begin if new.reason in ('fault-grant','fault-reset') then raise exception 'QUOTA_AUDIT_FAULT'; end if; return new; end $$;
create trigger quota_test_audit_fault before insert on public.admin_audit_log for each row execute function public.quota_test_audit_fault();
set local role service_role;
select throws_ok($$select public.beta_admin_command('abababab-abab-4bab-8bab-abababababab',gen_random_uuid(),'grant_quota',jsonb_build_object('userId','cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd','amount',999,'unlimited',false,'validFrom',now(),'validUntil',null,'reason','fault-grant'))$$,'P0001','QUOTA_AUDIT_FAULT','audit fault aborts grant transaction');
select is((select count(*)::integer from public.ai_quota_grants where reason='fault-grant'),0,'audit fault leaves no quota grant');
select ok(public.consume_ai_quota('cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd',gen_random_uuid(),'deepseek','test','task_analysis'),'post-reset consumption succeeds');
select throws_ok($$select public.beta_admin_command('abababab-abab-4bab-8bab-abababababab',gen_random_uuid(),'reset_quota',jsonb_build_object('userId','cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd','reason','fault-reset'))$$,'P0001','QUOTA_AUDIT_FAULT','audit fault aborts reset transaction');
select is((select amount from public.ai_quota_grants where source_kind='period_reset'),100,'failed reset rolls back existing compensation UPDATE');
select is((public.beta_ai_quota_snapshot('cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd')->>'remaining')::integer,199,'failed reset does not restore un-audited quota');
select is((select count(*)::integer from public.admin_audit_log where reason in ('fault-grant','fault-reset')),0,'failed mutations leave no orphan audits');
select throws_ok($$select public.beta_admin_command('abababab-abab-4bab-8bab-abababababab',gen_random_uuid(),'reset_quota',jsonb_build_object('userId','efefefef-efef-4fef-8fef-efefefefefef','reason','fault-reset'))$$,'P0001','QUOTA_AUDIT_FAULT','audit fault also aborts first reset INSERT');
select is((select count(*)::integer from public.ai_quota_grants where user_id='efefefef-efef-4fef-8fef-efefefefefef'),0,'failed first reset leaves no compensation');
select lives_ok($$select public.beta_admin_command('abababab-abab-4bab-8bab-abababababab',gen_random_uuid(),'reset_quota',jsonb_build_object('userId','cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd','reason','subsequent-reset'))$$,'later successful reset updates compensation to total used');
select is((public.beta_ai_quota_snapshot('cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd')->>'remaining')::integer,200,'successful later reset restores base allowance');

select lives_ok($$select public.beta_admin_command('abababab-abab-4bab-8bab-abababababab',gen_random_uuid(),'grant_quota',jsonb_build_object('userId','cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd','amount',null,'unlimited',true,'validFrom',now(),'validUntil',null,'reason','explicit-unlimited'))$$,'explicit unlimited grant stays separate');
select ok((public.beta_ai_quota_snapshot('cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd')->>'unlimited')::boolean,'manual unlimited grant works');
select ok((public.beta_ai_quota_snapshot('cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd',now()+interval '2 months')->>'unlimited')::boolean,'explicit permanent unlimited policy is preserved in future');
select ok((select not unlimited from public.ai_quota_grants where source_kind='period_reset'),'reset NEVER creates unlimited allowance');
select throws_ok($$select public.beta_admin_command('abababab-abab-4bab-8bab-abababababab',gen_random_uuid(),'grant_quota',jsonb_build_object('userId','cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd','amount',200,'unlimited',true,'validFrom',now(),'validUntil',null,'reason','ambiguous'))$$,'P0001','ADMIN_INPUT_INVALID','unlimited is an explicit distinct grant shape');
select lives_ok($$select public.beta_admin_command('abababab-abab-4bab-8bab-abababababab',gen_random_uuid(),'grant_quota',jsonb_build_object('userId','cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd','amount',50,'unlimited',false,'validFrom',now(),'validUntil',null,'reason','manual-finite'))$$,'explicit manual finite grant remains compatible');
select is((public.beta_ai_quota_snapshot('cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd',now()+interval '2 months')->>'remaining')::integer,250,'future base includes only explicit manual finite grant');

reset role;
select is((public.beta_ai_quota_period(interval '1 month','2028-02-29T23:59:59Z')->>'end')::timestamptz,'2028-03-01T00:00:00Z'::timestamptz,'calendar monthly boundary handles leap year');
select is((public.beta_ai_quota_period(interval '3 months','2026-09-30T23:59:59Z')->>'start')::timestamptz,'2026-07-01T00:00:00Z'::timestamptz,'quarterly policy is not silently monthly');
select is((public.beta_ai_quota_period(interval '1 year','2026-09-28T00:00:00Z')->>'end')::timestamptz,'2027-01-01T00:00:00Z'::timestamptz,'annual policy keeps calendar-year boundary');
select is((public.beta_ai_quota_period(interval '2 days','2026-09-28T12:00:00Z')->>'end')::timestamptz - (public.beta_ai_quota_period(interval '2 days','2026-09-28T12:00:00Z')->>'start')::timestamptz,interval '2 days','fixed policy interval is honored');
select is((public.beta_ai_quota_period(interval '1 month 1 day','2000-02-01T12:00:00Z')->>'end')::timestamptz,'2000-02-02T00:00:00Z'::timestamptz,'mixed positive interval uses anchor calendar arithmetic');
select is((public.beta_ai_quota_period(interval '1 month','1999-12-31T12:00:00Z')->>'start')::timestamptz,'1999-12-01T00:00:00Z'::timestamptz,'pre-anchor calendar periods are valid');
set local timezone='America/New_York';
select is((public.beta_ai_quota_period(interval '1 month','2026-11-01T05:30:00Z')->>'start')::timestamptz,'2026-11-01T00:00:00Z'::timestamptz,'DST/session timezone cannot shift quota boundary');
set local timezone='UTC';
select throws_ok($$select public.beta_ai_quota_period(interval '0',now())$$,'P0001','AI_QUOTA_POLICY_INVALID','invalid policy fails closed');
update public.ai_quota_policies set period_interval=interval '2 days' where tier='free';
select lives_ok($$select public.beta_admin_command('abababab-abab-4bab-8bab-abababababab',gen_random_uuid(),'reset_quota',jsonb_build_object('userId','cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd','reason','fixed-period-reset'))$$,'reset uses configured non-monthly policy');
select is((select valid_until from public.ai_quota_grants where reason='fixed-period-reset'),(public.beta_ai_quota_period(interval '2 days',now())->>'end')::timestamptz,'non-monthly reset expires at actual policy boundary');
select is((public.beta_ai_quota_snapshot('cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd')->>'extra')::integer,151,'policy change excludes old-period reset compensation');

-- Every helper/mutation is service-only, with no broadened client privileges.
select ok(has_function_privilege('service_role',p.oid,'EXECUTE'),p.proname || ' service role EXECUTE allowed')
  from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('beta_ai_quota_period','beta_ai_quota_snapshot','beta_admin_command','consume_ai_quota');
select ok(not has_function_privilege('authenticated',p.oid,'EXECUTE'),p.proname || ' authenticated EXECUTE denied')
  from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('beta_ai_quota_period','beta_ai_quota_snapshot','beta_admin_command','consume_ai_quota');
select ok(not has_function_privilege('anon',p.oid,'EXECUTE'),p.proname || ' anonymous EXECUTE denied')
  from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('beta_ai_quota_period','beta_ai_quota_snapshot','beta_admin_command','consume_ai_quota');
select * from finish();
rollback;
