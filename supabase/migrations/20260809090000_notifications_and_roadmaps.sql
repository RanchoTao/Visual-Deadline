-- Additive IA migration: notifications and generic life roadmaps.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('SYSTEM','WEEKLY_REPORT','AI_ANALYSIS','RISK_WARNING','ACHIEVEMENT','GOAL','TASK','SOCIAL')),
  title text not null, summary text not null default '', content text, metadata jsonb not null default '{}'::jsonb,
  is_read boolean not null default false, created_at timestamptz not null default now(), related_entity_type text, related_entity_id uuid
);
create index if not exists notifications_user_unread_created_idx on public.notifications(user_id,is_read,created_at desc);
alter table public.notifications enable row level security;
drop policy if exists "notifications_select_own" on public.notifications; create policy "notifications_select_own" on public.notifications for select using (user_id=auth.uid());
drop policy if exists "notifications_update_own" on public.notifications; create policy "notifications_update_own" on public.notifications for update using (user_id=auth.uid()) with check (user_id=auth.uid());
drop policy if exists "notifications_insert_own" on public.notifications; create policy "notifications_insert_own" on public.notifications for insert with check (user_id=auth.uid());
drop policy if exists "notifications_delete_own" on public.notifications; create policy "notifications_delete_own" on public.notifications for delete using (user_id=auth.uid());

create table if not exists public.roadmaps (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, title text not null, description text, domain text, goal_id uuid,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.roadmap_nodes (
 id uuid primary key default gen_random_uuid(), roadmap_id uuid not null references public.roadmaps(id) on delete cascade, title text not null, description text,
 type text not null check(type in ('ROOT','STAGE','MILESTONE','TASK_GROUP','KNOWLEDGE','SKILL','PROJECT','GOAL')),
 status text not null default 'LOCKED' check(status in ('LOCKED','AVAILABLE','IN_PROGRESS','COMPLETED','SKIPPED')), importance smallint check(importance between 1 and 10), estimated_duration text,
 metadata jsonb not null default '{}'::jsonb, position_x double precision, position_y double precision
);
create table if not exists public.roadmap_edges (
 id uuid primary key default gen_random_uuid(), roadmap_id uuid not null references public.roadmaps(id) on delete cascade,
 source_node_id uuid not null references public.roadmap_nodes(id) on delete cascade, target_node_id uuid not null references public.roadmap_nodes(id) on delete cascade,
 type text not null default 'PREREQUISITE' check(type in ('PREREQUISITE','RECOMMENDED','OPTIONAL','PARALLEL')), check(source_node_id<>target_node_id), unique(roadmap_id,source_node_id,target_node_id,type)
);
create index if not exists roadmaps_user_idx on public.roadmaps(user_id,updated_at desc); create index if not exists roadmap_nodes_roadmap_idx on public.roadmap_nodes(roadmap_id); create index if not exists roadmap_edges_roadmap_idx on public.roadmap_edges(roadmap_id);
alter table public.roadmaps enable row level security; alter table public.roadmap_nodes enable row level security; alter table public.roadmap_edges enable row level security;
drop policy if exists "roadmaps_own_all" on public.roadmaps; create policy "roadmaps_own_all" on public.roadmaps for all using(user_id=auth.uid()) with check(user_id=auth.uid());
drop policy if exists "roadmap_nodes_own_all" on public.roadmap_nodes; create policy "roadmap_nodes_own_all" on public.roadmap_nodes for all using(exists(select 1 from public.roadmaps r where r.id=roadmap_id and r.user_id=auth.uid())) with check(exists(select 1 from public.roadmaps r where r.id=roadmap_id and r.user_id=auth.uid()));
drop policy if exists "roadmap_edges_own_all" on public.roadmap_edges; create policy "roadmap_edges_own_all" on public.roadmap_edges for all using(exists(select 1 from public.roadmaps r where r.id=roadmap_id and r.user_id=auth.uid())) with check(exists(select 1 from public.roadmaps r where r.id=roadmap_id and r.user_id=auth.uid()));
