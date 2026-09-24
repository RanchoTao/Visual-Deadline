-- REVIEW persistence is append-only and row-granular. Records and events are
-- immutable. Archive/unarchive intent is an append-only event stream so the
-- complete ReviewRecord remains readable and restorable. Tombstones are only
-- for an explicitly requested permanent deletion.

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

create table public.review_archive_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  review_id text not null,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  changed_at timestamptz not null,
  primary key (user_id, id),
  constraint review_archive_events_record_fk foreign key (user_id, review_id) references public.review_records(user_id, id)
);

create table public.review_tombstones (
  user_id uuid not null references auth.users(id) on delete cascade,
  review_id text not null,
  deleted_at timestamptz not null,
  primary key (user_id, review_id)
);

create index review_records_user_created_idx on public.review_records(user_id, created_at desc);
create index review_events_user_occurred_idx on public.review_events(user_id, occurred_at desc);
create index review_archive_events_user_changed_idx on public.review_archive_events(user_id, changed_at desc);

alter table public.review_records enable row level security;
alter table public.review_events enable row level security;
alter table public.review_archive_events enable row level security;
alter table public.review_tombstones enable row level security;

revoke all on table public.review_records, public.review_events, public.review_archive_events, public.review_tombstones from anon, authenticated;
grant select, insert on table public.review_records, public.review_events, public.review_archive_events, public.review_tombstones to authenticated;
grant all on table public.review_records, public.review_events, public.review_archive_events, public.review_tombstones to service_role;

create policy review_records_select_own on public.review_records for select to authenticated using ((select auth.uid()) = user_id);
create policy review_records_insert_own on public.review_records for insert to authenticated with check ((select auth.uid()) = user_id);
create policy review_events_select_own on public.review_events for select to authenticated using ((select auth.uid()) = user_id);
create policy review_events_insert_own on public.review_events for insert to authenticated with check ((select auth.uid()) = user_id);
create policy review_archive_events_select_own on public.review_archive_events for select to authenticated using ((select auth.uid()) = user_id);
create policy review_archive_events_insert_own on public.review_archive_events for insert to authenticated with check ((select auth.uid()) = user_id);
create policy review_tombstones_select_own on public.review_tombstones for select to authenticated using ((select auth.uid()) = user_id);
create policy review_tombstones_insert_own on public.review_tombstones for insert to authenticated with check ((select auth.uid()) = user_id);
