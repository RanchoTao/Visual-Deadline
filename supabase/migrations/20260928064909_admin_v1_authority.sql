-- Additive operator authority. No provider side effects or rollout enabling.
begin;
create extension if not exists pgcrypto with schema extensions;
alter table public.entitlements drop constraint entitlements_capability_check;
alter table public.entitlements add constraint entitlements_capability_check check (capability in ('vd.plus','vd.pro'));
alter table public.entitlements drop constraint entitlements_source_type_check;
alter table public.entitlements add constraint entitlements_source_type_check check (source_type in ('subscription','legacy_membership_grant','legacy_membership','admin_grant','operator_grant'));

create table public.admin_operator_roles (
 user_id uuid primary key references auth.users(id), role text not null check(role in ('owner','admin','support','analyst','reviewer')),
 status text not null default 'active' check(status in ('active','revoked')), created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), created_by uuid not null references auth.users(id)
);
create table public.admin_audit_events (
 id uuid primary key default gen_random_uuid(), actor_user_id uuid not null references auth.users(id), actor_role text not null,
 action text not null, target_type text not null, target_id text not null, reason text not null check(char_length(reason) between 8 and 1000),
 before_json jsonb not null, after_json jsonb not null, request_id uuid not null,
 command_hash text not null check(command_hash ~ '^[a-f0-9]{64}$'), created_at timestamptz not null default now(), unique(actor_user_id,request_id)
);
create table public.admin_command_receipts (
 actor_user_id uuid not null references auth.users(id), request_id uuid not null, command_hash text not null,
 audit_id uuid not null references public.admin_audit_events(id), receipt_cipher bytea not null, created_at timestamptz not null default now(),
 primary key(actor_user_id,request_id)
);
create table public.admin_access_grants (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 tier text not null check(tier in ('plus','pro')), source text not null check(source in ('beta_gift','admin_grant','admin_compensation','promotion','testing')),
 valid_from timestamptz not null default now(), valid_until timestamptz, status text not null default 'active' check(status in ('active','revoked','expired')),
 reason text not null, note text, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 revoked_by uuid references auth.users(id), revoked_at timestamptz, revoke_reason text,
 check(valid_until is null or valid_until>valid_from), check(valid_until is not null or source='testing')
);
create table public.ai_quota_policies (
 tier text primary key check(tier in ('free','plus','pro')), daily_units integer not null check(daily_units>=0),
 enabled boolean not null default true, version text not null default 'beta-daily-v1'
);
insert into public.ai_quota_policies(tier,daily_units) values ('free',20),('plus',200),('pro',500);
create table public.ai_quota_overrides (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 kind text not null check(kind in ('delta','limit','unlimited')), amount integer check(amount>=0),
 valid_from timestamptz not null default now(), valid_until timestamptz, reason text not null,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), revoked_at timestamptz,
 check(valid_until is null or valid_until>valid_from), check((kind='unlimited' and amount is null) or (kind<>'unlimited' and amount is not null))
);
create table public.ai_usage_ledger (
 request_id uuid primary key, user_id uuid not null references auth.users(id), mode text not null, provider text not null, model text not null,
 input_tokens bigint check(input_tokens>=0), output_tokens bigint check(output_tokens>=0), cached_tokens bigint check(cached_tokens>=0),
 quota_units integer not null default 1 check(quota_units>0), estimated_cost_minor bigint check(estimated_cost_minor>=0), currency text,
 status text not null default 'reserved' check(status in ('reserved','succeeded','failed','cancelled','released')),
 latency_ms integer check(latency_ms>=0), created_at timestamptz not null default now(), settled_at timestamptz,
 expires_at timestamptz not null default now()+interval '2 minutes', error_code text
);
create index ai_usage_user_period on public.ai_usage_ledger(user_id,created_at);
create table public.ai_quota_resets (
 user_id uuid not null references auth.users(id), period_start timestamptz not null, reset_at timestamptz not null,
 request_id uuid not null, primary key(user_id,period_start)
);
create table public.account_controls (
 user_id uuid primary key references auth.users(id), status text not null check(status in ('normal','restricted','suspended','banned')),
 reason_code text not null, reason text not null, effective_at timestamptz not null default now(), expires_at timestamptz,
 updated_by uuid not null references auth.users(id), updated_at timestamptz not null default now(),
 check(expires_at is null or expires_at>effective_at)
);
create table public.beta_cohorts (
 id uuid primary key default gen_random_uuid(), name text not null unique, created_at timestamptz not null default now()
);
create table public.beta_applications (
 id uuid primary key default gen_random_uuid(), email_normalized text not null unique check(email_normalized=lower(btrim(email_normalized))),
 name text not null check(char_length(name) between 1 and 100), organization text, role text, use_case text not null,
 why_interested text, referral_source text, cohort_id uuid references public.beta_cohorts(id),
 status text not null default 'pending' check(status in ('pending','shortlisted','approved','rejected','invited','registered','expired')),
 submitted_at timestamptz not null default now(), reviewed_at timestamptz, reviewed_by uuid references auth.users(id), review_note text
);
create table public.invite_codes (
 id uuid primary key default gen_random_uuid(), code_hash text not null unique check(code_hash ~ '^[a-f0-9]{64}$'), display_prefix text not null,
 kind text not null check(kind in ('personal','group','operations')), cohort_id uuid references public.beta_cohorts(id),
 application_id uuid references public.beta_applications(id), recipient_email text,
 max_uses integer not null check(max_uses between 1 and 10000), used_count integer not null default 0 check(used_count>=0 and used_count<=max_uses),
 status text not null default 'active' check(status in ('active','disabled','revoked','expired')), expires_at timestamptz not null,
 note text, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 check(kind<>'personal' or max_uses=1)
);
create table public.invite_redemptions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), invite_id uuid not null references public.invite_codes(id),
 redeemed_at timestamptz not null default now(), source text not null, cohort_id uuid references public.beta_cohorts(id), unique(user_id,invite_id)
);
create table public.beta_allow_grants (
 user_id uuid primary key references auth.users(id), valid_until timestamptz, revoked_at timestamptz,
 reason text not null, created_by uuid not null references auth.users(id)
);
create table public.email_outbox (
 id uuid primary key default gen_random_uuid(), template text not null check(template in ('beta_invitation','beta_approval','beta_rejection')),
 recipient text not null, payload_json jsonb not null check(jsonb_typeof(payload_json)='object' and (payload_json - 'inviteId' - 'applicationId')='{}'::jsonb),
 status text not null default 'queued' check(status in ('queued','sending','sent','delivered','bounced','complained','failed')),
 provider_message_id text, attempts integer not null default 0, last_error_code text, created_at timestamptz not null default now(), sent_at timestamptz, delivered_at timestamptz
);
create table public.beta_application_rate_buckets (
 kind text not null check(kind in ('ip','email')), key_hash text not null, window_start timestamptz not null, count integer not null check(count>0),
 primary key(kind,key_hash,window_start)
);
create index admin_grants_user_period on public.admin_access_grants(user_id,valid_from,valid_until);
create index ai_overrides_user_period on public.ai_quota_overrides(user_id,created_at desc);
create index invite_application on public.invite_codes(application_id,created_at desc);
create index admin_audit_target on public.admin_audit_events(target_type,target_id,created_at desc);

create function public.admin_immutable() returns trigger language plpgsql set search_path='' as $$begin raise exception 'ADMIN_APPEND_ONLY' using errcode='42501'; end$$;
create trigger admin_audit_immutable before update or delete on public.admin_audit_events for each row execute function public.admin_immutable();
create trigger admin_receipt_immutable before update or delete on public.admin_command_receipts for each row execute function public.admin_immutable();

create function public.admin_assert_operator(p_actor uuid,p_role text,p_resource text,p_action text default null)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.admin_operator_roles where user_id=p_actor and role=p_role and status='active' for share;
 if not found then raise exception 'ADMIN_FORBIDDEN' using errcode='42501'; end if;
 if p_resource is null or p_resource not in ('dashboard','users','beta-applications','invitations','entitlements','quotas','bans','audit','feedback','ai-usage','email','analytics','infrastructure','deployments','settings','restricted-content') then raise exception 'ADMIN_INVALID_RESOURCE'; end if;
 if p_action is null then
  if p_resource='restricted-content' then raise exception 'ADMIN_FORBIDDEN' using errcode='42501'; end if;
  if p_role='owner' or (p_role='admin' and p_resource in ('users','invitations','entitlements','quotas','bans')) or (p_role='support' and p_resource in ('users','feedback')) or (p_role='analyst' and p_resource in ('dashboard','analytics','ai-usage')) or (p_role='reviewer' and p_resource='beta-applications') then return; end if;
 else
  if not ((p_resource='beta-applications' and p_action in ('approve','approve-and-email','reject','shortlist','resend')) or (p_resource='invitations' and p_action in ('create','disable','enable','revoke','expire')) or (p_resource='entitlements' and p_action in ('grant','revoke')) or (p_resource='quotas' and p_action in ('adjust','reset')) or (p_resource='bans' and p_action in ('restrict','suspend','ban','unban')) or (p_resource='email' and p_action='resend') or (p_resource='restricted-content' and p_action='inspect')) then raise exception 'ADMIN_FORBIDDEN' using errcode='42501'; end if;
  if p_role='owner' or (p_role='admin' and p_resource in ('invitations','entitlements','quotas','bans')) or (p_role='reviewer' and p_resource='beta-applications') then return; end if;
 end if;
 raise exception 'ADMIN_FORBIDDEN' using errcode='42501';
end$$;

create function public.admin_project_grant() returns trigger language plpgsql security definer set search_path='' as $$
declare cap text;
begin
 perform pg_advisory_xact_lock(hashtext('entitlement:'||new.user_id::text));
 foreach cap in array case when new.tier='pro' then array['vd.plus','vd.pro'] else array['vd.plus'] end loop
  insert into public.entitlements(user_id,capability,source_type,source_id,status,valid_from,valid_until,reason)
  values(new.user_id,cap,'operator_grant',new.id::text,new.status,new.valid_from,new.valid_until,new.source)
  on conflict(user_id,capability,source_type,source_id) do update set status=excluded.status,valid_from=excluded.valid_from,valid_until=excluded.valid_until,reason=excluded.reason,updated_at=now();
 end loop;
 return new;
end$$;
create trigger admin_grant_project after insert or update on public.admin_access_grants for each row execute function public.admin_project_grant();

create function public.admin_effective_tier(p_user uuid) returns text language sql stable security definer set search_path='' as $$
 select case when exists(select 1 from public.entitlements where user_id=p_user and capability='vd.pro' and status='active' and valid_from<=now() and (valid_until is null or valid_until>now())) then 'pro'
 when exists(select 1 from public.entitlements where user_id=p_user and capability='vd.plus' and status='active' and valid_from<=now() and (valid_until is null or valid_until>now())) then 'plus' else 'free' end
$$;
create function public.admin_account_status(p_user uuid) returns text language sql stable security definer set search_path='' as $$
 select coalesce((select status from public.account_controls where user_id=p_user and effective_at<=now() and (expires_at is null or expires_at>now())),'normal')
$$;
create function public.admin_may_operate() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and public.admin_account_status(auth.uid())='normal'
$$;
create function public.account_bootstrap() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('accountStatus',public.admin_account_status(auth.uid()),'effectiveTier',public.admin_effective_tier(auth.uid())) where auth.uid() is not null
$$;

create function public.admin_quota_snapshot(p_user uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tier_name text:=public.admin_effective_tier(p_user); base_limit integer; lim integer; used_units integer; period timestamptz:=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'; reset_time timestamptz;
begin
 select daily_units into base_limit from public.ai_quota_policies where tier=tier_name and enabled;
 if base_limit is null then raise exception 'AI_POLICY_UNAVAILABLE'; end if;
 select amount into lim from public.ai_quota_overrides where user_id=p_user and kind='limit' and revoked_at is null and valid_from<=now() and (valid_until is null or valid_until>now()) order by created_at desc,id desc limit 1;
 lim:=coalesce(lim,base_limit)+(select coalesce(sum(amount),0)::integer from public.ai_quota_overrides where user_id=p_user and kind='delta' and revoked_at is null and valid_from<=now() and (valid_until is null or valid_until>now()));
 select reset_at into reset_time from public.ai_quota_resets where user_id=p_user and period_start=period;
 select coalesce(sum(quota_units),0)::integer into used_units from public.ai_usage_ledger where user_id=p_user and created_at>=period and ((status='succeeded' and coalesce(settled_at,created_at)>=coalesce(reset_time,period)) or (status='reserved' and expires_at>now()));
 if exists(select 1 from public.ai_quota_overrides where user_id=p_user and kind='unlimited' and revoked_at is null and valid_from<=now() and (valid_until is null or valid_until>now())) then lim:=null; end if;
 return jsonb_build_object('policy',tier_name||':beta-daily-v1','limit',lim,'used',used_units,'remaining',case when lim is null then null else greatest(0,lim-used_units) end,'resetAt',period+interval '1 day');
end$$;
create function public.ai_reserve(p_user uuid,p_request uuid,p_mode text,p_provider text,p_model text) returns jsonb language plpgsql security definer set search_path='' as $$
declare snap jsonb;
begin
 perform pg_advisory_xact_lock(hashtext('admin-user:'||p_user::text));
 if public.admin_account_status(p_user)<>'normal' then raise exception 'ACCOUNT_BLOCKED' using errcode='42501'; end if;
 if exists(select 1 from public.ai_usage_ledger where request_id=p_request) then raise exception 'AI_REQUEST_REPLAY' using errcode='23505'; end if;
 update public.ai_usage_ledger set status='released',settled_at=now(),error_code='RESERVATION_EXPIRED' where user_id=p_user and status='reserved' and expires_at<=now();
 snap:=public.admin_quota_snapshot(p_user);
 if snap->>'remaining' is not null and (snap->>'remaining')::integer<1 then raise exception 'AI_QUOTA_EXHAUSTED'; end if;
 insert into public.ai_usage_ledger(request_id,user_id,mode,provider,model) values(p_request,p_user,p_mode,p_provider,p_model);
 return public.admin_quota_snapshot(p_user);
end$$;
create function public.ai_settle(p_user uuid,p_request uuid,p_status text,p_usage jsonb) returns void language plpgsql security definer set search_path='' as $$
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
 latency_ms=(p_usage->>'latencyMs')::integer,error_code=left(p_usage->>'errorCode',100),estimated_cost_minor=(p_usage->>'estimatedCostMinor')::bigint,currency=left(p_usage->>'currency',3) where request_id=p_request;
end$$;

create function public.has_beta_access(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.invite_redemptions where user_id=p_user)
 or exists(select 1 from public.beta_allow_grants where user_id=p_user and revoked_at is null and (valid_until is null or valid_until>now()))
 or exists(select 1 from public.admin_operator_roles where user_id=p_user and status='active' and role='owner')
 or exists(select 1 from public.admin_access_grants where user_id=p_user and source='testing' and status='active' and valid_from<=now() and (valid_until is null or valid_until>now()))
$$;
create function public.beta_redeem(p_user uuid,p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare inv public.invite_codes%rowtype; uid uuid; mail text;
begin
 perform pg_advisory_xact_lock(hashtext('admin-user:'||p_user::text));
 if public.admin_account_status(p_user)<>'normal' then raise exception 'ACCOUNT_BLOCKED' using errcode='42501'; end if;
 select * into inv from public.invite_codes where code_hash=p_hash for update;
 if not found then raise exception 'INVITE_INVALID'; end if;
 if exists(select 1 from public.invite_redemptions where user_id=p_user and invite_id=inv.id) then return jsonb_build_object('inviteId',inv.id,'cohort',inv.cohort_id,'source',inv.kind); end if;
 if inv.status<>'active' or inv.expires_at<=now() or inv.used_count>=inv.max_uses then raise exception 'INVITE_UNAVAILABLE'; end if;
 select lower(email) into mail from auth.users where id=p_user;
 if inv.recipient_email is not null and mail is distinct from inv.recipient_email then raise exception 'INVITE_OWNER_MISMATCH' using errcode='42501'; end if;
 insert into public.invite_redemptions(user_id,invite_id,source,cohort_id) values(p_user,inv.id,inv.kind,inv.cohort_id);
 update public.invite_codes set used_count=used_count+1 where id=inv.id;
 if inv.application_id is not null then update public.beta_applications set status='registered' where id=inv.application_id; end if;
 return jsonb_build_object('inviteId',inv.id,'cohort',inv.cohort_id,'source',inv.kind);
end$$;

-- Restrictive predicates supplement, never replace, existing ownership policies.
do $$declare t text; begin
 foreach t in array array['profiles','tasks','goals','pressure_logs','intake_messages','intake_assets','task_drafts','notifications','roadmaps','roadmap_nodes','roadmap_edges','life_events','v2_goals','v2_milestones','v2_tasks','v2_task_dependencies','v2_import_jobs','v2_legacy_entity_refs','review_records','review_events','review_archive_events','review_tombstones'] loop
  execute format('create policy admin_account_insert on public.%I as restrictive for insert to authenticated with check ((select public.admin_may_operate()))',t);
  execute format('create policy admin_account_update on public.%I as restrictive for update to authenticated using ((select public.admin_may_operate())) with check ((select public.admin_may_operate()))',t);
  execute format('create policy admin_account_delete on public.%I as restrictive for delete to authenticated using ((select public.admin_may_operate()))',t);
 end loop;
end$$;
create policy admin_account_storage_insert on storage.objects as restrictive for insert to authenticated with check ((select public.admin_may_operate()));
create policy admin_account_storage_update on storage.objects as restrictive for update to authenticated using ((select public.admin_may_operate())) with check ((select public.admin_may_operate()));
create policy admin_account_storage_delete on storage.objects as restrictive for delete to authenticated using ((select public.admin_may_operate()));

do $$declare t text; begin
 foreach t in array array['admin_operator_roles','admin_audit_events','admin_command_receipts','admin_access_grants','ai_quota_policies','ai_quota_overrides','ai_usage_ledger','ai_quota_resets','account_controls','beta_cohorts','beta_applications','invite_codes','invite_redemptions','beta_allow_grants','email_outbox','beta_application_rate_buckets'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 end loop;
end$$;
revoke all on function public.admin_immutable(),public.admin_project_grant(),public.admin_assert_operator(uuid,text,text,text),public.admin_effective_tier(uuid),public.admin_account_status(uuid),public.admin_may_operate(),public.account_bootstrap(),public.admin_quota_snapshot(uuid),public.ai_reserve(uuid,uuid,text,text,text),public.ai_settle(uuid,uuid,text,jsonb),public.has_beta_access(uuid),public.beta_redeem(uuid,text) from public,anon,authenticated;
grant execute on function public.admin_assert_operator(uuid,text,text,text),public.admin_account_status(uuid),public.admin_quota_snapshot(uuid),public.ai_reserve(uuid,uuid,text,text,text),public.ai_settle(uuid,uuid,text,jsonb),public.has_beta_access(uuid),public.beta_redeem(uuid,text) to service_role;
grant execute on function public.admin_may_operate(),public.account_bootstrap() to authenticated;
commit;
