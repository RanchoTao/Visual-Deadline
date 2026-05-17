-- Visual Deadline clean Supabase cloud-sync schema
-- Run this whole file in the Supabase SQL Editor for the project used by VITE_SUPABASE_URL.
-- It intentionally drops and recreates only the Visual Deadline app tables below.

begin;

drop table if exists public.pressure_logs cascade;
drop table if exists public.goals cascade;
drop table if exists public.tasks cascade;
drop table if exists public.profiles cascade;

drop function if exists public.set_visual_deadline_updated_at() cascade;

create function public.set_visual_deadline_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text,
  display_name text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_id_user_id_match check (id = user_id)
);

create table public.tasks (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.goals (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pressure_logs (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_user_id_idx on public.tasks(user_id);
create index goals_user_id_idx on public.goals(user_id);
create index pressure_logs_user_id_idx on public.pressure_logs(user_id);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_visual_deadline_updated_at();

create trigger tasks_set_updated_at
before update on public.tasks
for each row execute function public.set_visual_deadline_updated_at();

create trigger goals_set_updated_at
before update on public.goals
for each row execute function public.set_visual_deadline_updated_at();

create trigger pressure_logs_set_updated_at
before update on public.pressure_logs
for each row execute function public.set_visual_deadline_updated_at();

alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.goals enable row level security;
alter table public.pressure_logs enable row level security;

create policy profiles_select_own
on public.profiles
for select
to authenticated
using (auth.uid() = id and auth.uid() = user_id);

create policy profiles_insert_own
on public.profiles
for insert
to authenticated
with check (auth.uid() = id and auth.uid() = user_id);

create policy profiles_update_own
on public.profiles
for update
to authenticated
using (auth.uid() = id and auth.uid() = user_id)
with check (auth.uid() = id and auth.uid() = user_id);

create policy profiles_delete_own
on public.profiles
for delete
to authenticated
using (auth.uid() = id and auth.uid() = user_id);

create policy tasks_select_own
on public.tasks
for select
to authenticated
using (auth.uid() = user_id);

create policy tasks_insert_own
on public.tasks
for insert
to authenticated
with check (auth.uid() = user_id);

create policy tasks_update_own
on public.tasks
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy tasks_delete_own
on public.tasks
for delete
to authenticated
using (auth.uid() = user_id);

create policy goals_select_own
on public.goals
for select
to authenticated
using (auth.uid() = user_id);

create policy goals_insert_own
on public.goals
for insert
to authenticated
with check (auth.uid() = user_id);

create policy goals_update_own
on public.goals
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy goals_delete_own
on public.goals
for delete
to authenticated
using (auth.uid() = user_id);

create policy pressure_logs_select_own
on public.pressure_logs
for select
to authenticated
using (auth.uid() = user_id);

create policy pressure_logs_insert_own
on public.pressure_logs
for insert
to authenticated
with check (auth.uid() = user_id);

create policy pressure_logs_update_own
on public.pressure_logs
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy pressure_logs_delete_own
on public.pressure_logs
for delete
to authenticated
using (auth.uid() = user_id);

commit;
