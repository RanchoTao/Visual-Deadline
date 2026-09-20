-- Minimum additive Beta hardening for existing Capture and Notification tables.
-- Existing rows are not rewritten; advanced interpretation/delivery tables remain deferred.
-- Rollback: ignore the nullable columns/indexes and keep current runtime paths active.

begin;

alter table public.intake_messages
  add column if not exists client_request_id uuid,
  add column if not exists confirmation_status text not null default 'unconfirmed'
    check (confirmation_status in ('unconfirmed', 'needs_confirmation', 'confirmed', 'materialized', 'rejected')),
  add column if not exists confirmed_at timestamptz,
  add column if not exists materialized_at timestamptz;

alter table public.intake_assets
  add column if not exists content_checksum text;

alter table public.task_drafts
  add column if not exists confirmed_at timestamptz,
  add column if not exists materialized_at timestamptz;

create unique index if not exists intake_messages_user_client_request_uq
  on public.intake_messages(user_id, client_request_id)
  where client_request_id is not null;

create unique index if not exists intake_messages_user_id_uq
  on public.intake_messages(user_id, id);

do $capture_constraints$
begin
  if not exists (select 1 from pg_constraint where conname = 'intake_assets_message_owner_fk' and conrelid = 'public.intake_assets'::regclass) then
    alter table public.intake_assets
      add constraint intake_assets_message_owner_fk foreign key (user_id, intake_message_id)
      references public.intake_messages(user_id, id) on delete cascade not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'task_drafts_message_owner_fk' and conrelid = 'public.task_drafts'::regclass) then
    alter table public.task_drafts
      add constraint task_drafts_message_owner_fk foreign key (user_id, intake_message_id)
      references public.intake_messages(user_id, id) on delete cascade not valid;
  end if;
end
$capture_constraints$;

alter table public.notifications
  add column if not exists read_at timestamptz,
  add column if not exists dedupe_key text;

create unique index if not exists notifications_user_dedupe_uq
  on public.notifications(user_id, dedupe_key)
  where dedupe_key is not null;

create index if not exists notifications_user_read_created_idx
  on public.notifications(user_id, read_at, created_at desc);

revoke all on table public.notifications from anon, authenticated;
grant select, insert, update, delete on table public.notifications to authenticated;

alter policy notifications_select_own on public.notifications
  to authenticated using ((select auth.uid()) = user_id);
alter policy notifications_insert_own on public.notifications
  to authenticated with check ((select auth.uid()) = user_id);
alter policy notifications_update_own on public.notifications
  to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy notifications_delete_own on public.notifications
  to authenticated using ((select auth.uid()) = user_id);

commit;
