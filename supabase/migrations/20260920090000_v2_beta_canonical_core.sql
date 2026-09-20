-- Additive canonical Beta core. Legacy public.goals/public.tasks remain unchanged.
-- These tables stay inert until later repositories/feature flags enable v2 reads or writes.
-- Rollback: disable v2 paths; retain tables for reconciliation and audit.

begin;

create or replace function public.v2_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.v2_prevent_user_id_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'user_id is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.v2_set_updated_at() from public, anon, authenticated;
revoke all on function public.v2_prevent_user_id_change() from public, anon, authenticated;

create table public.v2_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_goal_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 500),
  description text,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'completed', 'abandoned', 'archived')),
  importance smallint not null check (importance between 1 and 10),
  horizon text,
  success_criteria text,
  start_after timestamptz,
  target_at timestamptz,
  provenance jsonb not null,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint v2_goals_user_id_id_key unique (user_id, id),
  constraint v2_goals_parent_not_self check (parent_goal_id is null or parent_goal_id <> id),
  constraint v2_goals_parent_owner_fk foreign key (user_id, parent_goal_id)
    references public.v2_goals(user_id, id)
);

create table public.v2_milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 500),
  description text,
  status text not null default 'planned' check (status in ('planned', 'ready', 'in_progress', 'completed', 'skipped', 'blocked', 'archived')),
  sequence integer not null check (sequence >= 0),
  target_at timestamptz,
  success_criteria text,
  completion_evidence text,
  provenance jsonb not null,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  archived_at timestamptz,
  constraint v2_milestones_user_id_id_key unique (user_id, id),
  constraint v2_milestones_user_id_id_goal_key unique (user_id, id, goal_id),
  constraint v2_milestones_goal_owner_fk foreign key (user_id, goal_id)
    references public.v2_goals(user_id, id)
);

create table public.v2_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid,
  milestone_id uuid,
  parent_task_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 1000),
  description text,
  status text not null default 'ready' check (status in ('ready', 'in_progress', 'deferred', 'done', 'cancelled', 'archived')),
  importance smallint not null check (importance between 1 and 10),
  progress smallint not null default 0 check (progress between 0 and 100),
  actionable boolean not null default true,
  deadline_at timestamptz,
  start_after timestamptz,
  estimated_minutes integer check (estimated_minutes is null or estimated_minutes > 0),
  completed_minutes integer check (completed_minutes is null or completed_minutes >= 0),
  next_action text,
  cost_minor bigint check (cost_minor is null or cost_minor >= 0),
  locked boolean not null default false,
  provenance jsonb not null,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  archived_at timestamptz,
  constraint v2_tasks_user_id_id_key unique (user_id, id),
  constraint v2_tasks_parent_not_self check (parent_task_id is null or parent_task_id <> id),
  constraint v2_tasks_milestone_requires_goal check (milestone_id is null or goal_id is not null),
  constraint v2_tasks_goal_owner_fk foreign key (user_id, goal_id)
    references public.v2_goals(user_id, id),
  constraint v2_tasks_milestone_goal_owner_fk foreign key (user_id, milestone_id, goal_id)
    references public.v2_milestones(user_id, id, goal_id),
  constraint v2_tasks_parent_owner_fk foreign key (user_id, parent_task_id)
    references public.v2_tasks(user_id, id)
);

create table public.v2_task_dependencies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  predecessor_task_id uuid not null,
  successor_task_id uuid not null,
  dependency_type text not null default 'blocks' check (dependency_type = 'blocks'),
  provenance jsonb not null,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  constraint v2_task_dependencies_no_self check (predecessor_task_id <> successor_task_id),
  constraint v2_task_dependencies_predecessor_owner_fk foreign key (user_id, predecessor_task_id)
    references public.v2_tasks(user_id, id) on delete cascade,
  constraint v2_task_dependencies_successor_owner_fk foreign key (user_id, successor_task_id)
    references public.v2_tasks(user_id, id) on delete cascade,
  constraint v2_task_dependencies_edge_key unique (user_id, predecessor_task_id, successor_task_id, dependency_type)
);

create index v2_goals_user_status_updated_idx on public.v2_goals(user_id, status, updated_at desc);
create index v2_goals_parent_idx on public.v2_goals(user_id, parent_goal_id) where parent_goal_id is not null;
create index v2_milestones_goal_sequence_idx on public.v2_milestones(user_id, goal_id, sequence, id);
create index v2_tasks_active_deadline_idx on public.v2_tasks(user_id, status, deadline_at) where status in ('ready', 'in_progress', 'deferred');
create index v2_tasks_goal_idx on public.v2_tasks(user_id, goal_id) where goal_id is not null;
create index v2_tasks_milestone_idx on public.v2_tasks(user_id, milestone_id) where milestone_id is not null;
create index v2_tasks_parent_idx on public.v2_tasks(user_id, parent_task_id) where parent_task_id is not null;
create index v2_task_dependencies_predecessor_idx on public.v2_task_dependencies(user_id, predecessor_task_id);
create index v2_task_dependencies_successor_idx on public.v2_task_dependencies(user_id, successor_task_id);

do $triggers$
declare
  target_table text;
begin
  foreach target_table in array array['v2_goals', 'v2_milestones', 'v2_tasks'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.v2_set_updated_at()', target_table || '_set_updated_at', target_table);
  end loop;
  foreach target_table in array array['v2_goals', 'v2_milestones', 'v2_tasks', 'v2_task_dependencies'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.v2_prevent_user_id_change()', target_table || '_immutable_owner', target_table);
  end loop;
end
$triggers$;

alter table public.v2_goals enable row level security;
alter table public.v2_milestones enable row level security;
alter table public.v2_tasks enable row level security;
alter table public.v2_task_dependencies enable row level security;

revoke all on table public.v2_goals, public.v2_milestones, public.v2_tasks, public.v2_task_dependencies from anon, authenticated;
grant select, insert, update, delete on table public.v2_goals, public.v2_milestones, public.v2_tasks, public.v2_task_dependencies to authenticated;
grant all on table public.v2_goals, public.v2_milestones, public.v2_tasks, public.v2_task_dependencies to service_role;

do $policies$
declare
  target_table text;
begin
  foreach target_table in array array['v2_goals', 'v2_milestones', 'v2_tasks', 'v2_task_dependencies'] loop
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', target_table || '_select_own', target_table);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', target_table || '_insert_own', target_table);
    execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', target_table || '_update_own', target_table);
    execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', target_table || '_delete_own', target_table);
  end loop;
end
$policies$;

commit;
