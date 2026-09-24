-- REVIEW persistence is append-only and row-granular. Records and events are
-- immutable; archive intent is retained separately so a stale device cannot
-- resurrect a review by replaying an older local snapshot.

create table public.review_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (user_id, id)
);

create table public.review_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null,
  primary key (user_id, id)
);

create table public.review_tombstones (
  user_id uuid not null references auth.users(id) on delete cascade,
  review_id text not null,
  deleted_at timestamptz not null,
  primary key (user_id, review_id)
);

create index review_records_user_created_idx on public.review_records(user_id, created_at desc);
create index review_events_user_occurred_idx on public.review_events(user_id, occurred_at desc);

alter table public.review_records enable row level security;
alter table public.review_events enable row level security;
alter table public.review_tombstones enable row level security;

revoke all on table public.review_records, public.review_events, public.review_tombstones from anon, authenticated;
grant select, insert on table public.review_records, public.review_events, public.review_tombstones to authenticated;
grant all on table public.review_records, public.review_events, public.review_tombstones to service_role;

create policy review_records_select_own on public.review_records for select to authenticated using ((select auth.uid()) = user_id);
create policy review_records_insert_own on public.review_records for insert to authenticated with check ((select auth.uid()) = user_id);
create policy review_events_select_own on public.review_events for select to authenticated using ((select auth.uid()) = user_id);
create policy review_events_insert_own on public.review_events for insert to authenticated with check ((select auth.uid()) = user_id);
create policy review_tombstones_select_own on public.review_tombstones for select to authenticated using ((select auth.uid()) = user_id);
create policy review_tombstones_insert_own on public.review_tombstones for insert to authenticated with check ((select auth.uid()) = user_id);
