-- Visual Deadline Closed Beta platform contracts.
-- This migration is additive. Existing Auth, Billing v1, and recurring billing data remain unchanged.

begin;

create table public.beta_cohorts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  name text not null,
  source text not null,
  description text,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.beta_applications (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  email_hash text not null check (email_hash ~ '^[a-f0-9]{64}$'),
  name text not null,
  organization text,
  role text not null,
  use_case text not null,
  why_interested text,
  referral_source text,
  status text not null default 'pending' check (status in ('pending', 'shortlisted', 'approved', 'rejected', 'invited', 'registered', 'expired')),
  review_note text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index beta_applications_open_email_key on public.beta_applications(email_hash)
  where status in ('pending', 'shortlisted', 'approved', 'invited');

create table public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique check (code_hash ~ '^[a-f0-9]{64}$'),
  display_prefix text,
  cohort_id uuid references public.beta_cohorts(id) on delete restrict,
  max_uses integer not null default 1 check (max_uses > 0),
  used_count integer not null default 0 check (used_count >= 0 and used_count <= max_uses),
  enabled boolean not null default true,
  expires_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  note text
);

create table public.invite_redemptions (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.invite_codes(id) on delete restrict,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email_hash text not null check (email_hash ~ '^[a-f0-9]{64}$'),
  cohort_id uuid references public.beta_cohorts(id) on delete restrict,
  redeemed_at timestamptz not null default now(),
  constraint invite_redemptions_invite_user_key unique (invite_id, user_id)
);

create table public.admin_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'support', 'analyst', 'reviewer')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text not null,
  reason text,
  before_json jsonb,
  after_json jsonb,
  request_id uuid not null,
  ip_hash text,
  created_at timestamptz not null default now()
);

create table public.admin_access_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  capability text not null check (capability = 'vd.plus'),
  valid_from timestamptz not null,
  valid_until timestamptz,
  grant_type text not null check (grant_type in ('beta', 'compensation', 'promotion', 'manual', 'testing')),
  reason text not null,
  note text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete restrict,
  revoke_reason text,
  constraint admin_access_grants_period_check check (valid_until is null or valid_until > valid_from)
);

create table public.ai_quota_policies (
  id uuid primary key default gen_random_uuid(),
  tier text not null unique check (tier in ('free', 'plus', 'pro')),
  requests_per_period integer not null check (requests_per_period >= 0),
  period_interval interval not null default interval '1 month' check (period_interval > interval '0'),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.ai_quota_policies (tier, requests_per_period) values ('free', 20), ('plus', 200), ('pro', 500)
on conflict (tier) do nothing;

create table public.ai_quota_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer check (amount is null or amount >= 0),
  unlimited boolean not null default false,
  valid_from timestamptz not null,
  valid_until timestamptz,
  reason text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  constraint ai_quota_grants_period_check check (valid_until is null or valid_until > valid_from),
  constraint ai_quota_grants_amount_required_check check (unlimited or amount is not null)
);

create table public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  provider text not null,
  model text not null,
  feature text not null check (feature in ('task_intake', 'review', 'goal_roadmap', 'task_analysis', 'capture_interpret', 'daily_plan', 'pressure_analysis', 'goal_decompose')),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  cached_input_tokens integer not null default 0 check (cached_input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  total_tokens integer not null default 0 check (total_tokens >= 0),
  estimated_cost_minor bigint not null default 0 check (estimated_cost_minor >= 0),
  currency text not null default 'CNY' check (currency ~ '^[A-Z]{3}$'),
  latency_ms integer,
  status text not null check (status in ('succeeded', 'failed', 'rejected')),
  error_code text,
  created_at timestamptz not null default now(),
  constraint ai_usage_events_request_key unique (user_id, request_id)
);

create table public.account_controls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('active', 'restricted', 'suspended', 'banned')),
  reason_code text check (reason_code in ('spam', 'bot', 'payment_abuse', 'harassment', 'illegal_content', 'security', 'terms_violation', 'manual')),
  reason text,
  note text,
  effective_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint account_controls_period_check check (expires_at is null or expires_at > effective_at)
);

create unique index account_controls_current_key on public.account_controls(user_id) where expires_at is null;

create table public.moderation_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_type text not null check (case_type in ('user_report', 'support_request', 'security', 'terms', 'legal')),
  status text not null default 'open' check (status in ('open', 'investigating', 'resolved', 'closed')),
  reason text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  assigned_to uuid references auth.users(id) on delete set null
);

create table public.user_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  type text not null check (type in ('bug', 'feedback', 'feature_request', 'report')),
  message text not null check (char_length(message) between 1 and 10000),
  route text,
  app_version text,
  viewport jsonb,
  metadata jsonb,
  created_at timestamptz not null default now(),
  status text not null default 'new' check (status in ('new', 'triaged', 'closed'))
);

create table public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  scope_type text not null check (scope_type in ('global', 'cohort', 'user')),
  scope_id text,
  enabled boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feature_flags_scope_key unique nulls not distinct (key, scope_type, scope_id)
);

create table public.email_events (
  id uuid primary key default gen_random_uuid(),
  recipient_hash text not null check (recipient_hash ~ '^[a-f0-9]{64}$'),
  template text not null,
  provider text not null,
  provider_message_id text,
  status text not null,
  related_entity_type text,
  related_entity_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_usage_events drop constraint ai_usage_events_status_check;
alter table public.ai_usage_events add constraint ai_usage_events_status_check check (status in ('processing', 'succeeded', 'failed', 'rejected'));

alter table public.profiles add column if not exists signup_cohort_id uuid references public.beta_cohorts(id) on delete restrict;
alter table public.profiles add column if not exists signup_source text;

create index invite_codes_validation_idx on public.invite_codes(code_hash) where enabled;
create index invite_redemptions_invite_idx on public.invite_redemptions(invite_id, redeemed_at desc);
create index ai_usage_events_user_created_idx on public.ai_usage_events(user_id, created_at desc);
create index account_controls_active_idx on public.account_controls(user_id, effective_at desc);
create index user_feedback_user_created_idx on public.user_feedback(user_id, created_at desc);
create index admin_audit_log_target_idx on public.admin_audit_log(target_type, target_id, created_at desc);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'beta_applications', 'invite_codes', 'ai_quota_policies', 'account_controls', 'feature_flags', 'email_events'
  ] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_visual_deadline_updated_at()', table_name || '_set_updated_at', table_name);
  end loop;
end $$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'beta_cohorts', 'beta_applications', 'invite_codes', 'invite_redemptions', 'admin_roles', 'admin_audit_log',
    'admin_access_grants', 'ai_quota_policies', 'ai_quota_grants', 'ai_usage_events', 'account_controls',
    'moderation_cases', 'user_feedback', 'feature_flags', 'email_events'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
  end loop;
end $$;

-- Public application, feedback, and all privileged operations traverse server endpoints.
-- Browser roles receive no direct access to the operational tables above.
grant select on table public.account_controls, public.ai_usage_events to authenticated;
create policy account_controls_select_own on public.account_controls for select to authenticated using ((select auth.uid()) = user_id);
create policy ai_usage_events_select_own on public.ai_usage_events for select to authenticated using ((select auth.uid()) = user_id);

-- Server-role only RPC: atomically validates an invite and records a successful redemption.
create function public.redeem_beta_invite(p_code_hash text, p_user_id uuid, p_email_hash text, p_signup_source text default 'invite')
returns table (invite_id uuid, cohort_id uuid)
language plpgsql security definer set search_path = public
as $$
declare invite_row public.invite_codes%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext('invite:' || p_code_hash));
  select * into invite_row from public.invite_codes where code_hash = p_code_hash for update;
  if not found then raise exception 'INVITE_INVALID'; end if;
  if not invite_row.enabled then raise exception 'INVITE_DISABLED'; end if;
  if invite_row.expires_at is not null and invite_row.expires_at <= now() then raise exception 'INVITE_EXPIRED'; end if;
  if invite_row.used_count >= invite_row.max_uses then raise exception 'INVITE_EXHAUSTED'; end if;
  if exists (select 1 from public.invite_redemptions where user_id = p_user_id) then raise exception 'INVITE_ALREADY_REDEEMED'; end if;
  update public.invite_codes set used_count = used_count + 1, updated_at = now() where id = invite_row.id;
  insert into public.invite_redemptions (invite_id, user_id, email_hash, cohort_id) values (invite_row.id, p_user_id, p_email_hash, invite_row.cohort_id);
  insert into public.profiles (id, user_id, email) values (p_user_id, p_user_id, null) on conflict (id) do nothing;
  update public.profiles set signup_cohort_id = coalesce(signup_cohort_id, invite_row.cohort_id), signup_source = coalesce(signup_source, p_signup_source), updated_at = now() where id = p_user_id;
  return query select invite_row.id, invite_row.cohort_id;
end;
$$;
revoke all on function public.redeem_beta_invite(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.redeem_beta_invite(text, uuid, text, text) to service_role;

create function public.consume_ai_quota(p_user_id uuid, p_request_id uuid, p_provider text, p_model text, p_feature text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare tier_name text := 'free'; policy_limit integer := 0; grant_extra integer := 0; already_consumed boolean := false;
begin
  perform pg_advisory_xact_lock(hashtext('ai-quota:' || p_user_id::text));
  select true into already_consumed from public.ai_usage_events where user_id = p_user_id and request_id = p_request_id;
  if already_consumed then return true; end if;
  if exists (select 1 from public.entitlements where user_id = p_user_id and capability = 'vd.plus' and status = 'active' and valid_from <= now() and (valid_until is null or valid_until > now())) then tier_name := 'plus'; end if;
  select requests_per_period into policy_limit from public.ai_quota_policies where tier = tier_name and enabled;
  select coalesce(sum(amount), 0) into grant_extra from public.ai_quota_grants where user_id = p_user_id and revoked_at is null and valid_from <= now() and (valid_until is null or valid_until > now());
  if exists (select 1 from public.ai_quota_grants where user_id = p_user_id and unlimited and revoked_at is null and valid_from <= now() and (valid_until is null or valid_until > now())) then
    insert into public.ai_usage_events (user_id, request_id, provider, model, feature, status) values (p_user_id, p_request_id, p_provider, p_model, p_feature, 'processing'); return true;
  end if;
  if (select count(*) from public.ai_usage_events where user_id = p_user_id and created_at >= date_trunc('month', now()) and status in ('processing', 'succeeded')) >= coalesce(policy_limit, 0) + grant_extra then
    insert into public.ai_usage_events (user_id, request_id, provider, model, feature, status, error_code) values (p_user_id, p_request_id, p_provider, p_model, p_feature, 'rejected', 'AI_QUOTA_EXHAUSTED'); return false;
  end if;
  insert into public.ai_usage_events (user_id, request_id, provider, model, feature, status) values (p_user_id, p_request_id, p_provider, p_model, p_feature, 'processing'); return true;
end;
$$;
revoke all on function public.consume_ai_quota(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.consume_ai_quota(uuid, uuid, text, text, text) to service_role;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'beta_cohorts', 'beta_applications', 'invite_codes', 'invite_redemptions', 'admin_roles', 'admin_audit_log',
    'admin_access_grants', 'ai_quota_policies', 'ai_quota_grants', 'ai_usage_events', 'account_controls',
    'moderation_cases', 'user_feedback', 'feature_flags', 'email_events'
  ] loop
    execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
  end loop;
end $$;

commit;
