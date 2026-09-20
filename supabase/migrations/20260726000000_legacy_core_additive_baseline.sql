-- Reconstructed additive baseline for the legacy cloud-sync tables.
-- The original definitions existed only in root supabase-schema.sql, whose DROP/recreate
-- workflow is not a deployable migration. Existing tables and rows are left untouched.
-- Rollback: keep these legacy tables active; this migration introduces no v2 runtime path.

begin;

create or replace function public.set_visual_deadline_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  avatar_storage_path text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_id_user_id_match check (id = user_id)
);

create table if not exists public.tasks (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.goals (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pressure_logs (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_user_id_idx on public.tasks(user_id);
create index if not exists goals_user_id_idx on public.goals(user_id);
create index if not exists pressure_logs_user_id_idx on public.pressure_logs(user_id);

do $baseline$
declare
  target_table text;
begin
  foreach target_table in array array['profiles', 'tasks', 'goals', 'pressure_logs'] loop
    if not exists (
      select 1 from pg_trigger
      where tgrelid = to_regclass(format('public.%I', target_table))
        and tgname = target_table || '_set_updated_at'
        and not tgisinternal
    ) then
      execute format(
        'create trigger %I before update on public.%I for each row execute function public.set_visual_deadline_updated_at()',
        target_table || '_set_updated_at',
        target_table
      );
    end if;
  end loop;
end
$baseline$;

alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.goals enable row level security;
alter table public.pressure_logs enable row level security;

revoke all on table public.profiles, public.tasks, public.goals, public.pressure_logs from anon, authenticated;
grant select, insert, update, delete on table public.profiles, public.tasks, public.goals, public.pressure_logs to authenticated;

do $policies$
declare
  target_table text;
  operation text;
  policy_name text;
  ownership_expression text;
begin
  foreach target_table in array array['profiles', 'tasks', 'goals', 'pressure_logs'] loop
    ownership_expression := case
      when target_table = 'profiles' then '(select auth.uid()) = id and (select auth.uid()) = user_id'
      else '(select auth.uid()) = user_id'
    end;
    foreach operation in array array['select', 'insert', 'update', 'delete'] loop
      policy_name := target_table || '_' || operation || '_own';
      if not exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = target_table and policyname = policy_name
      ) then
        if operation = 'insert' then
          execute format('create policy %I on public.%I for insert to authenticated with check (%s)', policy_name, target_table, ownership_expression);
        elsif operation = 'update' then
          execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)', policy_name, target_table, ownership_expression, ownership_expression);
        else
          execute format('create policy %I on public.%I for %s to authenticated using (%s)', policy_name, target_table, operation, ownership_expression);
        end if;
      end if;
    end loop;
  end loop;
end
$policies$;

commit;
