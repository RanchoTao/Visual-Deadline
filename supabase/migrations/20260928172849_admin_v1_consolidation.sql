-- One canonical PR140 lineage. Admission rollout is database-owned and default OFF.
begin;
create table public.beta_admission_policy (
 key text primary key check(key='VD_CLOSED_BETA_ADMISSION_ENFORCED'),
 enabled boolean not null default false,
 grandfather_cutoff timestamptz,
 reason text not null,
 updated_at timestamptz not null default now(),
 check(not enabled or grandfather_cutoff is not null)
);
insert into public.beta_admission_policy(key,reason) values ('VD_CLOSED_BETA_ADMISSION_ENFORCED','Default OFF; reviewed grandfather grants required before enabling');
alter table public.beta_admission_policy enable row level security;
revoke all on public.beta_admission_policy from public,anon,authenticated,service_role;
create function public.beta_admission_state() returns boolean language sql stable security definer set search_path='' as $$
 select enabled from public.beta_admission_policy where key='VD_CLOSED_BETA_ADMISSION_ENFORCED'
$$;
revoke all on function public.beta_admission_state() from public,anon,authenticated;
grant execute on function public.beta_admission_state() to service_role;

create function public.beta_workspace_admitted(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select p_user is not null and exists(select 1 from public.beta_admission_policy where key='VD_CLOSED_BETA_ADMISSION_ENFORCED' and (
  not enabled or (exists(select 1 from auth.users where id=p_user and (email_confirmed_at is not null or phone_confirmed_at is not null)) and public.has_beta_access(p_user))
 ))
$$;
create or replace function public.admin_may_operate() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and public.admin_account_status(auth.uid())='normal' and public.beta_workspace_admitted(auth.uid())
$$;
create or replace function public.account_bootstrap() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('accountStatus',public.admin_account_status(auth.uid()),'effectiveTier',public.admin_effective_tier(auth.uid()),
 'admissionEnforced',(select enabled from public.beta_admission_policy where key='VD_CLOSED_BETA_ADMISSION_ENFORCED'),'workspaceAdmitted',public.beta_workspace_admitted(auth.uid())) where auth.uid() is not null
$$;

-- Rate buckets persist before Auth calls, including rejected invites; no email/code enumeration.
create function public.beta_registration_check(p_hash text,p_email text,p_ip_hash text) returns boolean language plpgsql security definer set search_path='' as $$
declare amount integer; period timestamptz:=date_trunc('hour',now());
begin
 if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_ip_hash is null or p_ip_hash !~ '^[a-f0-9]{64}$' or p_email is null or length(p_email)>254 then raise exception 'ADMIN_INVALID_INPUT'; end if;
 insert into public.beta_application_rate_buckets(kind,key_hash,window_start,count) values ('ip',p_ip_hash,period,1)
 on conflict(kind,key_hash,window_start) do update set count=public.beta_application_rate_buckets.count+1 returning count into amount;
 if amount>10 then return false; end if;
 insert into public.beta_application_rate_buckets(kind,key_hash,window_start,count) values ('email',encode(extensions.digest('register:'||p_email,'sha256'),'hex'),period,1)
 on conflict(kind,key_hash,window_start) do update set count=public.beta_application_rate_buckets.count+1 returning count into amount;
 if amount>3 then return false; end if;
 return exists(select 1 from public.invite_codes where code_hash=p_hash and status='active' and expires_at>now() and used_count<max_uses and (recipient_email is null or recipient_email=p_email));
end$$;

revoke all on function public.beta_workspace_admitted(uuid),public.beta_registration_check(text,text,text) from public,anon,authenticated;
grant execute on function public.beta_workspace_admitted(uuid),public.beta_registration_check(text,text,text) to service_role;

alter table public.ai_usage_ledger add column generated_at timestamptz;
create or replace function public.ai_reserve(p_user uuid,p_request uuid,p_mode text,p_provider text,p_model text) returns jsonb language plpgsql security definer set search_path='' as $$
declare snap jsonb;
begin
 perform pg_advisory_xact_lock(hashtext('admin-user:'||p_user::text));
 if not public.beta_workspace_admitted(p_user) then raise exception 'BETA_ADMISSION_REQUIRED' using errcode='42501'; end if;
 if public.admin_account_status(p_user)<>'normal' then raise exception 'ACCOUNT_BLOCKED' using errcode='42501'; end if;
 if exists(select 1 from public.ai_usage_ledger where request_id=p_request) then raise exception 'AI_REQUEST_REPLAY' using errcode='23505'; end if;
 update public.ai_usage_ledger set status='released',settled_at=now(),error_code='RESERVATION_EXPIRED' where user_id=p_user and status='reserved' and expires_at<=now();
 snap:=public.admin_quota_snapshot(p_user);
 if snap->>'remaining' is not null and (snap->>'remaining')::integer<1 then raise exception 'AI_QUOTA_EXHAUSTED'; end if;
 insert into public.ai_usage_ledger(request_id,user_id,mode,provider,model) values(p_request,p_user,p_mode,p_provider,p_model);
 return public.admin_quota_snapshot(p_user);
end$$;
create or replace function public.ai_settle(p_user uuid,p_request uuid,p_status text,p_usage jsonb) returns void language plpgsql security definer set search_path='' as $$
declare item public.ai_usage_ledger%rowtype;
begin
 perform pg_advisory_xact_lock(hashtext('admin-user:'||p_user::text));
 select * into item from public.ai_usage_ledger where request_id=p_request and user_id=p_user for update;
 if not found then raise exception 'AI_RESERVATION_NOT_FOUND'; end if;
 if item.status<>'reserved' then
  if item.status=p_status then return; end if;
  raise exception 'AI_SETTLEMENT_CONFLICT';
 end if;
 if p_status not in ('succeeded','failed','cancelled','released') then raise exception 'ADMIN_INVALID_INPUT'; end if;
 update public.ai_usage_ledger set status=case when expires_at<=now() then 'released' else p_status end,settled_at=now(),
 input_tokens=(p_usage->>'inputTokens')::bigint,output_tokens=(p_usage->>'outputTokens')::bigint,cached_tokens=(p_usage->>'cachedTokens')::bigint,
 model=coalesce(nullif(left(p_usage->>'model',200),''),model),generated_at=(p_usage->>'generatedAt')::timestamptz,
 latency_ms=(p_usage->>'latencyMs')::integer,error_code=left(p_usage->>'errorCode',100),estimated_cost_minor=(p_usage->>'estimatedCostMinor')::bigint,currency=left(p_usage->>'currency',3) where request_id=p_request;
end$$;
create or replace function public.admin_read(p_actor uuid,p_role text,p_resource text,p_query jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare items jsonb:='[]'; row_data jsonb; lim integer:=least(100,greatest(1,coalesce((p_query->>'limit')::integer,50))); after_id text:=coalesce(p_query->>'cursor',''); q text:=coalesce(p_query->>'q',''); filter_status text:=p_query->>'status'; summary jsonb:='{}';
begin
 perform public.admin_assert_operator(p_actor,p_role,p_resource,null);
 if length(q)>256 or length(after_id)>100 then raise exception 'ADMIN_INVALID_INPUT'; end if;
 if p_resource='entitlements' then
  for row_data in select jsonb_build_object('id',e.id,'grantId',g.id,'userId',e.user_id,'email',u.email,'tier',case when e.capability='vd.pro' then 'pro' else 'plus' end,
   'source',case when e.source_type='operator_grant' then g.source else e.source_type end,'effectiveTier',public.admin_effective_tier(e.user_id),
   'validFrom',e.valid_from,'validUntil',e.valid_until,'status',case when e.status='active' and e.valid_until<=now() then 'expired' when e.status='active' and e.valid_from>now() then 'scheduled' else e.status end,'reason',left(e.reason,1000))
  from public.entitlements e join auth.users u on u.id=e.user_id left join public.admin_access_grants g on e.source_type='operator_grant' and e.source_id=g.id::text
  where e.id::text>after_id and (p_query->>'id' is null or e.id::text=p_query->>'id')
  and (q='' or strpos(lower(coalesce(u.email,'')),lower(q))>0 or strpos(lower(coalesce(g.source,e.source_type)),lower(q))>0)
  and (filter_status is null or (case when e.status='active' and e.valid_until<=now() then 'expired' when e.status='active' and e.valid_from>now() then 'scheduled' else e.status end)=filter_status)
  and (e.source_type<>'operator_grant' or e.capability=case when g.tier='pro' then 'vd.pro' else 'vd.plus' end)
  order by e.id limit lim+1 loop items:=items||jsonb_build_array(row_data); end loop;
 elsif p_resource in ('users','quotas') then
  for row_data in select public.admin_user_dto(u.id) from auth.users u left join public.profiles p on p.user_id=u.id
  where u.id::text>after_id and (p_query->>'id' is null or u.id::text=p_query->>'id')
  and (q='' or strpos(lower(coalesce(u.email,'')),lower(q))>0 or strpos(lower(coalesce(p.display_name,p.data->>'displayName',p.data->>'name',p.data->>'username','')),lower(q))>0)
  order by u.id limit lim+1 loop items:=items||jsonb_build_array(row_data); end loop;
 elsif p_resource='beta-applications' then
  for row_data in select jsonb_build_object('id',a.id,'email',a.email_normalized,'name',a.name,'organization',a.organization,'role',a.role,'useCase',a.use_case,'source',a.referral_source,'createdAt',a.submitted_at,'status',a.status,'reviewNote',a.review_note,
  'history',(select coalesce(jsonb_agg(jsonb_build_object('actor',actor_user_id,'action',action,'timestamp',created_at,'reason',reason)),'[]') from (select * from public.admin_audit_events where target_type='beta-applications' and target_id=a.id::text order by created_at desc limit 50) history))
  from public.beta_applications a where a.id::text>after_id and (filter_status is null or a.status=filter_status) and (q='' or strpos(a.email_normalized,lower(q))>0 or strpos(lower(a.name),lower(q))>0) order by a.id limit lim+1 loop items:=items||jsonb_build_array(row_data); end loop;
 elsif p_resource='invitations' then
  for row_data in select jsonb_build_object('id',i.id,'code',i.display_prefix||'…','kind',i.kind,'cohort',c.name,'status',case when i.status='active' and i.expires_at<=now() then 'expired' else i.status end,'used',i.used_count,'limit',i.max_uses,'expiresAt',i.expires_at,'createdAt',i.created_at,'note',i.note,'source','admin')
  from public.invite_codes i left join public.beta_cohorts c on c.id=i.cohort_id where i.id::text>after_id and (filter_status is null or i.status=filter_status) order by i.id limit lim+1 loop items:=items||jsonb_build_array(row_data); end loop;
 elsif p_resource='bans' then
  for row_data in select jsonb_build_object('id',a.user_id,'userId',a.user_id,'email',u.email,'accountStatus',public.admin_account_status(a.user_id),'reason',a.reason,'actor',a.updated_by,'createdAt',a.updated_at,'expiresAt',a.expires_at) from public.account_controls a join auth.users u on u.id=a.user_id where a.user_id::text>after_id order by a.user_id limit lim+1 loop items:=items||jsonb_build_array(row_data); end loop;
 elsif p_resource='audit' then
  for row_data in select jsonb_build_object('id',id,'actor',actor_user_id,'action',action,'target',target_id,'reason',reason,'before',before_json,'after',after_json,'timestamp',created_at,'requestId',request_id) from public.admin_audit_events where id::text>after_id order by id limit lim+1 loop items:=items||jsonb_build_array(row_data); end loop;
 elsif p_resource='email' then
  for row_data in select jsonb_build_object('id',id,'template',template,'recipient',recipient,'status',status,'providerMessageId',provider_message_id,'createdAt',created_at,'sentAt',sent_at,'deliveredAt',delivered_at) from public.email_outbox where id::text>after_id and (filter_status is null or status=filter_status) order by id limit lim+1 loop items:=items||jsonb_build_array(row_data); end loop;
 elsif p_resource='ai-usage' then
  for row_data in select jsonb_build_object('id',l.request_id,'email',u.email,'model',l.model,'inputTokens',l.input_tokens,'outputTokens',l.output_tokens,'estimatedCost',l.estimated_cost_minor,'latencyMs',l.latency_ms,'status',l.status,'createdAt',l.created_at) from public.ai_usage_ledger l join auth.users u on u.id=l.user_id where l.request_id::text>after_id order by l.request_id limit lim+1 loop items:=items||jsonb_build_array(row_data); end loop;
 elsif p_resource='settings' then summary:=jsonb_build_object('source','VD authoritative database','status','available');
 else summary:=jsonb_build_object('source','VD authoritative database','status','pending');
 end if;
 if p_resource in ('settings','users','entitlements') then summary:=summary||jsonb_build_object('adminGrantSupport',jsonb_build_object('contract','vd-admin-tiers-v1','grantableTiers',jsonb_build_array('plus','pro'))); end if;
 if jsonb_array_length(items)>lim then return jsonb_build_object('items',items-(jsonb_array_length(items)-1),'nextCursor',items->(lim-1)->>'id','summary',summary); end if;
 return jsonb_build_object('items',items,'summary',summary);
end$$;
create or replace function public.admin_user_dto(p_user uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u auth.users%rowtype; profile jsonb; tier_name text:=public.admin_effective_tier(p_user); sources jsonb; grants jsonb; until_time timestamptz; redemption public.invite_redemptions%rowtype;
begin
 select * into u from auth.users where id=p_user; if not found then raise exception 'ADMIN_NOT_FOUND'; end if;
 select to_jsonb(profiles) into profile from public.profiles where user_id=p_user;
 select * into redemption from public.invite_redemptions where user_id=p_user order by redeemed_at desc limit 1;
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'tier',case when e.capability='vd.pro' then 'pro' else 'plus' end,'source',case when e.source_type='operator_grant' then g.source else e.source_type end,'status',case when e.status='active' and e.valid_until<=now() then 'expired' else e.status end,'validFrom',e.valid_from,'validUntil',e.valid_until,'reason',left(e.reason,1000)) order by e.valid_from), '[]'::jsonb) into sources
 from (select * from public.entitlements where user_id=p_user and (source_type<>'operator_grant' or capability=case when (select tier from public.admin_access_grants where id::text=source_id)='pro' then 'vd.pro' else 'vd.plus' end) order by valid_from desc limit 50) e
 left join public.admin_access_grants g on e.source_type='operator_grant' and e.source_id=g.id::text;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'tier',tier,'source',source,'status',status,'validFrom',valid_from,'validUntil',valid_until,'reason',left(reason,1000))),'[]'::jsonb) into grants from (select * from public.admin_access_grants where user_id=p_user order by created_at desc limit 50) g;
 -- Union only the active intervals for the effective premium capability; disconnected future intervals do not extend today's access.
 select upper(r) into until_time from (
 select unnest(range_agg(tstzrange(valid_from,valid_until,'[)'))) r from public.entitlements
 where user_id=p_user and capability=case when tier_name='pro' then 'vd.pro' else 'vd.plus' end and status='active'
 ) x where r @> now() limit 1;
 return jsonb_build_object('id',u.id,'email',u.email,'name',left(coalesce(profile->>'display_name',profile->'data'->>'displayName',profile->'data'->>'name',profile->'data'->>'username'),100),'createdAt',u.created_at,'lastActiveAt',u.last_sign_in_at,
 'cohort',(select name from public.beta_cohorts where id=redemption.cohort_id),'inviteSource',redemption.source,
 'currentTier',tier_name,'effectiveTier',tier_name,'effectivePlus',tier_name<>'free','membershipStatus',tier_name,
 'capabilities',case when tier_name='pro' then jsonb_build_array('vd.plus','vd.pro') when tier_name='plus' then jsonb_build_array('vd.plus') else '[]'::jsonb end,
 'validUntil',until_time,'entitlementSources',sources,'adminGrants',grants,'accountStatus',public.admin_account_status(p_user),
 'tasksCount',(select count(*) from public.tasks where user_id=p_user)+(select count(*) from public.v2_tasks where user_id=p_user),
 'goalsCount',(select count(*) from public.goals where user_id=p_user)+(select count(*) from public.v2_goals where user_id=p_user),
 'reviewsCount',(select count(*) from public.review_records where user_id=p_user),
 'quotaOverrides',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'amount',amount,'validFrom',valid_from,'validUntil',valid_until,'revokedAt',revoked_at)),'[]'::jsonb) from (select * from public.ai_quota_overrides where user_id=p_user order by created_at desc limit 50) o)) || public.admin_quota_snapshot(p_user);
end$$;
commit;
