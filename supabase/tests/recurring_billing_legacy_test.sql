begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('33333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'legacy-union@example.test', '', now(), now());

insert into public.billing_orders (id, user_id, provider, plan_code, amount_minor, currency, status, checkout_created_at, paid_at)
values ('33333333-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', 'paddle', 'vd_yearly', 19900, 'CNY', 'paid', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
insert into public.membership_grants (id, user_id, source, plan_code, duration_months, order_id, granted_at, period_start, period_end, note)
values
  ('33333333-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333', 'paddle', 'vd_yearly', 12, '33333333-0000-4000-8000-000000000001', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z', 'historical purchase'),
  ('33333333-0000-4000-8000-000000000003', '33333333-3333-4333-8333-333333333333', 'admin_grant', 'vd_monthly', 1, null, '2026-02-01T00:00:00Z', '2027-01-01T00:00:00Z', '2027-02-01T00:00:00Z', 'support grant');
insert into public.memberships (user_id, plan_code, starts_at, expires_at, source, last_grant_id)
values ('33333333-3333-4333-8333-333333333333', 'vd_monthly', '2026-01-01T00:00:00Z', '2027-02-01T00:00:00Z', 'admin_grant', '33333333-0000-4000-8000-000000000003');

insert into public.subscriptions (id, user_id, provider, provider_environment, provider_subscription_id, provider_customer_id, plan_code, catalog_version, status, current_period_start, current_period_end, provider_updated_at)
values ('33333333-0000-4000-8000-000000000004', '33333333-3333-4333-8333-333333333333', 'paddle', 'sandbox', 'sub_legacy_overlap', 'ctm_legacy_overlap', 'vd.plus.monthly.v1', 'vd-recurring-v1', 'active', '2026-06-01T00:00:00Z', '2026-07-01T00:00:00Z', '2026-06-01T00:00:00Z');
insert into public.payment_references (id, user_id, subscription_id, provider, provider_environment, provider_transaction_id, kind, status, currency, total_minor, occurred_at)
values ('33333333-0000-4000-8000-000000000005', '33333333-3333-4333-8333-333333333333', '33333333-0000-4000-8000-000000000004', 'paddle', 'sandbox', 'txn_legacy_overlap', 'subscription', 'paid', 'CNY', 1900, '2026-06-01T00:00:00Z');

select lives_ok($$select public.billing_rebuild_entitlements('33333333-3333-4333-8333-333333333333')$$, 'legacy and recurring sources rebuild together');
select is((select count(*)::integer from public.entitlements where user_id = '33333333-3333-4333-8333-333333333333'), 3, 'legacy purchase, admin grant, and subscription remain independent');
select is((select valid_until::text from public.entitlements where source_type = 'legacy_membership_grant'), '2027-01-01 00:00:00+00', 'historical legacy expiry is unchanged');
select is((select valid_until::text from public.entitlements where source_type = 'subscription'), '2026-07-01 00:00:00+00', 'subscription keeps its real provider period without stacking');
select is((select valid_until::text from public.entitlements where source_type = 'admin_grant'), '2027-02-01 00:00:00+00', 'admin grant coexists independently');
select is((select note from public.membership_grants where id = '33333333-0000-4000-8000-000000000002'), 'historical purchase', 'legacy grant evidence is preserved');
select is((select expires_at::text from public.memberships where user_id = '33333333-3333-4333-8333-333333333333'), '2027-02-01 00:00:00+00', 'legacy membership timeline is not shortened');

update public.membership_grants set revoked_at = '2026-06-15T00:00:00Z', revoke_reason = 'approved_full_refund' where id = '33333333-0000-4000-8000-000000000002';
select is((select status from public.entitlements where source_type = 'legacy_membership_grant'), 'revoked', 'revoked legacy grant is inactive');
select is((select status from public.entitlements where source_type = 'subscription'), 'active', 'active subscription survives a legacy refund');
select is((select status from public.entitlements where source_type = 'admin_grant'), 'active', 'admin grant survives an unrelated refund');

update public.payment_references set status = 'refunded' where id = '33333333-0000-4000-8000-000000000005';
select lives_ok($$select public.billing_rebuild_entitlements('33333333-3333-4333-8333-333333333333')$$, 'full recurring refund rebuilds projection');
select is((select status from public.entitlements where source_type = 'subscription'), 'inactive', 'full current-period refund removes recurring entitlement');
select is((select status from public.entitlements where source_type = 'admin_grant'), 'active', 'full recurring refund does not revoke admin access');
select is((select count(*)::integer from public.billing_orders where id = '33333333-0000-4000-8000-000000000001'), 1, 'Billing v1 order remains readable');

select * from finish();
rollback;
