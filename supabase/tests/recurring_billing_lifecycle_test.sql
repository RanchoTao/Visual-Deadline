begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('44444444-4444-4444-8444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lifecycle@example.test', '', now(), now());
insert into public.payment_references (id, user_id, provider, provider_environment, provider_transaction_id, kind, status, currency, occurred_at)
values ('44444444-0000-4000-8000-000000000001', '44444444-4444-4444-8444-444444444444', 'paddle', 'sandbox', 'txn_lifecycle', 'subscription', 'pending', 'CNY', '2026-09-01T00:00:00Z');

select is((select claim_status from public.billing_claim_event('evt_lifecycle', 'sandbox', 'subscription.created', repeat('a', 64), '2026-09-01T00:00:00Z')), 'claimed', 'first provider event is claimed');
select is((select claim_status from public.billing_claim_event('evt_lifecycle', 'sandbox', 'subscription.created', repeat('a', 64), '2026-09-01T00:00:00Z')), 'in_progress', 'concurrent duplicate is not processed twice');
select lives_ok($$select public.billing_finish_event('evt_lifecycle', 'succeeded', 'subscription_applied')$$, 'claimed event can finish');
select is((select claim_status from public.billing_claim_event('evt_lifecycle', 'sandbox', 'subscription.created', repeat('a', 64), '2026-09-01T00:00:00Z')), 'duplicate_succeeded', 'succeeded replay has zero effect');

select is(
  (select outcome from public.billing_apply_subscription_snapshot('sandbox', 'sub_lifecycle', 'ctm_lifecycle', 'vd.plus.monthly.v1', 'vd-recurring-v1', 'active', '2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z', null, null, null, '2026-09-01T00:00:00Z', 'evt_lifecycle', 'txn_lifecycle')),
  'subscription_applied', 'known checkout transaction binds subscription'
);
select is((select status from public.entitlements where source_type = 'subscription'), 'active', 'active subscription grants recurring entitlement');

select is(
  (select outcome from public.billing_apply_subscription_snapshot('sandbox', 'sub_lifecycle', 'ctm_lifecycle', 'vd.plus.monthly.v1', 'vd-recurring-v1', 'canceled', '2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z', null, '2026-09-20T00:00:00Z', null, '2026-09-20T00:00:00Z', 'evt_canceled', null)),
  'subscription_applied', 'newer cancellation is applied'
);
select is(
  (select outcome from public.billing_apply_subscription_snapshot('sandbox', 'sub_lifecycle', 'ctm_lifecycle', 'vd.plus.monthly.v1', 'vd-recurring-v1', 'active', '2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z', null, null, null, '2026-09-10T00:00:00Z', 'evt_old_active', null)),
  'ignored_stale_subscription', 'older active event cannot reactivate canceled state'
);
select is((select status from public.subscriptions where provider_subscription_id = 'sub_lifecycle'), 'canceled', 'stale event leaves canceled provider truth intact');
select is(
  (select outcome from public.billing_apply_subscription_snapshot('sandbox', 'sub_lifecycle', 'ctm_wrong', 'vd.plus.monthly.v1', 'vd-recurring-v1', 'active', '2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z', null, null, null, '2026-09-21T00:00:00Z', 'evt_wrong_customer', null)),
  'ignored_customer_mismatch', 'wrong customer cannot take over known subscription'
);

select is(
  (select outcome from public.billing_apply_payment_reference('sandbox', 'txn_lifecycle', 'sub_lifecycle', 'adjustment', 'refunded', 'CNY', 1900, 0, 1900, '2026-09-25T00:00:00Z')),
  'payment_applied', 'approved full refund is applied'
);
select is((select status from public.payment_references where provider_transaction_id = 'txn_lifecycle'), 'refunded', 'full refund is financial truth');
select is(
  (select outcome from public.billing_apply_payment_reference('sandbox', 'txn_lifecycle', 'sub_lifecycle', 'subscription', 'paid', 'CNY', 1900, 0, 1900, '2026-09-05T00:00:00Z')),
  'payment_applied', 'delayed completion is safely acknowledged'
);
select is((select status from public.payment_references where provider_transaction_id = 'txn_lifecycle'), 'refunded', 'delayed completion cannot undo approved full refund');
select is(
  (select outcome from public.billing_apply_payment_reference('sandbox', 'txn_unknown', 'sub_unknown', 'renewal', 'paid', 'CNY', 1900, 0, 1900, '2026-09-05T00:00:00Z')),
  'ignored_unknown_provider_evidence', 'unknown subscription and transaction cannot grant entitlement'
);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('55555555-5555-4555-8555-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'customer-owner@example.test', '', now(), now());
insert into public.payment_references (user_id, provider, provider_environment, provider_transaction_id, kind, status, currency, occurred_at)
values ('55555555-5555-4555-8555-555555555555', 'paddle', 'sandbox', 'txn_customer_takeover', 'subscription', 'pending', 'CNY', '2026-09-01T00:00:00Z');
select is(
  (select outcome from public.billing_apply_subscription_snapshot('sandbox', 'sub_customer_takeover', 'ctm_lifecycle', 'vd.plus.monthly.v1', 'vd-recurring-v1', 'active', '2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z', null, null, null, '2026-09-22T00:00:00Z', 'evt_customer_takeover', 'txn_customer_takeover')),
  'ignored_customer_mismatch', 'one Paddle customer cannot be bound to a different VD user'
);

select * from finish();
rollback;
