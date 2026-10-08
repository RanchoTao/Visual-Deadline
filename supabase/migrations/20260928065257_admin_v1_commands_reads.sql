begin;
create function public.admin_user_dto(p_user uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u auth.users%rowtype; profile jsonb; tier_name text:=public.admin_effective_tier(p_user); sources jsonb; grants jsonb; until_time timestamptz; redemption public.invite_redemptions%rowtype;
begin
 select * into u from auth.users where id=p_user; if not found then raise exception 'ADMIN_NOT_FOUND'; end if;
 select to_jsonb(profiles) into profile from public.profiles where user_id=p_user;
 select * into redemption from public.invite_redemptions where user_id=p_user order by redeemed_at desc limit 1;
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'tier',case when e.capability='vd.pro' then 'pro' else 'plus' end,'source',case when e.source_type='operator_grant' then g.source else e.source_type end,'status',case when e.status='active' and e.valid_until<=now() then 'expired' else e.status end,'validFrom',e.valid_from,'validUntil',e.valid_until,'reason',left(e.reason,1000)) order by e.valid_from), '[]'::jsonb) into sources
 from (select * from public.entitlements where user_id=p_user and (tier_name<>'pro' or capability='vd.pro' or source_type<>'operator_grant') order by valid_from desc limit 50) e
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
create function public.admin_read(p_actor uuid,p_role text,p_resource text,p_query jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare items jsonb:='[]'; row_data jsonb; lim integer:=least(100,greatest(1,coalesce((p_query->>'limit')::integer,50))); after_id text:=coalesce(p_query->>'cursor',''); q text:=coalesce(p_query->>'q',''); filter_status text:=p_query->>'status'; summary jsonb:='{}';
begin
 perform public.admin_assert_operator(p_actor,p_role,p_resource,null);
 if length(q)>256 or length(after_id)>100 then raise exception 'ADMIN_INVALID_INPUT'; end if;
 if p_resource in ('users','entitlements','quotas') then
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

create function public.admin_inspect(p_user uuid,p_scope text,p_from timestamptz,p_until timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$
declare item jsonb; all_items jsonb:='[]';
begin
 if p_scope is null or p_from is null or p_until is null or p_scope not in ('tasks','goals','reviews') or p_from>=p_until or p_until-p_from>interval '31 days' then raise exception 'ADMIN_INVALID_CONTENT_RANGE'; end if;
 for item in
 select jsonb_build_object('id',id,'title',left(title,1000),'content',left(content,6000),'createdAt',created_at,'updatedAt',updated_at) from (
 select 'legacy-task:'||id id,data->>'title' title,coalesce(data->>'description',data->>'content',data->>'text') content,created_at,updated_at from public.tasks where p_scope='tasks' and user_id=p_user
 union all select 'v2-task:'||id::text,title,description,created_at,updated_at from public.v2_tasks where p_scope='tasks' and user_id=p_user
 union all select 'legacy-goal:'||id,data->>'title',coalesce(data->>'description',data->>'content'),created_at,updated_at from public.goals where p_scope='goals' and user_id=p_user
 union all select 'v2-goal:'||id::text,title,description,created_at,updated_at from public.v2_goals where p_scope='goals' and user_id=p_user
 union all select 'review:'||id,data->>'title',data->>'userNote',created_at,updated_at from public.review_records where p_scope='reviews' and user_id=p_user
 ) content_rows where created_at>=p_from and created_at<p_until order by created_at,id limit 50
 loop
  if octet_length((all_items||jsonb_build_array(item))::text)>240000 then exit; end if;
  all_items:=all_items||jsonb_build_array(item);
 end loop;
 return jsonb_build_object('scope',p_scope,'items',all_items);
end$$;

create function public.admin_command(p_actor uuid,p_role text,p_resource text,p_action text,p_target text,p_reason text,p_input jsonb,p_request uuid,p_receipt_key text,p_code text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
<<admin_command>>
declare hash_value text; old_receipt public.admin_command_receipts%rowtype; audit public.admin_audit_events%rowtype;
 before_state jsonb:='{}'; after_state jsonb:='{}'; result jsonb:='{}'; receipt jsonb; user_id uuid; object_id uuid; from_time timestamptz:=now(); until_time timestamptz;
 tier_name text; source_name text; allowed text[]; cohort_id uuid; application public.beta_applications%rowtype; invitation public.invite_codes%rowtype; mail public.email_outbox%rowtype;
begin
 perform public.admin_assert_operator(p_actor,p_role,p_resource,p_action);
 if p_request is null or p_target is null or length(p_target)>100 or p_reason is null or length(btrim(p_reason)) not between 8 and 1000 or p_input is null or jsonb_typeof(p_input)<>'object' or p_receipt_key is null or length(p_receipt_key)<32 then raise exception 'ADMIN_INVALID_INPUT'; end if;
 allowed:=case p_resource
 when 'entitlements' then case when p_action='grant' then array['tier','source','days','validUntil','permanent'] else array['grantId'] end
 when 'quotas' then case when p_action='reset' then array[]::text[] else array['delta','limit','unlimited','revokeOverride','validUntil'] end
 when 'bans' then array['days','reasonCode']
 when 'invitations' then case when p_action='create' then array['kind','cohort','limit','expiresAt','note'] when p_action='expire' then array['expiresAt'] else array[]::text[] end
 when 'restricted-content' then array['category','caseReference','scope','from','until']
 else array[]::text[] end;
 if exists(select 1 from jsonb_object_keys(p_input) k where not(k=any(allowed))) then raise exception 'ADMIN_INVALID_INPUT'; end if;
 hash_value:=encode(extensions.digest(jsonb_build_object('actor',p_actor,'role',p_role,'resource',p_resource,'action',p_action,'target',p_target,'reason',btrim(p_reason),'input',p_input)::text,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtext('admin-request:'||p_actor::text||':'||p_request::text));
 select * into old_receipt from public.admin_command_receipts where actor_user_id=p_actor and request_id=p_request;
 if found then
  if old_receipt.command_hash<>hash_value then raise exception 'ADMIN_IDEMPOTENCY_CONFLICT' using errcode='23505'; end if;
  receipt:=extensions.pgp_sym_decrypt(old_receipt.receipt_cipher,p_receipt_key)::jsonb;
  return receipt;
 end if;
 if p_resource in ('entitlements','quotas','bans','restricted-content') then
  user_id:=p_target::uuid;
  perform pg_advisory_xact_lock(hashtext('admin-user:'||user_id::text));
  if not exists(select 1 from auth.users where id=user_id) then raise exception 'ADMIN_NOT_FOUND'; end if;
 end if;
 if p_resource='entitlements' then
  before_state:=jsonb_build_object('effectiveTier',public.admin_effective_tier(user_id));
  if p_action='grant' then
   tier_name:=coalesce(p_input->>'tier','plus'); source_name:=coalesce(p_input->>'source','admin_grant');
   if tier_name not in ('plus','pro') or source_name not in ('beta_gift','admin_grant','admin_compensation','promotion','testing') then raise exception 'ADMIN_INVALID_INPUT'; end if;
   if p_input->'permanent'='true'::jsonb then
    if source_name<>'testing' or p_input ? 'days' or p_input ? 'validUntil' then raise exception 'ADMIN_INVALID_INPUT'; end if;
   elsif p_input ? 'days' and not(p_input ? 'validUntil') then
    if jsonb_typeof(p_input->'days')<>'number' or (p_input->>'days')::integer not between 1 and 3650 then raise exception 'ADMIN_INVALID_INPUT'; end if;
    until_time:=now()+make_interval(days=>(p_input->>'days')::integer);
   elsif p_input ? 'validUntil' and not(p_input ? 'days') then until_time:=(p_input->>'validUntil')::timestamptz;
   else raise exception 'ADMIN_INVALID_INPUT'; end if;
   if (p_input->'permanent' is distinct from 'true'::jsonb and until_time is null) or (until_time is not null and until_time<=now()) then raise exception 'ADMIN_INVALID_INPUT'; end if;
   insert into public.admin_access_grants(user_id,tier,source,valid_until,reason,created_by) values(user_id,tier_name,source_name,until_time,p_reason,p_actor) returning id into object_id;
   result:=jsonb_build_object('grantId',object_id,'validUntil',until_time);
  else
   if p_input ? 'grantId' then
    object_id:=(p_input->>'grantId')::uuid;
    if not exists(select 1 from public.admin_access_grants where id=object_id and admin_access_grants.user_id=admin_command.user_id) then raise exception 'ADMIN_NOT_FOUND'; end if;
   end if;
   update public.admin_access_grants set status='revoked',revoked_by=p_actor,revoked_at=now(),revoke_reason=p_reason
    where admin_access_grants.user_id=admin_command.user_id and status='active' and (object_id is null or id=object_id);
  end if;
  after_state:=jsonb_build_object('effectiveTier',public.admin_effective_tier(user_id)); result:=result||after_state;
 elsif p_resource='quotas' then
  before_state:=public.admin_quota_snapshot(user_id);
  if p_action='reset' then
   insert into public.ai_quota_resets(user_id,period_start,reset_at,request_id) values(user_id,date_trunc('day',now() at time zone 'UTC') at time zone 'UTC',now(),p_request)
   on conflict on constraint ai_quota_resets_pkey do update set reset_at=excluded.reset_at,request_id=excluded.request_id;
  else
   if (select count(*) from jsonb_object_keys(p_input) k where k in ('delta','limit','unlimited','revokeOverride'))<>1 then raise exception 'ADMIN_INVALID_INPUT'; end if;
   until_time:=coalesce((p_input->>'validUntil')::timestamptz,now()+interval '30 days');
   if until_time<=now() then raise exception 'ADMIN_INVALID_INPUT'; end if;
   if p_input ? 'revokeOverride' then
    update public.ai_quota_overrides set revoked_at=now() where id=(p_input->>'revokeOverride')::uuid and ai_quota_overrides.user_id=admin_command.user_id;
    if not found then raise exception 'ADMIN_NOT_FOUND'; end if;
   else
    source_name:=case when p_input ? 'delta' then 'delta' when p_input ? 'limit' then 'limit' else 'unlimited' end;
    if source_name='unlimited' and (p_role<>'owner' or p_input->'unlimited' is distinct from 'true'::jsonb or not exists(select 1 from public.admin_access_grants where admin_access_grants.user_id=admin_command.user_id and source='testing' and status='active' and valid_from<=now() and (valid_until is null or valid_until>now()))) then raise exception 'ADMIN_FORBIDDEN' using errcode='42501'; end if;
    insert into public.ai_quota_overrides(user_id,kind,amount,valid_until,reason,created_by) values(user_id,source_name,case when source_name='unlimited' then null else (p_input->>source_name)::integer end,until_time,p_reason,p_actor) returning id into object_id;
    result:=jsonb_build_object('overrideId',object_id);
   end if;
  end if;
  after_state:=public.admin_quota_snapshot(user_id); result:=result||after_state;
 elsif p_resource='bans' then
  before_state:=jsonb_build_object('accountStatus',public.admin_account_status(user_id));
  if p_input ? 'days' then
   if jsonb_typeof(p_input->'days')<>'number' or (p_input->>'days')::integer not between 1 and 3650 then raise exception 'ADMIN_INVALID_INPUT'; end if;
   until_time:=now()+make_interval(days=>(p_input->>'days')::integer);
  end if;
  if p_action='unban' then until_time:=null; end if;
  source_name:=case p_action when 'unban' then 'normal' when 'suspend' then 'suspended' when 'ban' then 'banned' else 'restricted' end;
  insert into public.account_controls(user_id,status,reason_code,reason,expires_at,updated_by) values(user_id,source_name,coalesce(p_input->>'reasonCode','manual'),p_reason,until_time,p_actor)
  on conflict on constraint account_controls_pkey do update set status=excluded.status,reason_code=excluded.reason_code,reason=excluded.reason,effective_at=now(),expires_at=excluded.expires_at,updated_by=excluded.updated_by,updated_at=now();
  after_state:=jsonb_build_object('accountStatus',source_name,'expiresAt',until_time); result:=after_state||jsonb_build_object('authProviderPropagation','not_requested');
 elsif p_resource in ('invitations','beta-applications') then
  if p_resource='beta-applications' then
   select * into application from public.beta_applications where id=p_target::uuid for update;
   if not found then raise exception 'ADMIN_NOT_FOUND'; end if;
   before_state:=jsonb_build_object('status',application.status);
   if p_action in ('shortlist','reject') then
    if application.status not in ('pending','shortlisted') then raise exception 'ADMIN_STATE_CONFLICT'; end if;
    source_name:=case when p_action='shortlist' then 'shortlisted' else 'rejected' end;
    update public.beta_applications set status=source_name,reviewed_at=now(),reviewed_by=p_actor,review_note=p_reason where id=application.id;
    after_state:=jsonb_build_object('status',source_name);
   elsif p_action='resend' then
    select * into invitation from public.invite_codes where application_id=application.id and status='active' and expires_at>now() order by created_at desc limit 1 for update;
    if not found then raise exception 'INVITE_UNAVAILABLE'; end if;
    insert into public.email_outbox(template,recipient,payload_json) values('beta_invitation',application.email_normalized,jsonb_build_object('inviteId',invitation.id,'applicationId',application.id)) returning id into object_id;
    result:=jsonb_build_object('queuedEmailId',object_id,'status','queued'); after_state:=jsonb_build_object('status',application.status);
   else
    if application.status not in ('pending','shortlisted') then raise exception 'ADMIN_STATE_CONFLICT'; end if;
   end if;
  elsif p_action<>'create' then
   select * into invitation from public.invite_codes where id=p_target::uuid for update;
   if not found then raise exception 'ADMIN_NOT_FOUND'; end if;
   before_state:=jsonb_build_object('status',invitation.status,'expiresAt',invitation.expires_at);
   if p_action='enable' and (invitation.status='revoked' or invitation.expires_at<=now() or invitation.used_count>=invitation.max_uses) then raise exception 'INVITE_UNAVAILABLE'; end if;
   if p_action='expire' then
    until_time:=(p_input->>'expiresAt')::timestamptz;
    if until_time is null or until_time<=now() or invitation.status='revoked' or invitation.used_count>=invitation.max_uses then raise exception 'INVITE_UNAVAILABLE'; end if;
    update public.invite_codes set expires_at=until_time where id=invitation.id;
   else update public.invite_codes set status=case p_action when 'disable' then 'disabled' when 'enable' then 'active' else 'revoked' end where id=invitation.id;
   end if;
   select jsonb_build_object('status',status,'expiresAt',expires_at) into after_state from public.invite_codes where id=invitation.id; result:=after_state;
  end if;
  if (p_resource='invitations' and p_action='create') or (p_resource='beta-applications' and p_action in ('approve','approve-and-email')) then
   if p_code is null or p_code !~ '^VD-[A-Za-z0-9_-]{32}$' then raise exception 'ADMIN_INVALID_INPUT'; end if;
   if p_resource='invitations' and p_target<>'new' then raise exception 'ADMIN_INVALID_INPUT'; end if;
   source_name:=case when p_resource='beta-applications' then 'personal' else coalesce(p_input->>'kind','personal') end;
   cohort_id:=application.cohort_id;
   if p_input ? 'cohort' and length(p_input->>'cohort')>0 then
    if length(p_input->>'cohort')>100 then raise exception 'ADMIN_INVALID_INPUT'; end if;
    insert into public.beta_cohorts(name) values(p_input->>'cohort') on conflict(name) do nothing;
    select id into cohort_id from public.beta_cohorts where name=p_input->>'cohort';
   end if;
   until_time:=coalesce((p_input->>'expiresAt')::timestamptz,now()+interval '30 days');
   if until_time<=now() then raise exception 'ADMIN_INVALID_INPUT'; end if;
   insert into public.invite_codes(code_hash,display_prefix,kind,cohort_id,application_id,recipient_email,max_uses,expires_at,note,created_by)
   values(encode(extensions.digest(p_code,'sha256'),'hex'),left(p_code,8),source_name,cohort_id,application.id,application.email_normalized,coalesce((p_input->>'limit')::integer,1),until_time,left(p_input->>'note',1000),p_actor) returning * into invitation;
   result:=jsonb_build_object('inviteId',invitation.id,'inviteCode',p_code,'expiresAt',until_time,'status','active');
   after_state:=jsonb_build_object('status','active','expiresAt',until_time);
   if p_resource='beta-applications' then
    source_name:=case when p_action='approve-and-email' then 'invited' else 'approved' end;
    update public.beta_applications set status=source_name,reviewed_at=now(),reviewed_by=p_actor,review_note=p_reason where id=application.id;
    after_state:=jsonb_build_object('status',source_name);
    if p_action='approve-and-email' then
     insert into public.email_outbox(template,recipient,payload_json) values('beta_invitation',application.email_normalized,jsonb_build_object('inviteId',invitation.id,'applicationId',application.id)) returning id into object_id;
     result:=result||jsonb_build_object('queuedEmailId',object_id);
    end if;
   end if;
  end if;
 elsif p_resource='email' then
  select * into mail from public.email_outbox where id=p_target::uuid for update;
  if not found then raise exception 'ADMIN_NOT_FOUND'; end if;
  before_state:=jsonb_build_object('status',mail.status);
  insert into public.email_outbox(template,recipient,payload_json) values(mail.template,mail.recipient,mail.payload_json) returning id into object_id;
  after_state:=jsonb_build_object('status','queued'); result:=jsonb_build_object('queuedEmailId',object_id,'status','queued');
 elsif p_resource='restricted-content' then
  if coalesce(length(btrim(p_input->>'caseReference')),0) not between 1 and 200 or coalesce(p_input->>'category','') not in ('support','report','security','legal','other') or coalesce(p_input->>'scope','') not in ('tasks','goals','reviews') then raise exception 'ADMIN_INVALID_INPUT'; end if;
  from_time:=(p_input->>'from')::timestamptz; until_time:=(p_input->>'until')::timestamptz;
  if from_time is null or until_time is null or from_time>=until_time or until_time-from_time>interval '31 days' then raise exception 'ADMIN_INVALID_CONTENT_RANGE'; end if;
  after_state:=jsonb_build_object('caseReference',p_input->>'caseReference','category',p_input->>'category','scope',p_input->>'scope','from',from_time,'until',until_time);
 end if;
 insert into public.admin_audit_events(actor_user_id,actor_role,action,target_type,target_id,reason,before_json,after_json,request_id,command_hash)
 values(p_actor,p_role,p_action,p_resource,p_target,btrim(p_reason),before_state,after_state,p_request,hash_value) returning * into audit;
 -- Private content is bounded and encrypted in the command receipt so an authorized retry returns the exact original result.
 if p_resource='restricted-content' then result:=public.admin_inspect(user_id,p_input->>'scope',from_time,until_time); end if;
 receipt:=jsonb_build_object('result',result,'auditEvent',jsonb_build_object('id',audit.id,'actor',audit.actor_user_id,'action',audit.action,'target',audit.target_id,'reason',audit.reason,'before',audit.before_json,'after',audit.after_json,'timestamp',audit.created_at,'requestId',audit.request_id));
 insert into public.admin_command_receipts(actor_user_id,request_id,command_hash,audit_id,receipt_cipher) values(p_actor,p_request,hash_value,audit.id,extensions.pgp_sym_encrypt(receipt::text,p_receipt_key,'cipher-algo=aes256'));
 -- SQL completes/commits before the HTTP caller receives private content. The audit is never a separate REST write.
 return receipt;
end$$;

create function public.beta_submit(p_input jsonb,p_ip_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare kind_name text; key_value text; count_value integer; application_id uuid; mail text:=lower(btrim(p_input->>'email')); window_time timestamptz:=date_trunc('hour',now());
begin
 if jsonb_typeof(p_input)<>'object' or mail is null or length(mail)>254 or mail !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(btrim(p_input->>'name')) not between 1 and 100 or length(btrim(p_input->>'useCase')) not between 1 and 2000 or p_ip_hash !~ '^[a-f0-9]{64}$' or length(p_input::text)>8000 then raise exception 'ADMIN_INVALID_INPUT'; end if;
 if exists(select 1 from jsonb_each_text(p_input) where length(value)>2000) then raise exception 'ADMIN_INVALID_INPUT'; end if;
 foreach kind_name in array array['ip','email'] loop
  key_value:=case when kind_name='ip' then p_ip_hash else encode(extensions.digest(mail,'sha256'),'hex') end;
  insert into public.beta_application_rate_buckets(kind,key_hash,window_start,count) values(kind_name,key_value,window_time,1)
  on conflict(kind,key_hash,window_start) do update set count=beta_application_rate_buckets.count+1 returning count into count_value;
  if count_value>(case when kind_name='ip' then 10 else 3 end) then raise exception 'BETA_RATE_LIMITED'; end if;
 end loop;
 insert into public.beta_applications(email_normalized,name,organization,role,use_case,why_interested,referral_source)
 values(mail,btrim(p_input->>'name'),p_input->>'organization',p_input->>'role',btrim(p_input->>'useCase'),p_input->>'whyInterested',p_input->>'source')
 on conflict(email_normalized) do nothing returning id into application_id;
 if application_id is null then select id into application_id from public.beta_applications where email_normalized=mail; end if;
 return jsonb_build_object('id',application_id);
end$$;
revoke all on function public.admin_user_dto(uuid),public.admin_read(uuid,text,text,jsonb),public.admin_inspect(uuid,text,timestamptz,timestamptz),public.admin_command(uuid,text,text,text,text,text,jsonb,uuid,text,text),public.beta_submit(jsonb,text) from public,anon,authenticated;
grant execute on function public.admin_read(uuid,text,text,jsonb),public.admin_command(uuid,text,text,text,text,text,jsonb,uuid,text,text),public.beta_submit(jsonb,text) to service_role;
commit;
