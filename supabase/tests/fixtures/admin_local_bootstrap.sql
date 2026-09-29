-- Isolated PostgreSQL-only harness, NOT a deployable Supabase migration.
-- Model only the platform objects referenced by this repository's migrations.
-- This exercises real PostgreSQL grants/RLS/locks/transactions, not GoTrue/SMTP/Storage HTTP.
do $$begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
 if not exists(select 1 from pg_roles where rolname='supabase_auth_admin') then create role supabase_auth_admin nologin; end if;
end $$;
create schema auth;
create schema storage;
create schema extensions;
grant usage on schema public,auth,storage,extensions to anon,authenticated,service_role,supabase_auth_admin;
create table auth.users (
 id uuid primary key, instance_id uuid, aud text, role text, email text,
 encrypted_password text, raw_app_meta_data jsonb, raw_user_meta_data jsonb,
 created_at timestamptz default now(), updated_at timestamptz default now(), last_sign_in_at timestamptz, email_confirmed_at timestamptz, phone_confirmed_at timestamptz
);
grant all on auth.users to supabase_auth_admin;
create function auth.uid() returns uuid language sql stable as $$
 select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
   nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid;
$$;
create table storage.buckets (id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid);
alter table storage.objects enable row level security;
grant select,insert,update,delete on storage.objects to authenticated,service_role;
create function storage.foldername(text) returns text[] language sql immutable as $$
 select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1];
$$;
