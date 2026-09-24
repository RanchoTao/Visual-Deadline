begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

select has_table('public', 'subscriptions', 'subscriptions table exists');
select has_table('public', 'payment_references', 'payment references table exists');
select has_table('public', 'entitlements', 'entitlements table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.subscriptions'::regclass), 'subscriptions RLS is enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.payment_references'::regclass), 'payment references RLS is enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.entitlements'::regclass), 'entitlements RLS is enabled');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'billing-a@example.test', '', now(), now()),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'billing-b@example.test', '', now(), now());

insert into public.subscriptions (id, user_id, provider, provider_environment, provider_subscription_id, provider_customer_id, plan_code, catalog_version, status, current_period_start, current_period_end, provider_updated_at)
values
  ('11111111-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'paddle', 'sandbox', 'sub_owner_a', 'ctm_owner_a', 'vd.plus.monthly.v1', 'vd-recurring-v1', 'active', now() - interval '1 day', now() + interval '29 days', now()),
  ('22222222-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'paddle', 'sandbox', 'sub_owner_b', 'ctm_owner_b', 'vd.plus.annual.v1', 'vd-recurring-v1', 'active', now() - interval '1 day', now() + interval '364 days', now());
insert into public.payment_references (id, user_id, subscription_id, provider, provider_environment, provider_transaction_id, kind, status, currency, total_minor, occurred_at)
values ('11111111-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', '11111111-0000-4000-8000-000000000001', 'paddle', 'sandbox', 'txn_owner_a', 'subscription', 'paid', 'CNY', 1900, now());
insert into public.entitlements (id, user_id, capability, source_type, source_id, status, valid_from, valid_until, reason)
values ('11111111-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'vd.plus', 'subscription', '11111111-0000-4000-8000-000000000001', 'active', now() - interval '1 day', now() + interval '29 days', 'fixture');
insert into public.billing_events (id, provider, provider_environment, event_type, outcome, processing_status, processed_at)
values ('evt_rls_fixture', 'paddle', 'sandbox', 'subscription.created', 'fixture', 'succeeded', now());

set local role anon;
select throws_ok($$select count(*) from public.subscriptions$$, '42501', null, 'anonymous subscription select is denied');
select throws_ok($$select count(*) from public.payment_references$$, '42501', null, 'anonymous payment reference select is denied');
select throws_ok($$select count(*) from public.entitlements$$, '42501', null, 'anonymous entitlement select is denied');
select throws_ok($$select count(*) from public.billing_events$$, '42501', null, 'anonymous billing event select is denied');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is((select count(*)::integer from public.subscriptions), 1, 'owner subscription select is allowed');
select is((select count(*)::integer from public.subscriptions where user_id = '22222222-2222-4222-8222-222222222222'), 0, 'cross-user subscription select returns no rows');
select is((select count(*)::integer from public.payment_references), 1, 'owner payment reference select is allowed');
select is((select count(*)::integer from public.entitlements), 1, 'owner entitlement select is allowed');
select throws_ok($$select count(*) from public.billing_events$$, '42501', null, 'authenticated billing event select is denied');

select throws_ok($$insert into public.subscriptions (user_id, provider, provider_environment, provider_subscription_id, provider_customer_id, plan_code, catalog_version, status, provider_updated_at) values ('11111111-1111-4111-8111-111111111111', 'paddle', 'sandbox', 'sub_forged_self', 'ctm_self', 'vd.plus.monthly.v1', 'vd-recurring-v1', 'active', now())$$, '42501', null, 'authenticated subscription insert is denied');
select throws_ok($$insert into public.subscriptions (user_id, provider, provider_environment, provider_subscription_id, provider_customer_id, plan_code, catalog_version, status, provider_updated_at) values ('22222222-2222-4222-8222-222222222222', 'paddle', 'sandbox', 'sub_forged_other', 'ctm_other', 'vd.plus.monthly.v1', 'vd-recurring-v1', 'active', now())$$, '42501', null, 'forged subscription insert is denied');
select throws_ok($$update public.subscriptions set status = 'canceled' where id = '11111111-0000-4000-8000-000000000001'$$, '42501', null, 'authenticated subscription update is denied');
select throws_ok($$delete from public.subscriptions where id = '11111111-0000-4000-8000-000000000001'$$, '42501', null, 'authenticated subscription delete is denied');
select throws_ok($$insert into public.payment_references (user_id, provider, provider_environment, provider_transaction_id, kind, status, currency, occurred_at) values ('11111111-1111-4111-8111-111111111111', 'paddle', 'sandbox', 'txn_forged', 'subscription', 'paid', 'CNY', now())$$, '42501', null, 'authenticated payment insert is denied');
select throws_ok($$update public.payment_references set status = 'refunded' where id = '11111111-0000-4000-8000-000000000002'$$, '42501', null, 'authenticated payment update is denied');
select throws_ok($$delete from public.payment_references where id = '11111111-0000-4000-8000-000000000002'$$, '42501', null, 'authenticated payment delete is denied');
select throws_ok($$insert into public.entitlements (user_id, capability, source_type, source_id, status, valid_from, reason) values ('11111111-1111-4111-8111-111111111111', 'vd.plus', 'admin_grant', 'forged', 'active', now(), 'forged')$$, '42501', null, 'authenticated entitlement insert is denied');
select throws_ok($$update public.entitlements set valid_until = null where id = '11111111-0000-4000-8000-000000000003'$$, '42501', null, 'authenticated entitlement update is denied');
select throws_ok($$delete from public.entitlements where id = '11111111-0000-4000-8000-000000000003'$$, '42501', null, 'authenticated entitlement delete is denied');
select throws_ok($$select public.billing_rebuild_entitlements('11111111-1111-4111-8111-111111111111')$$, '42501', null, 'authenticated entitlement rebuild is denied');
select throws_ok($$insert into public.billing_events (id, provider, event_type, outcome) values ('evt_forged', 'paddle', 'subscription.updated', 'forged')$$, '42501', null, 'authenticated billing event insert is denied');

reset role;
select throws_ok(
  $$insert into public.payment_references (user_id, subscription_id, provider, provider_environment, provider_transaction_id, kind, status, currency, occurred_at) values ('22222222-2222-4222-8222-222222222222', '11111111-0000-4000-8000-000000000001', 'paddle', 'sandbox', 'txn_cross_owner', 'subscription', 'paid', 'CNY', now())$$,
  '23503', null, 'cross-user subscription payment relationship is rejected'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select is((select count(*)::integer from public.subscriptions), 1, 'user B reads only own subscription');
select is((select count(*)::integer from public.payment_references), 0, 'user B cannot read user A payments');
select is((select count(*)::integer from public.entitlements), 0, 'user B cannot read user A entitlements');

select * from finish();
rollback;
