begin;

-- Preserve historical manual grants. Reset compensation has explicit, bounded provenance.
alter table public.ai_quota_grants
  add column source_kind text not null default 'manual' check (source_kind in ('manual', 'period_reset')),
  add column quota_period_start timestamptz,
  add column quota_period_end timestamptz,
  add constraint ai_quota_reset_period_check check (
    (source_kind = 'manual' and quota_period_start is null and quota_period_end is null) or
    (source_kind = 'period_reset' and not unlimited and amount is not null
      and quota_period_start is not null and quota_period_end is not null
      and quota_period_end > quota_period_start and valid_from >= quota_period_start
      and valid_until is not null and valid_until = quota_period_end));
create unique index ai_quota_reset_period_key on public.ai_quota_grants(user_id,quota_period_start,quota_period_end)
  where source_kind = 'period_reset';

-- Authoritative policy periods: UTC, half-open [start,end), anchored at 2000-01-01.
-- Calendar-month/year and mixed positive intervals use calendar arithmetic in UTC;
-- fixed intervals use date_bin. Never use the server/browser session timezone.
create function public.beta_ai_quota_period(p_interval interval, p_at timestamptz)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare anchor timestamp := timestamp '2000-01-01 00:00:00'; instant timestamp := p_at at time zone 'UTC';
  first_at timestamp; last_at timestamp; low_n bigint; high_n bigint; mid_n bigint;
begin
  if p_at is null or p_interval is null or p_interval <= interval '0'
    or extract(year from p_interval) < 0 or extract(month from p_interval) < 0
    or extract(day from p_interval) < 0 or extract(hour from p_interval) < 0
    or extract(minute from p_interval) < 0 or extract(second from p_interval) < 0 then
    raise exception 'AI_QUOTA_POLICY_INVALID';
  end if;
  if extract(year from p_interval) = 0 and extract(month from p_interval) = 0 then
    first_at := date_bin(p_interval,instant,anchor); last_at := first_at + p_interval;
  else
    -- Find consecutive anchor+n*policy boundaries, including pre-anchor instants.
    if instant >= anchor then
      low_n := 0; high_n := 1;
      while anchor + p_interval * high_n::double precision <= instant loop
        low_n := high_n; high_n := high_n * 2;
      end loop;
    else
      low_n := -1; high_n := 0;
      while anchor + p_interval * low_n::double precision > instant loop
        high_n := low_n; low_n := low_n * 2;
      end loop;
    end if;
    while high_n - low_n > 1 loop
      mid_n := low_n + (high_n - low_n) / 2;
      if anchor + p_interval * mid_n::double precision <= instant then low_n := mid_n; else high_n := mid_n; end if;
    end loop;
    first_at := anchor + p_interval * low_n::double precision;
    last_at := anchor + p_interval * high_n::double precision;
  end if;
  return jsonb_build_object('start',first_at at time zone 'UTC','end',last_at at time zone 'UTC');
end $$;

create function public.beta_ai_quota_snapshot(p_user uuid, p_at timestamptz default now())
returns jsonb language plpgsql security definer set search_path = '' as $$
declare tier_name text := 'free'; policy public.ai_quota_policies%rowtype;
  period jsonb; first_at timestamptz; last_at timestamptz; used bigint; extra bigint; unbounded boolean;
begin
  if exists(select 1 from public.entitlements where user_id = p_user and capability = 'vd.plus'
    and status = 'active' and valid_from <= p_at and (valid_until is null or valid_until > p_at)) then tier_name := 'plus'; end if;
  select * into policy from public.ai_quota_policies where tier = tier_name;
  if not found then raise exception 'AI_QUOTA_POLICY_INVALID'; end if;
  period := public.beta_ai_quota_period(policy.period_interval,p_at);
  first_at := (period->>'start')::timestamptz; last_at := (period->>'end')::timestamptz;
  select count(*) into used from public.ai_usage_events where user_id = p_user
    and created_at >= first_at and created_at < last_at and status in ('processing','succeeded');
  select coalesce(sum(amount),0),coalesce(bool_or(unlimited),false) into extra,unbounded
    from public.ai_quota_grants where user_id = p_user and revoked_at is null
      and valid_from <= p_at and (valid_until is null or valid_until > p_at)
      and (source_kind = 'manual' or (quota_period_start = first_at and quota_period_end = last_at));
  return jsonb_build_object('tier',tier_name,'period_start',first_at,'period_end',last_at,
    'base',case when policy.enabled then policy.requests_per_period else 0 end,'used',used,'extra',extra,
    'unlimited',unbounded,'remaining',greatest(0,(case when policy.enabled then policy.requests_per_period else 0 end) + extra - used));
end $$;

-- The admission and both admin mutations share the same per-user transaction lock.
create or replace function public.consume_ai_quota(p_user_id uuid, p_request_id uuid, p_provider text, p_model text, p_feature text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare snapshot jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('ai-quota:' || p_user_id::text));
  if exists(select 1 from public.ai_usage_events where user_id = p_user_id and request_id = p_request_id) then
    raise exception 'AI_REQUEST_REPLAY';
  end if;
  snapshot := public.beta_ai_quota_snapshot(p_user_id);
  if not (snapshot->>'unlimited')::boolean and (snapshot->>'remaining')::bigint <= 0 then
    insert into public.ai_usage_events(user_id,request_id,provider,model,feature,status,error_code)
      values(p_user_id,p_request_id,p_provider,p_model,p_feature,'rejected','AI_QUOTA_EXHAUSTED'); return false;
  end if;
  insert into public.ai_usage_events(user_id,request_id,provider,model,feature,status)
    values(p_user_id,p_request_id,p_provider,p_model,p_feature,'processing'); return true;
end $$;

create function public.beta_grant_quota(p_actor uuid,p_request uuid,p_user uuid,p_amount integer,p_unlimited boolean,
  p_from timestamptz,p_until timestamptz,p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare gift public.ai_quota_grants%rowtype;
begin
  perform public.beta_require_admin(p_actor);
  perform pg_advisory_xact_lock(hashtext('ai-quota:' || p_user::text));
  if p_unlimited is null or (p_unlimited and p_amount is not null) or (not p_unlimited and p_amount is null) then
    raise exception 'ADMIN_INPUT_INVALID';
  end if;
  insert into public.ai_quota_grants(user_id,amount,unlimited,valid_from,valid_until,reason,created_by,source_kind)
    values(p_user,p_amount,p_unlimited,p_from,p_until,p_reason,p_actor,'manual') returning * into gift;
  insert into public.admin_audit_log(actor_user_id,action,target_type,target_id,reason,after_json,request_id)
    values(p_actor,'quota_grant','ai_quota_grant',gift.id::text,p_reason,to_jsonb(gift),p_request);
  return to_jsonb(gift);
end $$;

create function public.beta_reset_quota(p_actor uuid,p_request uuid,p_user uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare gift public.ai_quota_grants%rowtype; snapshot jsonb; previous jsonb; first_at timestamptz; last_at timestamptz;
begin
  perform public.beta_require_admin(p_actor);
  perform pg_advisory_xact_lock(hashtext('ai-quota:' || p_user::text));
  snapshot := public.beta_ai_quota_snapshot(p_user);
  first_at := (snapshot->>'period_start')::timestamptz; last_at := (snapshot->>'period_end')::timestamptz;
  select to_jsonb(g) into previous from public.ai_quota_grants g where user_id = p_user
    and source_kind = 'period_reset' and quota_period_start = first_at and quota_period_end = last_at;
  insert into public.ai_quota_grants(user_id,amount,unlimited,valid_from,valid_until,reason,created_by,source_kind,quota_period_start,quota_period_end)
    values(p_user,(snapshot->>'used')::integer,false,now(),last_at,p_reason,p_actor,'period_reset',first_at,last_at)
    on conflict(user_id,quota_period_start,quota_period_end) where source_kind = 'period_reset'
    do update set amount = excluded.amount,valid_from = excluded.valid_from,valid_until = excluded.valid_until,
      reason = excluded.reason,created_by = excluded.created_by,revoked_at = null,revoked_by = null
    returning * into gift;
  insert into public.admin_audit_log(actor_user_id,action,target_type,target_id,reason,before_json,after_json,request_id)
    values(p_actor,'quota_reset','ai_quota_grant',gift.id::text,p_reason,previous,to_jsonb(gift),p_request);
  return to_jsonb(gift);
end $$;

-- Retain existing RLS/table permissions; no browser can execute these functions.
do $$ declare f record;
begin
  for f in select oid::regprocedure as signature from pg_proc where pronamespace = 'public'::regnamespace
    and proname in ('beta_ai_quota_period','beta_ai_quota_snapshot','beta_grant_quota','beta_reset_quota','consume_ai_quota') loop
    execute format('revoke all on function %s from public, anon, authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
commit;
