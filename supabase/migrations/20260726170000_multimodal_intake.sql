-- Multimodal intake is deliberately separate from public.tasks: only a later,
-- explicit confirmation flow may copy a task_draft into the existing task shape.
begin;

create table if not exists public.intake_messages (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  text_content text not null default '',
  status text not null default 'processing' check (status in ('processing', 'ready', 'error', 'cancelled')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.intake_assets (
  id uuid primary key,
  intake_message_id uuid not null references public.intake_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_bucket text not null default 'intake-assets',
  storage_path text not null unique,
  kind text not null check (kind in ('image', 'document', 'audio')),
  mime_type text not null,
  file_name text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 20971520),
  status text not null check (status in ('queued', 'uploading', 'uploaded', 'processing', 'ready', 'error')),
  extracted_text text,
  processing_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint intake_asset_path_owner check (split_part(storage_path, '/', 1) = user_id::text)
);

create table if not exists public.task_drafts (
  id uuid primary key default gen_random_uuid(),
  intake_message_id uuid not null references public.intake_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  project_id text,
  due_at timestamptz,
  importance smallint not null check (importance between 1 and 10),
  estimated_minutes integer check (estimated_minutes > 0),
  subtasks jsonb not null default '[]'::jsonb,
  source_refs jsonb not null default '[]'::jsonb,
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  ambiguities jsonb not null default '[]'::jsonb,
  status text not null default 'pending_confirmation' check (status in ('pending_confirmation', 'confirmed', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists intake_messages_user_idx on public.intake_messages(user_id, created_at desc);
create index if not exists intake_assets_message_idx on public.intake_assets(intake_message_id);
create index if not exists task_drafts_message_idx on public.task_drafts(intake_message_id);

alter table public.intake_messages enable row level security;
alter table public.intake_assets enable row level security;
alter table public.task_drafts enable row level security;

do $$ declare table_name text; begin
  foreach table_name in array array['intake_messages', 'intake_assets', 'task_drafts'] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_own_all', table_name);
    execute format('create policy %I on public.%I for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)', table_name || '_own_all', table_name);
  end loop;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('intake-assets', 'intake-assets', false, 20971520, array['image/jpeg','image/png','image/gif','image/webp','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain','text/markdown','text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','audio/webm','audio/ogg','audio/mp4','audio/mpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists intake_storage_own_all on storage.objects;
create policy intake_storage_own_all on storage.objects for all to authenticated
using (bucket_id = 'intake-assets' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'intake-assets' and (storage.foldername(name))[1] = auth.uid()::text);

commit;
