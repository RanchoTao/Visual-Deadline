-- Closed Beta review hardening. Additive follow-up; never deploy to production for testing.
begin;

-- Record existing accounts once. Later Auth creation alone is not workspace admission.
create table public.beta_existing_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  recorded_at timestamptz not null default now()
);
insert into public.beta_existing_users(user_id) select id from auth.users;
alter table public.beta_existing_users enable row level security;
revoke all on public.beta_existing_users from public, anon, authenticated;
grant select, insert on public.beta_existing_users to service_role;

-- Auth admin createUser can set app_metadata; public signup/OTP/OAuth cannot.
-- user_metadata is intentionally never used as an authorization claim.
create function public.beta_guard_auth_creation() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'supabase_auth_admin' and
     coalesce(new.raw_app_meta_data->>'vd_beta_preauthorized', '') <> 'true' then
    raise exception 'BETA_INVITE_REQUIRED';
  end if;
  return new;
end $$;
revoke all on function public.beta_guard_auth_creation() from public, anon, authenticated;
create trigger beta_invite_required before insert on auth.users for each row execute function public.beta_guard_auth_creation();

-- Explicitly superseded history stays intact even if a later temporary control expires.
alter table public.account_controls add column superseded_at timestamptz;
create function public.beta_may_operate() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and (exists(select 1 from public.beta_existing_users where user_id = auth.uid())
      or exists(select 1 from public.invite_redemptions where user_id = auth.uid()))
    and not exists(select 1 from public.account_controls
      where user_id = auth.uid() and superseded_at is null and effective_at <= now()
      and (expires_at is null or expires_at > now()) and status <> 'active');
$$;
revoke all on function public.beta_may_operate() from public, anon;
grant execute on function public.beta_may_operate() to authenticated;

-- RESTRICTIVE policies compose with all existing owner policies. Reads/exports remain available.
do $$ declare t text;
begin
  foreach t in array array['tasks','goals','profiles','pressure_logs','life_events',
    'review_records','review_events','review_archive_events','review_tombstones',
    'v2_tasks','v2_goals','v2_milestones','v2_task_dependencies',
    'intake_messages','intake_assets','task_drafts','roadmaps','roadmap_nodes','roadmap_edges'] loop
    execute format('create policy beta_write_insert on public.%I as restrictive for insert to authenticated with check ((select public.beta_may_operate()))', t);
    execute format('create policy beta_write_update on public.%I as restrictive for update to authenticated using ((select public.beta_may_operate())) with check ((select public.beta_may_operate()))', t);
    execute format('create policy beta_write_delete on public.%I as restrictive for delete to authenticated using ((select public.beta_may_operate()))', t);
  end loop;
end $$;
create policy beta_storage_insert on storage.objects as restrictive for insert to authenticated with check ((select public.beta_may_operate()));
create policy beta_storage_update on storage.objects as restrictive for update to authenticated using ((select public.beta_may_operate())) with check ((select public.beta_may_operate()));
create policy beta_storage_delete on storage.objects as restrictive for delete to authenticated using ((select public.beta_may_operate()));

create function public.beta_guard_profile_attribution() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and
    ((tg_op = 'INSERT' and (new.signup_cohort_id is not null or new.signup_source is not null)) or
     (tg_op = 'UPDATE' and (new.signup_cohort_id is distinct from old.signup_cohort_id or new.signup_source is distinct from old.signup_source))) then
    raise exception 'SIGNUP_ATTRIBUTION_IMMUTABLE';
  end if;
  return new;
end $$;
create trigger beta_profile_attribution before insert or update on public.profiles for each row execute function public.beta_guard_profile_attribution();
revoke all on function public.beta_guard_profile_attribution() from public, anon, authenticated;

-- Every repeat is rejected, regardless of the previous status.
create or replace function public.consume_ai_quota(p_user_id uuid, p_request_id uuid, p_provider text, p_model text, p_feature text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare tier_name text := 'free'; policy_limit integer := 0; grant_extra integer := 0;
begin
  perform pg_advisory_xact_lock(hashtext('ai-quota:' || p_user_id::text));
  if exists(select 1 from public.ai_usage_events where user_id = p_user_id and request_id = p_request_id) then
    raise exception 'AI_REQUEST_REPLAY';
  end if;
  if exists (select 1 from public.entitlements where user_id = p_user_id and capability = 'vd.plus' and status = 'active' and valid_from <= now() and (valid_until is null or valid_until > now())) then tier_name := 'plus'; end if;
  select requests_per_period into policy_limit from public.ai_quota_policies where tier = tier_name and enabled;
  select coalesce(sum(amount), 0) into grant_extra from public.ai_quota_grants where user_id = p_user_id and revoked_at is null and valid_from <= now() and (valid_until is null or valid_until > now());
  if not exists (select 1 from public.ai_quota_grants where user_id = p_user_id and unlimited and revoked_at is null and valid_from <= now() and (valid_until is null or valid_until > now()))
    and (select count(*) from public.ai_usage_events where user_id = p_user_id and created_at >= date_trunc('month', now()) and status in ('processing', 'succeeded')) >= coalesce(policy_limit, 0) + grant_extra then
    insert into public.ai_usage_events (user_id, request_id, provider, model, feature, status, error_code) values (p_user_id, p_request_id, p_provider, p_model, p_feature, 'rejected', 'AI_QUOTA_EXHAUSTED'); return false;
  end if;
  insert into public.ai_usage_events (user_id, request_id, provider, model, feature, status) values (p_user_id, p_request_id, p_provider, p_model, p_feature, 'processing'); return true;
end $$;

-- Server-only mutation RPCs also re-check actor privileges inside the transaction.
create function public.beta_require_admin(p_actor uuid, p_owner boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.admin_roles where user_id = p_actor and enabled and
    (role = 'owner' or (not p_owner and role = 'admin'))) then raise exception 'ADMIN_REQUIRED'; end if;
  if exists(select 1 from public.account_controls where user_id = p_actor and superseded_at is null and effective_at <= now()
    and (expires_at is null or expires_at > now()) and status <> 'active') then raise exception 'ACCOUNT_BLOCKED'; end if;
end $$;

create function public.beta_transition_account(p_actor uuid, p_request uuid, p_user uuid, p_status text, p_reason text,
  p_reason_code text default 'manual', p_note text default null, p_expires timestamptz default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare control public.account_controls%rowtype; previous jsonb; transition_at timestamptz := now();
begin
  perform public.beta_require_admin(p_actor);
  perform pg_advisory_xact_lock(hashtext('account-control:' || p_user::text));
  select coalesce(jsonb_agg(to_jsonb(c)), '[]') into previous from public.account_controls c where user_id = p_user and superseded_at is null;
  update public.account_controls set superseded_at = transition_at,
    expires_at = case when expires_at is null then greatest(transition_at, effective_at + interval '1 microsecond') else expires_at end,
    updated_by = p_actor where user_id = p_user and superseded_at is null;
  insert into public.account_controls(user_id,status,reason,reason_code,note,effective_at,expires_at,created_by,updated_by)
    values(p_user,p_status,p_reason,p_reason_code,p_note,transition_at,p_expires,p_actor,p_actor) returning * into control;
  insert into public.admin_audit_log(actor_user_id,action,target_type,target_id,reason,before_json,after_json,request_id)
    values(p_actor,case when p_status = 'active' then 'unban' else 'account_control' end,'account_control',control.id::text,p_reason,previous,to_jsonb(control),p_request);
  return to_jsonb(control);
end $$;

create function public.beta_grant_entitlement(p_actor uuid, p_request uuid, p_user uuid, p_from timestamptz, p_until timestamptz,
  p_type text, p_reason text, p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare gift public.admin_access_grants%rowtype; entitlement public.entitlements%rowtype;
begin
  perform public.beta_require_admin(p_actor, p_until is null);
  if p_until is null and p_type <> 'testing' then raise exception 'PERMANENT_TESTING_ONLY'; end if;
  perform pg_advisory_xact_lock(hashtext('entitlement:' || p_user::text));
  insert into public.admin_access_grants(user_id,capability,valid_from,valid_until,grant_type,reason,note,created_by)
    values(p_user,'vd.plus',p_from,p_until,p_type,p_reason,p_note,p_actor) returning * into gift;
  insert into public.entitlements(user_id,capability,source_type,source_id,status,valid_from,valid_until,reason)
    values(p_user,'vd.plus','admin_grant',gift.id::text,'active',p_from,p_until,'admin_' || p_type) returning * into entitlement;
  insert into public.admin_audit_log(actor_user_id,action,target_type,target_id,reason,after_json,request_id)
    values(p_actor,'membership_grant','admin_access_grant',gift.id::text,p_reason,to_jsonb(gift),p_request);
  return jsonb_build_object('grant',to_jsonb(gift),'entitlement',to_jsonb(entitlement));
end $$;

create function public.beta_revoke_entitlement(p_actor uuid, p_request uuid, p_grant uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare gift public.admin_access_grants%rowtype; previous jsonb;
begin
  perform public.beta_require_admin(p_actor);
  select * into gift from public.admin_access_grants where id = p_grant;
  if not found then raise exception 'ADMIN_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtext('entitlement:' || gift.user_id::text));
  select * into gift from public.admin_access_grants where id = p_grant for update;
  previous := to_jsonb(gift);
  update public.admin_access_grants set revoked_at = coalesce(revoked_at,now()),revoked_by = p_actor,revoke_reason = p_reason where id = p_grant returning * into gift;
  update public.entitlements set status = 'revoked',reason = 'admin_grant_revoked:' || p_reason
    where user_id = gift.user_id and capability = 'vd.plus' and source_type = 'admin_grant' and source_id = gift.id::text;
  insert into public.admin_audit_log(actor_user_id,action,target_type,target_id,reason,before_json,after_json,request_id)
    values(p_actor,'membership_revoke','admin_access_grant',gift.id::text,p_reason,previous,to_jsonb(gift),p_request);
  return to_jsonb(gift);
end $$;

create function public.beta_create_invite(p_actor uuid, p_request uuid, p_hash text, p_prefix text, p_cohort uuid,
  p_uses integer, p_expires timestamptz, p_note text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare invite public.invite_codes%rowtype;
begin
  perform public.beta_require_admin(p_actor);
  insert into public.invite_codes(code_hash,display_prefix,cohort_id,max_uses,expires_at,note,created_by)
    values(p_hash,p_prefix,p_cohort,p_uses,p_expires,p_note,p_actor) returning * into invite;
  insert into public.admin_audit_log(actor_user_id,action,target_type,target_id,after_json,request_id)
    values(p_actor,'invite_create','invite_code',invite.id::text,to_jsonb(invite) - 'code_hash',p_request);
  return to_jsonb(invite) - 'code_hash';
end $$;

create function public.beta_set_feature_flag(p_actor uuid,p_request uuid,p_key text,p_scope text,p_scope_id text,p_enabled boolean,p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare flag public.feature_flags%rowtype;
begin
  perform public.beta_require_admin(p_actor,true);
  if (p_scope = 'global' and p_scope_id is not null) or (p_scope <> 'global' and p_scope_id is null) then raise exception 'ADMIN_INPUT_INVALID'; end if;
  insert into public.feature_flags(key,scope_type,scope_id,enabled,created_by) values(p_key,p_scope,p_scope_id,p_enabled,p_actor)
    on conflict (key,scope_type,scope_id) do update set enabled = excluded.enabled returning * into flag;
  insert into public.admin_audit_log(actor_user_id,action,target_type,target_id,reason,after_json,request_id)
    values(p_actor,'feature_flag_change','feature_flag',flag.id::text,p_reason,to_jsonb(flag),p_request);
  return to_jsonb(flag);
end $$;

-- Mutation RPCs and internal helpers are never public browser APIs.
do $$ declare f record;
begin
  for f in select oid::regprocedure as signature from pg_proc where pronamespace = 'public'::regnamespace and proname in
    ('beta_require_admin','beta_transition_account','beta_grant_entitlement','beta_revoke_entitlement','beta_create_invite','beta_set_feature_flag') loop
    execute format('revoke all on function %s from public, anon, authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;

-- Audit entries cannot be rewritten even by the normal privileged backend role.
revoke update, delete on public.admin_audit_log from service_role;
commit;
