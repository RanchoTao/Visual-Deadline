begin;

-- Explicit transport evidence, captured on audit INSERT inside the existing
-- command transaction. Never reconstruct console aliases from a later request.
alter table public.admin_audit_log add column adapter_command jsonb;
alter table public.admin_audit_log add constraint admin_audit_adapter_shape check (
 adapter_command is null or (jsonb_typeof(adapter_command)='object'
 and adapter_command->>'contract' is not distinct from 'vd-admin-v1' and adapter_command ?& array['resource','action','target','reason','input']));

create function public.beta_admin_v1_authorize(p_actor uuid,p_resource text,p_write boolean default false) returns text
language plpgsql security definer set search_path='' as $$
declare actor_role text;
begin
 select r.role into actor_role from public.admin_roles r join auth.users u on u.id=r.user_id where r.user_id=p_actor and r.enabled;
 if actor_role is null then raise exception 'ADMIN_REQUIRED'; end if;
 if exists(select 1 from public.account_controls where user_id=p_actor and superseded_at is null and effective_at<=now()
   and (expires_at is null or expires_at>now()) and status<>'active') then raise exception 'ACCOUNT_BLOCKED'; end if;
 if p_resource='restricted-content' then raise exception 'RESTRICTED_CONTENT_DISABLED'; end if;
 if p_resource is null or p_resource not in ('dashboard','users','beta-applications','invitations','entitlements','quotas','bans','audit','feedback','ai-usage','settings','email','analytics','infrastructure','deployments') then raise exception 'ADMIN_RESOURCE_UNSUPPORTED'; end if;
 if p_write then
   if not ((actor_role in ('owner','admin') and p_resource in ('invitations','entitlements','quotas','bans','beta-applications','email'))
     or (actor_role='reviewer' and p_resource='beta-applications')) then raise exception 'ADMIN_FORBIDDEN'; end if;
 elsif not (actor_role='owner'
   or (actor_role='admin' and p_resource in ('users','invitations','entitlements','quotas','bans','beta-applications'))
   or (actor_role='support' and p_resource in ('users','feedback'))
   or (actor_role='analyst' and p_resource in ('analytics','ai-usage'))
   or (actor_role='reviewer' and p_resource='beta-applications')) then raise exception 'ADMIN_FORBIDDEN'; end if;
 return actor_role;
end $$;

create function public.beta_admin_v1_capture_audit() returns trigger
language plpgsql set search_path='' as $$
declare metadata text := current_setting('vd.admin_v1_command',true);
begin
 if nullif(metadata,'') is not null then new.adapter_command:=metadata::jsonb; end if;
 return new;
end $$;
create trigger beta_admin_v1_audit_metadata before insert on public.admin_audit_log for each row execute function public.beta_admin_v1_capture_audit();

create or replace function public.beta_review_application(p_actor uuid,p_request uuid,p_application uuid,p_status text,p_note text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare application public.beta_applications%rowtype; previous jsonb;
begin
 perform public.beta_admin_v1_authorize(p_actor,'beta-applications',true);
 if p_status is null or p_status not in ('pending','shortlisted','approved','rejected','invited','registered','expired') then raise exception 'ADMIN_INPUT_INVALID'; end if;
 select * into application from public.beta_applications where id=p_application for update;
 if not found then raise exception 'ADMIN_NOT_FOUND'; end if;
 previous:=to_jsonb(application);
 update public.beta_applications set status=p_status,review_note=p_note,reviewed_at=now(),reviewed_by=p_actor,updated_at=now()
  where id=p_application returning * into application;
 insert into public.admin_audit_log(actor_user_id,action,target_type,target_id,reason,before_json,after_json,request_id)
  values(p_actor,'application_review','beta_application',p_application::text,p_note,previous,to_jsonb(application),p_request);
 return to_jsonb(application);
end $$;

-- Safe read helpers reuse the authoritative entitlement decision and quota snapshot.
create function public.beta_admin_v1_user(p_user uuid,p_at timestamptz) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',u.id,'email',u.email,'created_at',u.created_at,'display_name',p.display_name,
 'signup_cohort_id',p.signup_cohort_id,'signup_source',p.signup_source,
 'account_status',coalesce((select status from public.account_controls where user_id=u.id and superseded_at is null
 and effective_at<=p_at and (expires_at is null or expires_at>p_at) order by effective_at desc,id desc limit 1),'active'),
 'effective',public.beta_admin_effective_entitlement(u.id),'quota',public.beta_ai_quota_snapshot(u.id,p_at),
 'admin_grants',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'grant_type',g.grant_type,'valid_from',g.valid_from,
 'valid_until',g.valid_until,'reason',g.reason,'revoked_at',g.revoked_at) order by g.created_at desc,g.id)
 from public.admin_access_grants g where g.user_id=u.id),'[]'::jsonb))
 from auth.users u left join public.profiles p on p.id=u.id where u.id=p_user;
$$;

create function public.beta_admin_v1_rows(p_resource text,p_at timestamptz,p_query jsonb) returns table(id uuid,data jsonb)
language plpgsql stable security definer set search_path='' as $$
declare source_sql text; selected record;
begin
 -- Only fixed SQL is selected below; no request text is interpolated into SQL.
 -- Filter/keyset/limit precede expensive per-user entitlement/quota projection.
 case p_resource
 when 'users','entitlements','quotas' then
  source_sql:=$query$select u.id,jsonb_build_object('id',u.id,'email',u.email,'display_name',p.display_name,
   'signup_cohort_id',p.signup_cohort_id,'account_status',coalesce((select status from public.account_controls
    where user_id=u.id and superseded_at is null and effective_at<=$1 and (expires_at is null or expires_at>$1)
    order by effective_at desc,id desc limit 1),'active')) data
   from auth.users u left join public.profiles p on p.id=u.id$query$;
  if p_resource='entitlements' then
   source_sql:='select u.id,u.data||jsonb_build_object(''status'',case when (public.beta_admin_effective_entitlement(u.id)->>''allowed'')::boolean then ''active'' else ''inactive'' end) data from ('||source_sql||') u';
  end if;
 when 'beta-applications' then
  source_sql:=$query$select a.id,(to_jsonb(a)-'email_hash')||jsonb_build_object('history',
    coalesce((select jsonb_agg(h.entry order by h.created_at,h.id) from
     (select l.id,l.created_at,jsonb_build_object('id',l.id,'actor',l.actor_user_id,
      'action',coalesce(l.adapter_command->>'action',l.action),'status',l.after_json->>'status',
      'reason',coalesce(l.adapter_command->>'reason',l.reason),'timestamp',l.created_at) entry
      from public.admin_audit_log l where l.target_type='beta_application' and l.target_id=a.id::text
      order by l.created_at desc,l.id desc limit 50) h),'[]'::jsonb)) data from public.beta_applications a$query$;
 when 'invitations' then
  source_sql:=$query$select i.id,(to_jsonb(i)-'code_hash')||jsonb_build_object('kind',
   (select a.adapter_command#>>'{input,kind}' from public.admin_audit_log a where a.action='invite_create' and a.target_id=i.id::text order by a.created_at desc limit 1),
   'status',case when not i.enabled then 'disabled' when i.expires_at<=$1 then 'expired' when i.used_count>=i.max_uses then 'exhausted' else 'active' end) data from public.invite_codes i$query$;
 when 'bans' then
  source_sql:=$query$select c.id,to_jsonb(c)||jsonb_build_object('email',u.email) data from public.account_controls c left join auth.users u on u.id=c.user_id
   where c.superseded_at is null and c.effective_at<=$1 and (c.expires_at is null or c.expires_at>$1)$query$;
 when 'audit' then source_sql:='select a.id,to_jsonb(a)-''ip_hash'' data from public.admin_audit_log a';
 when 'feedback' then
  source_sql:=$query$select f.id,jsonb_build_object('id',f.id,'user_id',f.user_id,'type',f.type,'status',f.status,'created_at',f.created_at,'email',u.email) data
   from public.user_feedback f left join auth.users u on u.id=f.user_id$query$;
 when 'ai-usage' then
  source_sql:=$query$select a.id,(to_jsonb(a)-'error_code')||jsonb_build_object('email',u.email) data from public.ai_usage_events a left join auth.users u on u.id=a.user_id$query$;
 else raise exception 'ADMIN_RESOURCE_UNSUPPORTED';
 end case;
 for selected in execute 'select r.id,r.data from ('||source_sql||') r
  where ($2 is null or r.id>$2) and ($3 is null or r.id=$3)
   and (nullif($4->>''q'','''') is null or strpos(lower(concat_ws('' '',r.data->>''email'',r.data->>''name'',r.data->>''display_name'',r.data->>''display_prefix'')),lower($4->>''q''))>0)
   and (nullif($4->>''status'','''') is null or coalesce(r.data->>''status'',r.data->>''account_status'')=$4->>''status'')
   and (nullif($4->>''cohort'','''') is null or coalesce(r.data->>''signup_cohort_id'',r.data->>''cohort_id'')=$4->>''cohort'')
  order by r.id limit $5'
  using p_at,(p_query->>'after')::uuid,(p_query->>'id')::uuid,p_query,coalesce((p_query->>'limit')::integer,50)+1
 loop
  id:=selected.id;
  data:=case when p_resource in ('users','entitlements','quotas') then public.beta_admin_v1_user(id,p_at) else selected.data end;
  return next;
 end loop;
end $$;

create function public.beta_admin_v1_read(p_actor uuid,p_resource text,p_query jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path='' set timezone='UTC' as $$
declare page_size integer:=coalesce((p_query->>'limit')::integer,50); after_id uuid:=(p_query->>'after')::uuid;
 target uuid:=(p_query->>'id')::uuid; found_rows jsonb; last_id text; instant timestamptz:=now();
 day_start timestamptz:=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'; stats jsonb; banned_count bigint;
begin
 perform public.beta_admin_v1_authorize(p_actor,p_resource,false);
 if page_size not between 1 and 100 or jsonb_typeof(p_query)<>'object' then raise exception 'ADMIN_QUERY_INVALID'; end if;
 if p_resource in ('email','analytics','infrastructure','deployments') then raise exception 'ADMIN_RESOURCE_UNSUPPORTED'; end if;
 if p_resource='settings' then return jsonb_build_object('items','[]'::jsonb,'summary',jsonb_build_object(
   'adminGrantSupport',jsonb_build_object('contract','vd-admin-tiers-v1','grantableTiers',jsonb_build_array('plus')),
   'contractVersion','vd-admin-v1','closedBeta',true)); end if;
 if p_resource='dashboard' then
  select count(distinct user_id) into banned_count from public.account_controls where superseded_at is null and status='banned'
   and effective_at<=instant and (expires_at is null or expires_at>instant);
  select jsonb_build_object('aiCallsToday',count(*) filter(where status<>'rejected'),
   'aiEstimatedCostToday',case when count(*) filter(where cost_status='unknown')>0 or count(distinct currency)>1 then null else coalesce(sum(estimated_cost_minor),0) end,
   'currency',case when count(distinct currency)>1 then null else coalesce(max(currency),'CNY') end) into stats
   from public.ai_usage_events where created_at>=day_start and created_at<day_start+interval '24 hours';
  return jsonb_build_object('items','[]'::jsonb,'summary',stats||jsonb_build_object(
   'totalUsers',(select count(*) from auth.users),'pendingApplications',(select count(*) from public.beta_applications where status='pending'),
   'activeInvites',(select count(*) from public.invite_codes where enabled and used_count<max_uses and (expires_at is null or expires_at>instant)),
   'plusUsers',(select count(*) from auth.users u where (public.beta_admin_effective_entitlement(u.id)->>'allowed')::boolean),
   'bannedUsers',banned_count,'bannedAccounts',banned_count,
   'callsToday',stats->'aiCallsToday','costToday',stats->'aiEstimatedCostToday',
   'observedAt',instant,'windowStart',day_start,'windowEnd',day_start+interval '24 hours','timezone','UTC','source','postgresql',
   'costUnit','currency_minor','dau',null,'wau',null,'mau',null));
 end if;
 select coalesce(jsonb_agg(data order by id),'[]'::jsonb) into found_rows from (
  select r.id,r.data from public.beta_admin_v1_rows(p_resource,instant,p_query) r
  order by r.id limit page_size+1) selected;
 if jsonb_array_length(found_rows)>page_size then
  last_id:=found_rows->(page_size-1)->>'id';
  select jsonb_agg(item order by ord) into found_rows from jsonb_array_elements(found_rows) with ordinality e(item,ord) where ord<=page_size;
 end if;
 return jsonb_build_object('items',found_rows,'nextId',last_id,'observedAt',instant);
end $$;

create function public.beta_admin_v1_audit_receipt(p_actor uuid,p_request uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare row_count bigint; audit jsonb;
begin
 if not exists(select 1 from public.admin_command_receipts where actor_user_id=p_actor and request_id=p_request) then raise exception 'AUDIT_RECEIPT_MISSING'; end if;
 select count(*),jsonb_agg(to_jsonb(a))->0 into row_count,audit from public.admin_audit_log a where actor_user_id=p_actor and request_id=p_request;
 if row_count<>1 or coalesce(jsonb_typeof(audit->'adapter_command'),'null')<>'object' then raise exception 'AUDIT_RECEIPT_MISSING'; end if;
 perform public.beta_admin_v1_authorize(p_actor,audit#>>'{adapter_command,resource}',true);
 return audit-'ip_hash';
end $$;

create index admin_audit_actor_request_idx on public.admin_audit_log(actor_user_id,request_id);
create index ai_usage_created_idx on public.ai_usage_events(created_at);

-- The dispatcher definition below is replaced in place; no second mutation or
-- idempotency engine is introduced. Existing worker/domain semantics stay authoritative.
create or replace function public.beta_admin_command(p_actor uuid,p_request uuid,p_action text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare receipt public.admin_command_receipts%rowtype; fingerprint text; result jsonb; worker_result jsonb;
 plaintext text; from_at timestamptz; until_at timestamptz; user_id uuid; is_unlimited boolean;
 metadata jsonb:=p_input->'_adminV1'; mapped_action text; audit_count integer;
begin
 -- Reauthorize before lookup, including revoked actors replaying an invite secret.
 if p_action='review_application' then perform public.beta_admin_v1_authorize(p_actor,'beta-applications',true);
 else perform public.beta_require_admin(p_actor,p_action='set_feature_flag'); end if;
 if p_request is null or p_action is null or p_action not in ('grant_entitlement','revoke_entitlement','create_invite','disable_invite',
  'review_application','set_account_control','unban','grant_quota','reset_quota','set_feature_flag')
  or p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>60000 then raise exception 'ADMIN_INPUT_INVALID'; end if;
 if metadata is not null then
  if jsonb_typeof(metadata)<>'object' or metadata->>'contract' is distinct from 'vd-admin-v1'
   or not(metadata ?& array['resource','action','target','reason','input']) or jsonb_typeof(metadata->'input')<>'object'
   or nullif(btrim(metadata->>'reason'),'') is null or length(metadata->>'reason')>500 then raise exception 'ADMIN_INPUT_INVALID'; end if;
  perform public.beta_admin_v1_authorize(p_actor,metadata->>'resource',true);
  mapped_action:=case (metadata->>'resource')||':'||(metadata->>'action')
   when 'entitlements:grant' then 'grant_entitlement' when 'entitlements:revoke' then 'revoke_entitlement'
   when 'invitations:create' then 'create_invite' when 'invitations:disable' then 'disable_invite' when 'invitations:revoke' then 'disable_invite'
   when 'beta-applications:shortlist' then 'review_application' when 'beta-applications:approve' then 'review_application' when 'beta-applications:reject' then 'review_application'
   when 'quotas:adjust' then 'grant_quota' when 'quotas:reset' then 'reset_quota'
   when 'bans:restrict' then 'set_account_control' when 'bans:suspend' then 'set_account_control' when 'bans:ban' then 'set_account_control' when 'bans:unban' then 'unban' end;
  if mapped_action is distinct from p_action then raise exception 'ADMIN_INPUT_INVALID'; end if;
  if metadata#>>'{input,tier}'='pro' then raise exception 'PRO_NOT_SUPPORTED'; end if;
  if p_action='create_invite' then
   if metadata->>'target' is distinct from 'new' then raise exception 'ADMIN_INPUT_INVALID'; end if;
  elsif p_action<>'revoke_entitlement' and metadata->>'target' is distinct from coalesce(p_input->>'userId',p_input->>'inviteId',p_input->>'applicationId') then
   raise exception 'ADMIN_INPUT_INVALID';
  end if;
 end if;
 -- This transaction-local context is cleared for ordinary legacy commands too.
 perform set_config('vd.admin_v1_command',coalesce(metadata::text,''),true);
 fingerprint:=encode(sha256(convert_to(jsonb_build_object('action',p_action,'input',p_input)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('admin-command:'||p_actor::text||':'||p_request::text,0));
 -- A retry may have waited while the actor was revoked. Recheck AFTER the lock,
 -- before returning a stored result (especially the private invite plaintext).
 if metadata is not null then perform public.beta_admin_v1_authorize(p_actor,metadata->>'resource',true);
 elsif p_action='review_application' then perform public.beta_admin_v1_authorize(p_actor,'beta-applications',true);
 else perform public.beta_require_admin(p_actor,p_action='set_feature_flag'); end if;
 select * into receipt from public.admin_command_receipts where actor_user_id=p_actor and request_id=p_request;
 if found then
  if receipt.action<>p_action or receipt.command_hash<>fingerprint then raise exception 'IDEMPOTENCY_KEY_REUSED'; end if;
  result:=receipt.result_json;
  if p_action='create_invite' then
   select invite_code into plaintext from vd_admin_private.invite_command_results where actor_user_id=p_actor and request_id=p_request;
   if plaintext is null then raise exception 'ADMIN_COMMAND_RESULT_UNAVAILABLE'; end if;
   result:=jsonb_set(result,'{invite,code}',to_jsonb(plaintext));
  end if;
  perform set_config('vd.admin_v1_command','',true);
  return result;
 end if;
 -- Relative dates and random invite codes resolve only after the replay lookup.
 case p_action
 when 'grant_entitlement' then
  user_id:=(p_input->>'userId')::uuid;
  from_at:=coalesce((p_input->>'validFrom')::timestamptz,now());
  if coalesce((p_input->>'permanent')::boolean,false) then until_at:=null;
  elsif p_input->>'validUntil' is not null then until_at:=(p_input->>'validUntil')::timestamptz;
  elsif (p_input->>'durationDays')::integer in (1,7,30,90) then until_at:=from_at+interval '24 hours'*(p_input->>'durationDays')::integer;
  else raise exception 'ADMIN_INPUT_INVALID'; end if;
  worker_result:=public.beta_grant_entitlement(p_actor,p_request,user_id,from_at,until_at,
   coalesce(p_input->>'grantType','manual'),left(coalesce(p_input->>'reason','admin_grant'),500),left(p_input->>'note',2000));
  result:=worker_result||jsonb_build_object('effective',public.beta_admin_effective_entitlement(user_id));
 when 'revoke_entitlement' then
  if metadata is not null and not exists(select 1 from public.admin_access_grants g where g.id=(p_input->>'grantId')::uuid and g.user_id=(metadata->>'target')::uuid) then raise exception 'ADMIN_NOT_FOUND'; end if;
  worker_result:=public.beta_revoke_entitlement(p_actor,p_request,(p_input->>'grantId')::uuid,left(coalesce(p_input->>'reason','admin_revoke'),500));
  result:=jsonb_build_object('grant',worker_result,'effective',public.beta_admin_effective_entitlement((worker_result->>'user_id')::uuid));
 when 'create_invite' then
  plaintext:='VD-'||upper(substr(encode(sha256(uuid_send(gen_random_uuid())||uuid_send(gen_random_uuid())),'hex'),1,32));
  worker_result:=public.beta_create_invite(p_actor,p_request,encode(sha256(convert_to(lower(plaintext),'UTF8')),'hex'),
   left(plaintext,7),(p_input->>'cohortId')::uuid,coalesce((p_input->>'maxUses')::integer,1),(p_input->>'expiresAt')::timestamptz,left(p_input->>'note',1000));
  result:=jsonb_build_object('invite',worker_result,'requestId',p_request);
 when 'disable_invite' then
  result:=jsonb_build_object('invite',public.beta_disable_invite(p_actor,p_request,(p_input->>'inviteId')::uuid,p_input->>'reason'));
 when 'review_application' then
  result:=jsonb_build_object('application',public.beta_review_application(p_actor,p_request,(p_input->>'applicationId')::uuid,p_input->>'status',p_input->>'reviewNote'));
 when 'set_account_control','unban' then
  until_at:=(p_input->>'expiresAt')::timestamptz;
  if p_input ? 'durationDays' then
   if p_action='unban' or (p_input->>'durationDays')::integer not between 1 and 365 or until_at is not null then raise exception 'ADMIN_INPUT_INVALID'; end if;
   until_at:=now()+interval '24 hours'*(p_input->>'durationDays')::integer;
  end if;
  result:=jsonb_build_object('control',public.beta_transition_account(p_actor,p_request,(p_input->>'userId')::uuid,
   case when p_action='unban' then 'active' else p_input->>'status' end,p_input->>'reason',coalesce(p_input->>'reasonCode','manual'),p_input->>'note',until_at));
 when 'grant_quota' then
  is_unlimited:=coalesce((p_input->>'unlimited')::boolean,false);
  if is_unlimited and p_input->>'amount' is not null then raise exception 'ADMIN_INPUT_INVALID'; end if;
  result:=jsonb_build_object('grant',public.beta_grant_quota(p_actor,p_request,(p_input->>'userId')::uuid,
   case when is_unlimited then null else (p_input->>'amount')::integer end,is_unlimited,coalesce((p_input->>'validFrom')::timestamptz,now()),
   (p_input->>'validUntil')::timestamptz,left(coalesce(p_input->>'reason','admin_quota_grant'),500)));
 when 'reset_quota' then
  result:=jsonb_build_object('grant',public.beta_reset_quota(p_actor,p_request,(p_input->>'userId')::uuid,left(coalesce(p_input->>'reason','admin_quota_reset'),500)));
 when 'set_feature_flag' then
  result:=jsonb_build_object('flag',public.beta_set_feature_flag(p_actor,p_request,p_input->>'key',coalesce(p_input->>'scopeType','global'),
   p_input->>'scopeId',coalesce((p_input->>'enabled')::boolean,false),p_input->>'reason'));
 end case;
 if metadata is not null then
  if p_action in ('grant_quota','reset_quota') then result:=result||jsonb_build_object('quota',public.beta_ai_quota_snapshot((p_input->>'userId')::uuid)); end if;
  select count(*) into audit_count from public.admin_audit_log where actor_user_id=p_actor and request_id=p_request;
  if audit_count<>1 or not exists(select 1 from public.admin_audit_log where actor_user_id=p_actor and request_id=p_request and adapter_command=metadata)
   then raise exception 'AUDIT_RECEIPT_MISSING'; end if;
 end if;
 insert into public.admin_command_receipts(actor_user_id,request_id,action,command_hash,result_json) values(p_actor,p_request,p_action,fingerprint,result);
 if p_action='create_invite' then
  insert into vd_admin_private.invite_command_results(actor_user_id,request_id,invite_code) values(p_actor,p_request,plaintext);
  result:=jsonb_set(result,'{invite,code}',to_jsonb(plaintext));
 end if;
 perform set_config('vd.admin_v1_command','',true);
 return result;
end $$;

-- SECURITY DEFINER helpers are private, not a browser/direct-worker API.
do $$ declare f record;
begin
 for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace
  and proname like 'beta_admin_v1_%' loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 end loop;
end $$;
grant execute on function public.beta_admin_v1_authorize(uuid,text,boolean) to service_role;
grant execute on function public.beta_admin_v1_read(uuid,text,jsonb) to service_role;
grant execute on function public.beta_admin_v1_audit_receipt(uuid,uuid) to service_role;
-- CREATE OR REPLACE preserves the existing dispatcher-only service EXECUTE grant.
commit;
