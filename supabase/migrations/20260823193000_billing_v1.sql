-- Visual Deadline billing v1
-- Owns VD orders, grants and membership state while keeping Paddle replaceable.
-- Apply this migration before enabling checkout in production.

begin;

create table if not exists public.billing_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'paddle' check (provider in ('paddle')),
  provider_transaction_id text unique,
  provider_customer_id text,
  plan_code text not null check (plan_code in ('vd_monthly', 'vd_yearly')),
  amount_minor integer not null check (amount_minor > 0),
  currency text not null default 'CNY' check (currency = 'CNY'),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'canceled', 'partially_refunded', 'refunded')),
  provider_error_code text,
  checkout_created_at timestamptz not null default now(),
  paid_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_orders_vd_price_check check (
    (plan_code = 'vd_monthly' and amount_minor = 1900)
    or (plan_code = 'vd_yearly' and amount_minor = 19900)
  )
);

create table if not exists public.membership_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('paddle', 'admin_grant')),
  plan_code text not null check (plan_code in ('vd_monthly', 'vd_yearly')),
  duration_months integer not null check (duration_months in (1, 12)),
  order_id uuid unique references public.billing_orders(id) on delete set null,
  granted_at timestamptz not null default now(),
  period_start timestamptz,
  period_end timestamptz,
  revoked_at timestamptz,
  revoke_reason text,
  created_by uuid references auth.users(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_code text not null check (plan_code in ('vd_monthly', 'vd_yearly')),
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  source text not null check (source in ('paddle', 'admin_grant')),
  last_grant_id uuid references public.membership_grants(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint memberships_valid_period check (expires_at > starts_at)
);

create table if not exists public.billing_events (
  id text primary key,
  provider text not null default 'paddle' check (provider in ('paddle')),
  event_type text not null,
  provider_transaction_id text,
  outcome text not null,
  occurred_at timestamptz,
  processed_at timestamptz not null default now()
);

create index if not exists billing_orders_user_created_idx on public.billing_orders(user_id, created_at desc);
create index if not exists billing_orders_provider_transaction_idx on public.billing_orders(provider_transaction_id);
create index if not exists membership_grants_user_granted_idx on public.membership_grants(user_id, granted_at, created_at);
create index if not exists membership_grants_order_idx on public.membership_grants(order_id);
create index if not exists billing_events_transaction_idx on public.billing_events(provider_transaction_id);

create or replace function public.set_billing_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists billing_orders_set_updated_at on public.billing_orders;
create trigger billing_orders_set_updated_at
before update on public.billing_orders
for each row execute function public.set_billing_updated_at();

drop trigger if exists memberships_set_updated_at on public.memberships;
create trigger memberships_set_updated_at
before update on public.memberships
for each row execute function public.set_billing_updated_at();

alter table public.billing_orders enable row level security;
alter table public.membership_grants enable row level security;
alter table public.memberships enable row level security;
alter table public.billing_events enable row level security;

drop policy if exists billing_orders_select_own on public.billing_orders;
create policy billing_orders_select_own
on public.billing_orders
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists memberships_select_own on public.memberships;
create policy memberships_select_own
on public.memberships
for select
to authenticated
using (auth.uid() = user_id);

-- Grants and provider events are audit/internal records. They intentionally have no
-- authenticated-client policies; only service-role code operates on them.

create or replace function public.billing_rebuild_membership(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  grant_row record;
  cursor_end timestamptz := null;
  first_start timestamptz := null;
  next_start timestamptz;
  next_end timestamptz;
  last_plan text := null;
  last_source text := null;
  last_grant uuid := null;
begin
  -- Serialize membership changes per user. Replayed/concurrent webhooks therefore
  -- cannot double-extend a membership.
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  for grant_row in
    select id, plan_code, source, granted_at, duration_months
    from public.membership_grants
    where user_id = p_user_id
      and revoked_at is null
    order by granted_at asc, created_at asc, id asc
  loop
    if cursor_end is null or grant_row.granted_at > cursor_end then
      next_start := grant_row.granted_at;
    else
      next_start := cursor_end;
    end if;

    next_end := next_start + make_interval(months => grant_row.duration_months);

    update public.membership_grants
    set period_start = next_start,
        period_end = next_end
    where id = grant_row.id;

    if first_start is null then
      first_start := next_start;
    end if;

    cursor_end := next_end;
    last_plan := grant_row.plan_code;
    last_source := grant_row.source;
    last_grant := grant_row.id;
  end loop;

  if cursor_end is null then
    delete from public.memberships where user_id = p_user_id;
    return;
  end if;

  insert into public.memberships (user_id, plan_code, starts_at, expires_at, source, last_grant_id)
  values (p_user_id, last_plan, first_start, cursor_end, last_source, last_grant)
  on conflict (user_id) do update
  set plan_code = excluded.plan_code,
      starts_at = excluded.starts_at,
      expires_at = excluded.expires_at,
      source = excluded.source,
      last_grant_id = excluded.last_grant_id,
      updated_at = now();
end;
$$;

create or replace function public.billing_apply_paddle_grant(
  p_user_id uuid,
  p_plan_code text,
  p_order_id uuid,
  p_granted_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  duration integer;
begin
  if p_plan_code = 'vd_monthly' then
    duration := 1;
  elsif p_plan_code = 'vd_yearly' then
    duration := 12;
  else
    raise exception 'Unsupported billing plan: %', p_plan_code;
  end if;

  if not exists (
    select 1
    from public.billing_orders
    where id = p_order_id
      and user_id = p_user_id
      and plan_code = p_plan_code
      and provider = 'paddle'
      and status in ('paid', 'partially_refunded')
  ) then
    raise exception 'Paid order does not match requested membership grant';
  end if;

  insert into public.membership_grants (
    user_id,
    source,
    plan_code,
    duration_months,
    order_id,
    granted_at
  )
  values (
    p_user_id,
    'paddle',
    p_plan_code,
    duration,
    p_order_id,
    coalesce(p_granted_at, now())
  )
  on conflict (order_id) do nothing;

  perform public.billing_rebuild_membership(p_user_id);
end;
$$;

create or replace function public.billing_revoke_order_grant(
  p_order_id uuid,
  p_reason text default 'refund',
  p_revoked_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user uuid;
begin
  select user_id into target_user
  from public.membership_grants
  where order_id = p_order_id
  limit 1;

  if target_user is null then
    return;
  end if;

  update public.membership_grants
  set revoked_at = coalesce(revoked_at, coalesce(p_revoked_at, now())),
      revoke_reason = coalesce(revoke_reason, p_reason)
  where order_id = p_order_id
    and revoked_at is null;

  perform public.billing_rebuild_membership(target_user);
end;
$$;

create or replace function public.billing_admin_grant(
  p_user_id uuid,
  p_plan_code text,
  p_granted_at timestamptz default now(),
  p_created_by uuid default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  duration integer;
  new_grant_id uuid;
begin
  if p_plan_code = 'vd_monthly' then
    duration := 1;
  elsif p_plan_code = 'vd_yearly' then
    duration := 12;
  else
    raise exception 'Unsupported billing plan: %', p_plan_code;
  end if;

  insert into public.membership_grants (
    user_id,
    source,
    plan_code,
    duration_months,
    granted_at,
    created_by,
    note
  )
  values (
    p_user_id,
    'admin_grant',
    p_plan_code,
    duration,
    coalesce(p_granted_at, now()),
    p_created_by,
    p_note
  )
  returning id into new_grant_id;

  perform public.billing_rebuild_membership(p_user_id);
  return new_grant_id;
end;
$$;

revoke all on function public.billing_rebuild_membership(uuid) from public, anon, authenticated;
revoke all on function public.billing_apply_paddle_grant(uuid, text, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.billing_revoke_order_grant(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.billing_admin_grant(uuid, text, timestamptz, uuid, text) from public, anon, authenticated;

grant execute on function public.billing_rebuild_membership(uuid) to service_role;
grant execute on function public.billing_apply_paddle_grant(uuid, text, uuid, timestamptz) to service_role;
grant execute on function public.billing_revoke_order_grant(uuid, text, timestamptz) to service_role;
grant execute on function public.billing_admin_grant(uuid, text, timestamptz, uuid, text) to service_role;

grant select on public.billing_orders to authenticated;
grant select on public.memberships to authenticated;

commit;
