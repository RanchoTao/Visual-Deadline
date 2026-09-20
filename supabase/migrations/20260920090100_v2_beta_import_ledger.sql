-- Persistent report/resume foundation for PR F. This migration performs no import.
-- Authenticated users may read their own status; only trusted service/admin code writes.
-- Rollback: stop migration workers and v2 paths; retain ledger evidence in place.

begin;

create table public.v2_import_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_system text not null,
  source_schema_version text not null,
  client_request_id text,
  status text not null default 'pending' check (status in ('pending', 'running', 'report_ready', 'approved', 'applying', 'completed', 'failed', 'rolled_back')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  record_counts jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  rollback_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  attempted_at timestamptz,
  completed_at timestamptz,
  constraint v2_import_jobs_user_id_id_key unique (user_id, id),
  constraint v2_import_jobs_request_key unique (user_id, source_system, client_request_id)
);

create table public.v2_legacy_entity_refs (
  id uuid primary key default gen_random_uuid(),
  import_job_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_system text not null,
  source_schema_version text not null,
  source_domain text not null,
  source_entity_type text not null,
  source_legacy_id text not null,
  canonical_target_type text check (canonical_target_type is null or canonical_target_type in ('goal', 'milestone', 'task', 'task_dependency')),
  canonical_target_id uuid,
  source_checksum text not null,
  target_checksum text,
  status text not null default 'pending' check (status in ('pending', 'mapped', 'migrated', 'quarantined', 'failed', 'rolled_back')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  warnings jsonb not null default '[]'::jsonb,
  error_detail jsonb not null default '{}'::jsonb,
  unresolved_references jsonb not null default '[]'::jsonb,
  quarantine_metadata jsonb not null default '{}'::jsonb,
  rollback_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  attempted_at timestamptz,
  completed_at timestamptz,
  constraint v2_legacy_entity_refs_job_owner_fk foreign key (user_id, import_job_id)
    references public.v2_import_jobs(user_id, id) on delete cascade,
  constraint v2_legacy_entity_refs_source_key unique (user_id, source_system, source_domain, source_entity_type, source_legacy_id),
  constraint v2_legacy_entity_refs_target_pair check (
    (canonical_target_type is null and canonical_target_id is null)
    or (canonical_target_type is not null and canonical_target_id is not null)
  )
);

create index v2_import_jobs_user_status_updated_idx on public.v2_import_jobs(user_id, status, updated_at desc);
create index v2_legacy_entity_refs_job_status_idx on public.v2_legacy_entity_refs(user_id, import_job_id, status);
create index v2_legacy_entity_refs_target_idx on public.v2_legacy_entity_refs(user_id, canonical_target_type, canonical_target_id) where canonical_target_id is not null;

create trigger v2_import_jobs_set_updated_at
before update on public.v2_import_jobs
for each row execute function public.v2_set_updated_at();

create trigger v2_legacy_entity_refs_set_updated_at
before update on public.v2_legacy_entity_refs
for each row execute function public.v2_set_updated_at();

create trigger v2_import_jobs_immutable_owner
before update on public.v2_import_jobs
for each row execute function public.v2_prevent_user_id_change();

create trigger v2_legacy_entity_refs_immutable_owner
before update on public.v2_legacy_entity_refs
for each row execute function public.v2_prevent_user_id_change();

alter table public.v2_import_jobs enable row level security;
alter table public.v2_legacy_entity_refs enable row level security;

revoke all on table public.v2_import_jobs, public.v2_legacy_entity_refs from anon, authenticated;
grant select on table public.v2_import_jobs, public.v2_legacy_entity_refs to authenticated;
grant all on table public.v2_import_jobs, public.v2_legacy_entity_refs to service_role;

create policy v2_import_jobs_select_own
on public.v2_import_jobs for select
to authenticated
using ((select auth.uid()) = user_id);

create policy v2_legacy_entity_refs_select_own
on public.v2_legacy_entity_refs for select
to authenticated
using ((select auth.uid()) = user_id);

commit;
