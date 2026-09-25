-- Visual Deadline V2 PR N: recurring Paddle subscriptions and provider-independent entitlements.
-- Billing v1 tables and their historical rows remain authoritative legacy evidence.

begin;

alter table public.billing_orders
  add column provider_environment text not null default 'legacy_unknown'
  constraint billing_orders_provider_environment_check
  check (provider_environment in ('sandbox', 'production', 'legacy_unknown'));

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider = 'paddle'),
  provider_environment text not null check (provider_environment in ('sandbox', 'production')),
  provider_subscription_id text not null,
  provider_customer_id text not null,
  plan_code text not null check (plan_code in ('vd.plus.monthly.v1', 'vd.plus.annual.v1')),
  catalog_version text not null check (catalog_version = 'vd-recurring-v1'),
  status text not null check (status in ('trialing', 'active', 'past_due', 'paused', 'cancel_scheduled', 'canceled', 'expired')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at timestamptz,
  canceled_at timestamptz,
  scheduled_change jsonb,
  provider_updated_at timestamptz not null,
  last_provider_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_provider_identity_key unique (provider, provider_environment, provider_subscription_id),
  constraint subscriptions_id_owner_key unique (id, user_id),
  constraint subscriptions_period_check check (
    current_period_start is null or current_period_end is null or current_period_end > current_period_start
  )
);

create table public.payment_references (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_id uuid,
  provider text not null check (provider = 'paddle'),
  provider_environment text not null check (provider_environment in ('sandbox', 'production')),
  provider_transaction_id text not null,
  kind text not null check (kind in ('subscription', 'renewal', 'adjustment')),
  status text not null check (status in ('pending', 'paid', 'failed', 'partially_refunded', 'refunded')),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  subtotal_minor bigint not null default 0 check (subtotal_minor >= 0),
  tax_minor bigint not null default 0 check (tax_minor >= 0),
  total_minor bigint not null default 0 check (total_minor >= 0),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_references_provider_identity_key unique (provider, provider_environment, provider_transaction_id),
  constraint payment_references_subscription_owner_fk
    foreign key (subscription_id, user_id) references public.subscriptions(id, user_id)
);

create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  capability text not null check (capability = 'vd.plus'),
  source_type text not null check (source_type in ('subscription', 'legacy_membership_grant', 'legacy_membership', 'admin_grant')),
  source_id text not null,
  status text not null check (status in ('active', 'inactive', 'revoked', 'expired')),
  valid_from timestamptz not null,
  valid_until timestamptz,
  reason text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entitlements_source_key unique (user_id, capability, source_type, source_id),
  constraint entitlements_period_check check (valid_until is null or valid_until > valid_from)
);

alter table public.billing_events
  add column provider_environment text not null default 'legacy_unknown',
  add column event_source text not null default 'migration',
  add column payload_checksum text,
  add column received_at timestamptz,
  add column processing_status text not null default 'legacy',
  add column processing_attempts integer not null default 0,
  add column last_error text,
  add column subscription_id uuid references public.subscriptions(id) on delete set null,
  add column payment_reference_id uuid references public.payment_references(id) on delete set null,
  add column provider_sequence text,
  add column provider_version integer;

alter table public.billing_events
  alter column received_at set default now(),
  alter column processing_status set default 'received',
  alter column processing_attempts set default 0,
  alter column event_source drop default;

alter table public.billing_events
  add constraint billing_events_provider_environment_check
  check (provider_environment in ('sandbox', 'production', 'legacy_unknown'));
alter table public.billing_events
  add constraint billing_events_source_check
  check (event_source in ('webhook', 'reconciliation', 'migration', 'manual_admin'));
alter table public.billing_events
  add constraint billing_events_processing_status_check
  check (processing_status in ('legacy', 'received', 'processing', 'succeeded', 'retryable_failed', 'ignored'));
alter table public.billing_events
  add constraint billing_events_payload_checksum_check
  check (payload_checksum is null or payload_checksum ~ '^[a-f0-9]{64}$');

create index subscriptions_user_updated_idx on public.subscriptions(user_id, updated_at desc);
create index subscriptions_customer_owner_idx on public.subscriptions(provider, provider_environment, provider_customer_id, user_id);
create index subscriptions_reconciliation_idx on public.subscriptions(provider_environment, status, provider_updated_at)
  where status in ('trialing', 'active', 'past_due', 'paused', 'cancel_scheduled');
create index payment_references_user_occurred_idx on public.payment_references(user_id, occurred_at desc);
create index payment_references_subscription_idx on public.payment_references(subscription_id, occurred_at desc);
create index entitlements_user_capability_idx on public.entitlements(user_id, capability, valid_until desc);
create index entitlements_active_idx on public.entitlements(user_id, capability, valid_from, valid_until)
  where status = 'active';
create index billing_events_processing_idx on public.billing_events(processing_status, received_at);
create index billing_events_subscription_idx on public.billing_events(subscription_id, occurred_at desc);

create trigger subscriptions_set_updated_at
before update on public.subscriptions
for each row execute function public.set_billing_updated_at();

create trigger payment_references_set_updated_at
before update on public.payment_references
for each row execute function public.set_billing_updated_at();

create trigger entitlements_set_updated_at
before update on public.entitlements
for each row execute function public.set_billing_updated_at();

alter table public.subscriptions enable row level security;
alter table public.payment_references enable row level security;
alter table public.entitlements enable row level security;

revoke all on table public.subscriptions from public, anon, authenticated;
revoke all on table public.payment_references from public, anon, authenticated;
revoke all on table public.entitlements from public, anon, authenticated;
revoke all on table public.billing_events from public, anon, authenticated;

grant select on table public.subscriptions to authenticated;
grant select on table public.payment_references to authenticated;
grant select on table public.entitlements to authenticated;

create policy subscriptions_select_own
on public.subscriptions
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy payment_references_select_own
on public.payment_references
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy entitlements_select_own
on public.entitlements
for select
to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.billing_rebuild_entitlements(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('entitlement:' || p_user_id::text));

  insert into public.entitlements (
    user_id, capability, source_type, source_id, status, valid_from, valid_until, reason
  )
  select
    grant_row.user_id,
    'vd.plus',
    case when grant_row.source = 'admin_grant' then 'admin_grant' else 'legacy_membership_grant' end,
    grant_row.id::text,
    case when grant_row.revoked_at is null then 'active' else 'revoked' end,
    coalesce(grant_row.period_start, grant_row.granted_at),
    grant_row.period_end,
    case
      when grant_row.revoked_at is not null then 'legacy_grant_revoked:' || coalesce(grant_row.revoke_reason, 'unknown')
      else 'legacy_' || grant_row.source
    end
  from public.membership_grants grant_row
  where grant_row.user_id = p_user_id
    and coalesce(grant_row.period_start, grant_row.granted_at) is not null
    and grant_row.period_end is not null
  on conflict (user_id, capability, source_type, source_id) do update
  set status = excluded.status,
      valid_from = excluded.valid_from,
      valid_until = excluded.valid_until,
      reason = excluded.reason,
      updated_at = now();

  insert into public.entitlements (
    user_id, capability, source_type, source_id, status, valid_from, valid_until, reason
  )
  select membership.user_id, 'vd.plus', 'legacy_membership', membership.user_id::text,
         'active', membership.starts_at, membership.expires_at, 'legacy_membership_projection'
  from public.memberships membership
  where membership.user_id = p_user_id
    and not exists (select 1 from public.membership_grants grant_row where grant_row.user_id = p_user_id)
  on conflict (user_id, capability, source_type, source_id) do update
  set status = excluded.status,
      valid_from = excluded.valid_from,
      valid_until = excluded.valid_until,
      reason = excluded.reason,
      updated_at = now();

  insert into public.entitlements (
    user_id, capability, source_type, source_id, status, valid_from, valid_until, reason
  )
  select
    subscription.user_id,
    'vd.plus',
    'subscription',
    subscription.id::text,
    case
      when current_refund.is_refunded then 'inactive'
      when subscription.status in ('active', 'past_due', 'cancel_scheduled', 'canceled')
        and subscription.current_period_start is not null
        and subscription.current_period_end is not null then 'active'
      else 'inactive'
    end,
    coalesce(subscription.current_period_start, subscription.created_at),
    case
      when subscription.status = 'past_due' and subscription.current_period_end is not null
        then subscription.current_period_end + interval '72 hours'
      else subscription.current_period_end
    end,
    case
      when current_refund.is_refunded then 'recurring_current_period_full_refund'
      when subscription.status = 'past_due' then 'recurring_past_due_72h_grace'
      when subscription.status = 'trialing' then 'recurring_trial_disabled'
      when subscription.status = 'paused' then 'recurring_paused'
      else 'recurring_' || subscription.status
    end
  from public.subscriptions subscription
  cross join lateral (
    select exists (
      select 1
      from public.payment_references payment
      where payment.subscription_id = subscription.id
        and payment.status = 'refunded'
        and payment.occurred_at >= coalesce(subscription.current_period_start, '-infinity'::timestamptz)
        and payment.occurred_at <= coalesce(subscription.current_period_end, 'infinity'::timestamptz)
    ) as is_refunded
  ) current_refund
  where subscription.user_id = p_user_id
  on conflict (user_id, capability, source_type, source_id) do update
  set status = excluded.status,
      valid_from = excluded.valid_from,
      valid_until = excluded.valid_until,
      reason = excluded.reason,
      updated_at = now();

  update public.entitlements entitlement
  set status = 'inactive',
      reason = 'source_no_longer_present',
      updated_at = now()
  where entitlement.user_id = p_user_id
    and entitlement.capability = 'vd.plus'
    and (
      (entitlement.source_type = 'subscription' and not exists (
        select 1 from public.subscriptions subscription
        where subscription.id::text = entitlement.source_id and subscription.user_id = p_user_id
      ))
      or (entitlement.source_type in ('legacy_membership_grant', 'admin_grant') and not exists (
        select 1 from public.membership_grants grant_row
        where grant_row.id::text = entitlement.source_id and grant_row.user_id = p_user_id
      ))
      or (entitlement.source_type = 'legacy_membership' and not exists (
        select 1 from public.memberships membership where membership.user_id = p_user_id
      ))
      or (entitlement.source_type = 'legacy_membership' and exists (
        select 1 from public.membership_grants grant_row where grant_row.user_id = p_user_id
      ))
    );
end;
$$;

create or replace function public.billing_claim_event(
  p_event_id text,
  p_provider_environment text,
  p_event_source text,
  p_event_type text,
  p_payload_checksum text,
  p_occurred_at timestamptz,
  p_provider_sequence text default null,
  p_provider_version integer default null
)
returns table(claim_status text, attempt integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.billing_events%rowtype;
begin
  if p_provider_environment not in ('sandbox', 'production') then
    raise exception 'Invalid provider environment';
  end if;
  if p_event_source not in ('webhook', 'reconciliation', 'migration', 'manual_admin') then
    raise exception 'Invalid billing event source';
  end if;
  if p_event_id is null or p_event_id = '' or p_event_type is null or p_event_type = '' or p_occurred_at is null then
    raise exception 'Invalid provider event identity';
  end if;

  select * into existing from public.billing_events where id = p_event_id for update;
  if not found then
    insert into public.billing_events (
      id, provider, provider_environment, event_source, event_type, outcome, occurred_at,
      payload_checksum, received_at, processing_status, processing_attempts,
      provider_sequence, provider_version
    ) values (
      p_event_id, 'paddle', p_provider_environment, p_event_source, p_event_type, 'processing', p_occurred_at,
      p_payload_checksum, now(), 'processing', 1, p_provider_sequence, p_provider_version
    );
    return query select 'claimed'::text, 1;
    return;
  end if;

  if existing.provider_environment not in (p_provider_environment, 'legacy_unknown') then
    return query select 'environment_conflict'::text, existing.processing_attempts;
    return;
  end if;
  if existing.event_source <> p_event_source then
    return query select 'source_conflict'::text, existing.processing_attempts;
    return;
  end if;
  if existing.payload_checksum is not null and existing.payload_checksum <> p_payload_checksum then
    return query select 'checksum_conflict'::text, existing.processing_attempts;
    return;
  end if;
  if existing.processing_status in ('succeeded', 'ignored', 'legacy') then
    return query select 'duplicate_succeeded'::text, existing.processing_attempts;
    return;
  end if;
  if existing.processing_status = 'processing' and existing.received_at > now() - interval '5 minutes' then
    return query select 'in_progress'::text, existing.processing_attempts;
    return;
  end if;

  update public.billing_events
  set processing_status = 'processing',
      processing_attempts = processing_attempts + 1,
      received_at = now(),
      last_error = null,
      payload_checksum = coalesce(payload_checksum, p_payload_checksum),
      provider_sequence = coalesce(p_provider_sequence, provider_sequence),
      provider_version = coalesce(p_provider_version, provider_version)
  where id = p_event_id;
  return query select 'claimed'::text, existing.processing_attempts + 1;
end;
$$;

create or replace function public.billing_recover_checkout_payment(
  p_user_id uuid,
  p_provider_environment text,
  p_provider_transaction_id text,
  p_currency text,
  p_subtotal_minor bigint,
  p_tax_minor bigint,
  p_total_minor bigint,
  p_occurred_at timestamptz
)
returns table(outcome text, applied_payment_reference_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.payment_references%rowtype;
  recovered_id uuid;
begin
  if p_provider_environment not in ('sandbox', 'production')
    or p_provider_transaction_id is null or p_provider_transaction_id = ''
    or p_currency !~ '^[A-Z]{3}$'
    or p_subtotal_minor < 0 or p_tax_minor < 0 or p_total_minor < 0
    or p_occurred_at is null then
    raise exception 'Invalid checkout recovery evidence';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    return query select 'ignored_unknown_user'::text, null::uuid;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('payment:paddle:' || p_provider_environment || ':' || p_provider_transaction_id));
  select * into existing
  from public.payment_references
  where provider = 'paddle'
    and provider_environment = p_provider_environment
    and provider_transaction_id = p_provider_transaction_id
  for update;

  if found then
    if existing.user_id <> p_user_id then
      return query select 'ignored_user_mismatch'::text, existing.id;
      return;
    end if;
    return query select 'checkout_payment_already_known'::text, existing.id;
    return;
  end if;

  insert into public.payment_references (
    user_id, provider, provider_environment, provider_transaction_id,
    kind, status, currency, subtotal_minor, tax_minor, total_minor, occurred_at
  ) values (
    p_user_id, 'paddle', p_provider_environment, p_provider_transaction_id,
    'subscription', 'pending', p_currency, p_subtotal_minor, p_tax_minor, p_total_minor, p_occurred_at
  ) returning id into recovered_id;

  return query select 'checkout_payment_recovered'::text, recovered_id;
end;
$$;

create or replace function public.billing_finish_event(
  p_event_id text,
  p_processing_status text,
  p_outcome text,
  p_last_error text default null,
  p_subscription_id uuid default null,
  p_payment_reference_id uuid default null,
  p_provider_transaction_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_processing_status not in ('succeeded', 'retryable_failed', 'ignored') then
    raise exception 'Invalid final processing status';
  end if;
  update public.billing_events
  set processing_status = p_processing_status,
      outcome = p_outcome,
      last_error = left(p_last_error, 1000),
      subscription_id = coalesce(p_subscription_id, subscription_id),
      payment_reference_id = coalesce(p_payment_reference_id, payment_reference_id),
      provider_transaction_id = coalesce(p_provider_transaction_id, provider_transaction_id),
      processed_at = now()
  where id = p_event_id;
end;
$$;

create or replace function public.billing_apply_subscription_snapshot(
  p_provider_environment text,
  p_provider_subscription_id text,
  p_provider_customer_id text,
  p_plan_code text,
  p_catalog_version text,
  p_status text,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz,
  p_cancel_at timestamptz,
  p_canceled_at timestamptz,
  p_scheduled_change jsonb,
  p_provider_updated_at timestamptz,
  p_event_id text,
  p_originating_transaction_id text default null
)
returns table(outcome text, applied_subscription_id uuid, applied_user_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.subscriptions%rowtype;
  target_user uuid;
  target_subscription uuid;
  customer_user uuid;
  current_rank integer;
  next_rank integer;
begin
  if p_provider_environment not in ('sandbox', 'production')
    or p_plan_code not in ('vd.plus.monthly.v1', 'vd.plus.annual.v1')
    or p_catalog_version <> 'vd-recurring-v1'
    or p_status not in ('trialing', 'active', 'past_due', 'paused', 'cancel_scheduled', 'canceled', 'expired') then
    raise exception 'Invalid recurring subscription snapshot';
  end if;

  perform pg_advisory_xact_lock(hashtext('subscription:paddle:' || p_provider_environment || ':' || p_provider_subscription_id));
  perform pg_advisory_xact_lock(hashtext('customer:paddle:' || p_provider_environment || ':' || p_provider_customer_id));
  select * into existing
  from public.subscriptions
  where provider = 'paddle'
    and provider_environment = p_provider_environment
    and provider_subscription_id = p_provider_subscription_id
  for update;

  if found then
    if existing.provider_customer_id <> p_provider_customer_id then
      return query select 'ignored_customer_mismatch'::text, existing.id, existing.user_id;
      return;
    end if;
    target_user := existing.user_id;
    target_subscription := existing.id;
    current_rank := case existing.status when 'trialing' then 0 when 'active' then 1 when 'past_due' then 2 when 'cancel_scheduled' then 3 when 'paused' then 4 when 'canceled' then 5 else 6 end;
    next_rank := case p_status when 'trialing' then 0 when 'active' then 1 when 'past_due' then 2 when 'cancel_scheduled' then 3 when 'paused' then 4 when 'canceled' then 5 else 6 end;
    if p_provider_updated_at < existing.provider_updated_at
      or (p_provider_updated_at = existing.provider_updated_at and next_rank < current_rank) then
      return query select 'ignored_stale_subscription'::text, existing.id, existing.user_id;
      return;
    end if;

    update public.subscriptions
    set plan_code = p_plan_code,
        catalog_version = p_catalog_version,
        status = p_status,
        current_period_start = p_current_period_start,
        current_period_end = p_current_period_end,
        cancel_at = p_cancel_at,
        canceled_at = p_canceled_at,
        scheduled_change = p_scheduled_change,
        provider_updated_at = p_provider_updated_at,
        last_provider_event_id = p_event_id
    where id = existing.id;
  else
    select payment.user_id into target_user
    from public.payment_references payment
    where payment.provider = 'paddle'
      and payment.provider_environment = p_provider_environment
      and payment.provider_transaction_id = p_originating_transaction_id
    for update;
    if target_user is null then
      return query select 'ignored_unknown_provider_evidence'::text, null::uuid, null::uuid;
      return;
    end if;

    select subscription.user_id into customer_user
    from public.subscriptions subscription
    where subscription.provider = 'paddle'
      and subscription.provider_environment = p_provider_environment
      and subscription.provider_customer_id = p_provider_customer_id
    limit 1;
    if customer_user is not null and customer_user <> target_user then
      return query select 'ignored_customer_mismatch'::text, null::uuid, target_user;
      return;
    end if;

    insert into public.subscriptions (
      user_id, provider, provider_environment, provider_subscription_id, provider_customer_id,
      plan_code, catalog_version, status, current_period_start, current_period_end,
      cancel_at, canceled_at, scheduled_change, provider_updated_at, last_provider_event_id
    ) values (
      target_user, 'paddle', p_provider_environment, p_provider_subscription_id, p_provider_customer_id,
      p_plan_code, p_catalog_version, p_status, p_current_period_start, p_current_period_end,
      p_cancel_at, p_canceled_at, p_scheduled_change, p_provider_updated_at, p_event_id
    ) returning id into target_subscription;
  end if;

  if p_originating_transaction_id is not null then
    update public.payment_references
    set subscription_id = target_subscription
    where provider = 'paddle'
      and provider_environment = p_provider_environment
      and provider_transaction_id = p_originating_transaction_id
      and user_id = target_user
      and subscription_id is null;
  end if;

  perform public.billing_rebuild_entitlements(target_user);
  return query select 'subscription_applied'::text, target_subscription, target_user;
end;
$$;

create or replace function public.billing_apply_payment_reference(
  p_provider_environment text,
  p_provider_transaction_id text,
  p_provider_subscription_id text,
  p_kind text,
  p_status text,
  p_currency text,
  p_subtotal_minor bigint,
  p_tax_minor bigint,
  p_total_minor bigint,
  p_occurred_at timestamptz
)
returns table(outcome text, applied_payment_reference_id uuid, applied_subscription_id uuid, applied_user_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  subscription public.subscriptions%rowtype;
  payment public.payment_references%rowtype;
  target_user uuid;
  target_subscription uuid;
  target_payment uuid;
  current_rank integer;
  next_rank integer;
begin
  if p_provider_environment not in ('sandbox', 'production')
    or p_kind not in ('subscription', 'renewal', 'adjustment')
    or p_status not in ('pending', 'paid', 'failed', 'partially_refunded', 'refunded') then
    raise exception 'Invalid recurring payment reference';
  end if;

  perform pg_advisory_xact_lock(hashtext('payment:paddle:' || p_provider_environment || ':' || p_provider_transaction_id));
  select * into payment
  from public.payment_references
  where provider = 'paddle'
    and provider_environment = p_provider_environment
    and provider_transaction_id = p_provider_transaction_id
  for update;

  if found then
    target_user := payment.user_id;
    target_subscription := payment.subscription_id;
    target_payment := payment.id;
  elsif p_provider_subscription_id is not null then
    select * into subscription
    from public.subscriptions
    where provider = 'paddle'
      and provider_environment = p_provider_environment
      and provider_subscription_id = p_provider_subscription_id
    for update;
    if found then
      target_user := subscription.user_id;
      target_subscription := subscription.id;
    end if;
  end if;

  if target_user is null then
    return query select 'ignored_unknown_provider_evidence'::text, null::uuid, null::uuid, null::uuid;
    return;
  end if;

  if target_payment is null then
    insert into public.payment_references (
      user_id, subscription_id, provider, provider_environment, provider_transaction_id,
      kind, status, currency, subtotal_minor, tax_minor, total_minor, occurred_at
    ) values (
      target_user, target_subscription, 'paddle', p_provider_environment, p_provider_transaction_id,
      p_kind, p_status, p_currency, p_subtotal_minor, p_tax_minor, p_total_minor, p_occurred_at
    ) returning id into target_payment;
  else
    current_rank := case payment.status when 'pending' then 0 when 'failed' then 1 when 'paid' then 2 when 'partially_refunded' then 3 else 4 end;
    next_rank := case p_status when 'pending' then 0 when 'failed' then 1 when 'paid' then 2 when 'partially_refunded' then 3 else 4 end;
    if next_rank >= current_rank then
      update public.payment_references
      set subscription_id = coalesce(subscription_id, target_subscription),
          kind = case when p_kind = 'adjustment' then kind else p_kind end,
          status = p_status,
          currency = p_currency,
          subtotal_minor = p_subtotal_minor,
          tax_minor = p_tax_minor,
          total_minor = p_total_minor,
          occurred_at = case when p_kind = 'adjustment' then occurred_at else greatest(occurred_at, p_occurred_at) end
      where id = target_payment;
    end if;
  end if;

  perform public.billing_rebuild_entitlements(target_user);
  return query select 'payment_applied'::text, target_payment, target_subscription, target_user;
end;
$$;

create or replace function public.billing_refresh_legacy_entitlements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user uuid;
begin
  target_user := coalesce(new.user_id, old.user_id);
  if target_user is not null then
    perform public.billing_rebuild_entitlements(target_user);
  end if;
  return coalesce(new, old);
end;
$$;

create trigger membership_grants_refresh_entitlements
after insert or update or delete on public.membership_grants
for each row execute function public.billing_refresh_legacy_entitlements();

create trigger memberships_refresh_entitlements
after insert or update or delete on public.memberships
for each row execute function public.billing_refresh_legacy_entitlements();

do $$
declare
  legacy_user record;
begin
  for legacy_user in
    select user_id from public.membership_grants
    union
    select user_id from public.memberships
  loop
    perform public.billing_rebuild_entitlements(legacy_user.user_id);
  end loop;
end;
$$;

revoke all on function public.billing_rebuild_entitlements(uuid) from public, anon, authenticated;
revoke all on function public.billing_claim_event(text, text, text, text, text, timestamptz, text, integer) from public, anon, authenticated;
revoke all on function public.billing_finish_event(text, text, text, text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.billing_recover_checkout_payment(uuid, text, text, text, bigint, bigint, bigint, timestamptz) from public, anon, authenticated;
revoke all on function public.billing_apply_subscription_snapshot(text, text, text, text, text, text, timestamptz, timestamptz, timestamptz, timestamptz, jsonb, timestamptz, text, text) from public, anon, authenticated;
revoke all on function public.billing_apply_payment_reference(text, text, text, text, text, text, bigint, bigint, bigint, timestamptz) from public, anon, authenticated;
revoke all on function public.billing_refresh_legacy_entitlements() from public, anon, authenticated;

grant execute on function public.billing_rebuild_entitlements(uuid) to service_role;
grant execute on function public.billing_claim_event(text, text, text, text, text, timestamptz, text, integer) to service_role;
grant execute on function public.billing_finish_event(text, text, text, text, uuid, uuid, text) to service_role;
grant execute on function public.billing_recover_checkout_payment(uuid, text, text, text, bigint, bigint, bigint, timestamptz) to service_role;
grant execute on function public.billing_apply_subscription_snapshot(text, text, text, text, text, text, timestamptz, timestamptz, timestamptz, timestamptz, jsonb, timestamptz, text, text) to service_role;
grant execute on function public.billing_apply_payment_reference(text, text, text, text, text, text, bigint, bigint, bigint, timestamptz) to service_role;

commit;
