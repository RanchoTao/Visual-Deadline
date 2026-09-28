begin;

-- Closed Beta supports Free + Plus only. Preserve the reserved Pro schema value,
-- but make its unsupported policy impossible to accidentally enable this release.
update public.ai_quota_policies set enabled=false where tier='pro';
alter table public.ai_quota_policies add constraint ai_quota_supported_beta_tiers
  check (tier <> 'pro' or not enabled);

-- Unknown is not free. No prior server calculation supplied pricing evidence.
alter table public.ai_usage_events
  alter column estimated_cost_minor drop not null,
  alter column estimated_cost_minor drop default,
  add column cost_status text not null default 'unknown' check (cost_status in ('unknown','estimated')),
  add column pricing_version text;
update public.ai_usage_events set estimated_cost_minor=null;
alter table public.ai_usage_events add constraint ai_usage_cost_evidence_check check (
  (cost_status='unknown' and estimated_cost_minor is null and pricing_version is null) or
  (cost_status='estimated' and estimated_cost_minor is not null and estimated_cost_minor >= 0 and pricing_version is not null));

create table public.admin_command_receipts (
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null,
  action text not null,
  command_hash text not null check (command_hash ~ '^[a-f0-9]{64}$'),
  result_json jsonb not null,
  created_at timestamptz not null default now(),
  primary key(actor_user_id,request_id)
);
alter table public.admin_command_receipts enable row level security;
revoke all on table public.admin_command_receipts from public,anon,authenticated,service_role;
grant select on table public.admin_command_receipts to service_role;

-- Sensitive replay results are NOT in audit/general receipts or a Data API schema.
-- No application role can SELECT this table, even service_role. Only the narrowly
-- defined SECURITY DEFINER command function may retrieve the matching actor/key.
create schema vd_admin_private;
revoke all on schema vd_admin_private from public,anon,authenticated,service_role;
create table vd_admin_private.invite_command_results (
  actor_user_id uuid not null,
  request_id uuid not null,
  invite_code text not null check (invite_code ~ '^VD-[0-9A-F]{32}$'),
  primary key(actor_user_id,request_id),
  foreign key(actor_user_id,request_id) references public.admin_command_receipts(actor_user_id,request_id) on delete restrict
);
alter table vd_admin_private.invite_command_results enable row level security;
revoke all on table vd_admin_private.invite_command_results from public,anon,authenticated,service_role;

-- Internal transactional workers. Only the command dispatcher is executable by
-- service_role; direct worker access is revoked below to prevent receipt bypass.
create function public.beta_disable_invite(p_actor uuid,p_request uuid,p_invite uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare invite public.invite_codes%rowtype; previous jsonb;
begin
  perform public.beta_require_admin(p_actor);
  select * into invite from public.invite_codes where id=p_invite for update;
  if not found then raise exception 'ADMIN_NOT_FOUND'; end if;
  previous := to_jsonb(invite)-'code_hash';
  update public.invite_codes set enabled=false,updated_at=now() where id=p_invite returning * into invite;
  insert into public.admin_audit_log(actor_user_id,action,target_type,target_id,reason,before_json,after_json,request_id)
    values(p_actor,'invite_disable','invite_code',p_invite::text,p_reason,previous,to_jsonb(invite)-'code_hash',p_request);
  return to_jsonb(invite)-'code_hash';
end $$;

create function public.beta_review_application(p_actor uuid,p_request uuid,p_application uuid,p_status text,p_note text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare application public.beta_applications%rowtype; previous jsonb;
begin
  perform public.beta_require_admin(p_actor);
  if p_status is null or p_status not in ('pending','shortlisted','approved','rejected','invited','registered','expired')
    then raise exception 'ADMIN_INPUT_INVALID'; end if;
  select * into application from public.beta_applications where id=p_application for update;
  if not found then raise exception 'ADMIN_NOT_FOUND'; end if;
  previous := to_jsonb(application);
  update public.beta_applications set status=p_status,review_note=p_note,reviewed_at=now(),reviewed_by=p_actor,updated_at=now()
    where id=p_application returning * into application;
  insert into public.admin_audit_log(actor_user_id,action,target_type,target_id,reason,before_json,after_json,request_id)
    values(p_actor,'application_review','beta_application',p_application::text,p_note,previous,to_jsonb(application),p_request);
  return to_jsonb(application);
end $$;

create function public.beta_admin_effective_entitlement(p_user uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('allowed',count(*)>0,'capability','vd.plus',
    'sources',coalesce(jsonb_agg(to_jsonb(e) order by e.valid_until desc nulls first),'[]'::jsonb),
    'validUntil',(jsonb_agg(e.valid_until order by e.valid_until desc nulls first))->0)
  from public.entitlements e where e.user_id=p_user and e.capability='vd.plus' and e.status='active'
    and e.valid_from<=now() and (e.valid_until is null or e.valid_until>now());
$$;

create function public.beta_admin_command(p_actor uuid,p_request uuid,p_action text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare receipt public.admin_command_receipts%rowtype; fingerprint text; result jsonb; worker_result jsonb;
  plaintext text; from_at timestamptz; until_at timestamptz; user_id uuid; is_unlimited boolean;
begin
  -- Authority is checked again even on a replay (revoked admins cannot recover secrets).
  perform public.beta_require_admin(p_actor,p_action='set_feature_flag');
  if p_request is null or p_action is null or p_action not in ('grant_entitlement','revoke_entitlement','create_invite','disable_invite',
    'review_application','set_account_control','unban','grant_quota','reset_quota','set_feature_flag')
    or p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>60000 then raise exception 'ADMIN_INPUT_INVALID'; end if;
  fingerprint := encode(sha256(convert_to(jsonb_build_object('action',p_action,'input',p_input)::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended('admin-command:'||p_actor::text||':'||p_request::text,0));
  select * into receipt from public.admin_command_receipts where actor_user_id=p_actor and request_id=p_request;
  if found then
    if receipt.action<>p_action or receipt.command_hash<>fingerprint then raise exception 'IDEMPOTENCY_KEY_REUSED'; end if;
    result := receipt.result_json;
    if p_action='create_invite' then
      select invite_code into plaintext from vd_admin_private.invite_command_results
        where actor_user_id=p_actor and request_id=p_request;
      if plaintext is null then raise exception 'ADMIN_COMMAND_RESULT_UNAVAILABLE'; end if;
      result := jsonb_set(result,'{invite,code}',to_jsonb(plaintext));
    end if;
    return result;
  end if;
  -- Defaults are resolved ONLY after replay lookup; relative dates and random codes
  -- cannot change the payload hash on retry.
  case p_action
    when 'grant_entitlement' then
      user_id := (p_input->>'userId')::uuid;
      from_at := coalesce((p_input->>'validFrom')::timestamptz,now());
      if coalesce((p_input->>'permanent')::boolean,false) then
        until_at := null;
      elsif p_input->>'validUntil' is not null then
        until_at := (p_input->>'validUntil')::timestamptz;
      elsif (p_input->>'durationDays')::integer in (1,7,30,90) then
        until_at := from_at+interval '24 hours'*(p_input->>'durationDays')::integer;
      else raise exception 'ADMIN_INPUT_INVALID'; end if;
      worker_result := public.beta_grant_entitlement(p_actor,p_request,user_id,from_at,until_at,
        coalesce(p_input->>'grantType','manual'),left(coalesce(p_input->>'reason','admin_grant'),500),left(p_input->>'note',2000));
      result := worker_result||jsonb_build_object('effective',public.beta_admin_effective_entitlement(user_id));
    when 'revoke_entitlement' then
      worker_result := public.beta_revoke_entitlement(p_actor,p_request,(p_input->>'grantId')::uuid,left(coalesce(p_input->>'reason','admin_revoke'),500));
      result := jsonb_build_object('grant',worker_result,'effective',public.beta_admin_effective_entitlement((worker_result->>'user_id')::uuid));
    when 'create_invite' then
      -- Two independent random UUIDs provide >128 bits of entropy before SHA-256 truncation.
      plaintext := 'VD-'||upper(substr(encode(sha256(uuid_send(gen_random_uuid())||uuid_send(gen_random_uuid())),'hex'),1,32));
      -- Match runtime.sha256 / existing registration's case-insensitive code hash.
      worker_result := public.beta_create_invite(p_actor,p_request,encode(sha256(convert_to(lower(plaintext),'UTF8')),'hex'),
        left(plaintext,7),(p_input->>'cohortId')::uuid,coalesce((p_input->>'maxUses')::integer,1),
        (p_input->>'expiresAt')::timestamptz,left(p_input->>'note',1000));
      result := jsonb_build_object('invite',worker_result,'requestId',p_request);
    when 'disable_invite' then
      result := jsonb_build_object('invite',public.beta_disable_invite(p_actor,p_request,(p_input->>'inviteId')::uuid,p_input->>'reason'));
    when 'review_application' then
      result := jsonb_build_object('application',public.beta_review_application(p_actor,p_request,
        (p_input->>'applicationId')::uuid,p_input->>'status',p_input->>'reviewNote'));
    when 'set_account_control','unban' then
      result := jsonb_build_object('control',public.beta_transition_account(p_actor,p_request,(p_input->>'userId')::uuid,
        case when p_action='unban' then 'active' else p_input->>'status' end,p_input->>'reason',
        coalesce(p_input->>'reasonCode','manual'),p_input->>'note',(p_input->>'expiresAt')::timestamptz));
    when 'grant_quota' then
      is_unlimited := coalesce((p_input->>'unlimited')::boolean,false);
      if is_unlimited and p_input->>'amount' is not null then raise exception 'ADMIN_INPUT_INVALID'; end if;
      result := jsonb_build_object('grant',public.beta_grant_quota(p_actor,p_request,(p_input->>'userId')::uuid,
        case when is_unlimited then null else (p_input->>'amount')::integer end,is_unlimited,
        coalesce((p_input->>'validFrom')::timestamptz,now()),(p_input->>'validUntil')::timestamptz,
        left(coalesce(p_input->>'reason','admin_quota_grant'),500)));
    when 'reset_quota' then
      result := jsonb_build_object('grant',public.beta_reset_quota(p_actor,p_request,(p_input->>'userId')::uuid,
        left(coalesce(p_input->>'reason','admin_quota_reset'),500)));
    when 'set_feature_flag' then
      result := jsonb_build_object('flag',public.beta_set_feature_flag(p_actor,p_request,p_input->>'key',
        coalesce(p_input->>'scopeType','global'),p_input->>'scopeId',coalesce((p_input->>'enabled')::boolean,false),p_input->>'reason'));
  end case;
  insert into public.admin_command_receipts(actor_user_id,request_id,action,command_hash,result_json)
    values(p_actor,p_request,p_action,fingerprint,result);
  if p_action='create_invite' then
    insert into vd_admin_private.invite_command_results(actor_user_id,request_id,invite_code) values(p_actor,p_request,plaintext);
    result := jsonb_set(result,'{invite,code}',to_jsonb(plaintext));
  end if;
  return result;
end $$;

-- No direct mutation/audit worker is a supported service API after cutover.
do $$ declare f record;
begin
  for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname in
    ('beta_admin_command','beta_admin_effective_entitlement','beta_disable_invite','beta_review_application',
     'beta_transition_account','beta_grant_entitlement','beta_revoke_entitlement','beta_create_invite',
     'beta_set_feature_flag','beta_grant_quota','beta_reset_quota') loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  end loop;
end $$;
grant execute on function public.beta_admin_command(uuid,uuid,text,jsonb) to service_role;
commit;
