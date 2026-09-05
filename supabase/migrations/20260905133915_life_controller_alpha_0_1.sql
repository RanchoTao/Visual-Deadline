-- VD Life Controller Alpha 0.1
-- Life events are observations, not tasks. Durations and state remain derived.

create table if not exists public.life_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (char_length(type) between 1 and 64),
  occurred_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists life_events_user_occurred_idx
  on public.life_events (user_id, occurred_at desc, created_at desc);

create or replace function public.set_visual_deadline_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists life_events_set_updated_at on public.life_events;
create trigger life_events_set_updated_at
before update on public.life_events
for each row execute function public.set_visual_deadline_updated_at();

alter table public.life_events enable row level security;

revoke all on table public.life_events from anon, authenticated;
grant select, insert, update, delete on table public.life_events to authenticated;

drop policy if exists life_events_select_own on public.life_events;
create policy life_events_select_own
on public.life_events for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists life_events_insert_own on public.life_events;
create policy life_events_insert_own
on public.life_events for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists life_events_update_own on public.life_events;
create policy life_events_update_own
on public.life_events for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists life_events_delete_own on public.life_events;
create policy life_events_delete_own
on public.life_events for delete
to authenticated
using ((select auth.uid()) = user_id);
