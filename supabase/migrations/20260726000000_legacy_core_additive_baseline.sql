-- Reconstructed additive baseline for the legacy cloud-sync tables.
-- The original definitions existed only in root supabase-schema.sql, whose DROP/recreate
-- workflow is not a deployable migration. Existing tables and rows are left untouched.
-- Rollback: keep these legacy tables active; this migration introduces no v2 runtime path.

begin;

do $create_updated_at_function$
begin
  if to_regprocedure('public.set_visual_deadline_updated_at()') is null then
    execute $function$
      create function public.set_visual_deadline_updated_at()
      returns trigger
      language plpgsql
      set search_path = ''
      as $body$
      begin
        new.updated_at = now();
        return new;
      end;
      $body$
    $function$;
  end if;
end
$create_updated_at_function$;

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

-- CREATE TABLE IF NOT EXISTS is not schema validation. A fresh database has the
-- exact shape above; an existing database must match it before this migration may
-- add indexes, triggers, grants, or policies. Any mismatch aborts the transaction
-- and requires manual investigation rather than an in-place conversion.
do $legacy_core_shape_validation$
declare
  expected record;
  actual_type oid;
  actual_not_null boolean;
  default_expression text;
  target_table text;
begin
  for expected in
    select * from (values
      ('profiles', 'id', 'uuid', true),
      ('profiles', 'user_id', 'uuid', true),
      ('profiles', 'data', 'jsonb', true),
      ('profiles', 'created_at', 'timestamptz', true),
      ('profiles', 'updated_at', 'timestamptz', true),
      ('tasks', 'id', 'text', true),
      ('tasks', 'user_id', 'uuid', true),
      ('tasks', 'data', 'jsonb', true),
      ('tasks', 'created_at', 'timestamptz', true),
      ('tasks', 'updated_at', 'timestamptz', true),
      ('goals', 'id', 'text', true),
      ('goals', 'user_id', 'uuid', true),
      ('goals', 'data', 'jsonb', true),
      ('goals', 'created_at', 'timestamptz', true),
      ('goals', 'updated_at', 'timestamptz', true),
      ('pressure_logs', 'id', 'text', true),
      ('pressure_logs', 'user_id', 'uuid', true),
      ('pressure_logs', 'data', 'jsonb', true),
      ('pressure_logs', 'created_at', 'timestamptz', true),
      ('pressure_logs', 'updated_at', 'timestamptz', true)
    ) as required(table_name, column_name, type_name, must_be_not_null)
  loop
    select attribute.atttypid, attribute.attnotnull
      into actual_type, actual_not_null
    from pg_attribute attribute
    where attribute.attrelid = to_regclass(format('public.%I', expected.table_name))
      and attribute.attname = expected.column_name
      and attribute.attnum > 0
      and not attribute.attisdropped;

    if not found then
      raise exception using
        errcode = 'P0001',
        message = format(
          'Legacy core schema mismatch: public.%I is missing required column %I. Stop and investigate manually; no legacy conversion is permitted.',
          expected.table_name,
          expected.column_name
        );
    end if;

    if actual_type <> to_regtype(expected.type_name) or actual_not_null is distinct from expected.must_be_not_null then
      raise exception using
        errcode = 'P0001',
        message = format(
          'Legacy core schema mismatch: public.%I.%I must be %s%s but is %s%s. Stop and investigate manually; no legacy conversion is permitted.',
          expected.table_name,
          expected.column_name,
          expected.type_name,
          case when expected.must_be_not_null then ' NOT NULL' else '' end,
          format_type(actual_type, null),
          case when actual_not_null then ' NOT NULL' else ' NULLABLE' end
        );
    end if;
  end loop;

  foreach target_table in array array['profiles', 'tasks', 'goals', 'pressure_logs'] loop
    if not exists (
      select 1
      from pg_constraint constraint_record
      where constraint_record.conrelid = to_regclass(format('public.%I', target_table))
        and constraint_record.contype = 'p'
        and (
          select array_agg(attribute.attname::text order by key_column.ordinality)
          from unnest(constraint_record.conkey) with ordinality as key_column(attnum, ordinality)
          join pg_attribute attribute
            on attribute.attrelid = constraint_record.conrelid
           and attribute.attnum = key_column.attnum
        ) = array['id']::text[]
    ) then
      raise exception using
        errcode = 'P0001',
        message = format(
          'Legacy core schema mismatch: public.%I must have a primary key on id only. Stop and investigate manually.',
          target_table
        );
    end if;

    select pg_get_expr(default_record.adbin, default_record.adrelid)
      into default_expression
    from pg_attrdef default_record
    join pg_attribute attribute
      on attribute.attrelid = default_record.adrelid
     and attribute.attnum = default_record.adnum
    where default_record.adrelid = to_regclass(format('public.%I', target_table))
      and attribute.attname = 'data';

    if not found or replace(default_expression, ' ', '') <> '''{}''::jsonb' then
      raise exception using
        errcode = 'P0001',
        message = format(
          'Legacy core schema mismatch: public.%I.data must default to an empty JSONB object. Stop and investigate manually.',
          target_table
        );
    end if;
  end loop;

  if not exists (
    select 1
    from pg_constraint constraint_record
    where constraint_record.conrelid = 'public.profiles'::regclass
      and constraint_record.contype = 'u'
      and (
        select array_agg(attribute.attname::text order by key_column.ordinality)
        from unnest(constraint_record.conkey) with ordinality as key_column(attnum, ordinality)
        join pg_attribute attribute
          on attribute.attrelid = constraint_record.conrelid
         and attribute.attnum = key_column.attnum
      ) = array['user_id']::text[]
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Legacy core schema mismatch: public.profiles.user_id must have its established UNIQUE constraint. Stop and investigate manually.';
  end if;

  if not exists (
    select 1
    from pg_constraint constraint_record
    where constraint_record.conrelid = 'public.profiles'::regclass
      and constraint_record.contype = 'c'
      and regexp_replace(lower(pg_get_constraintdef(constraint_record.oid)), '[[:space:]()]', '', 'g') = 'checkid=user_id'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Legacy core schema mismatch: public.profiles must enforce id = user_id. Stop and investigate manually.';
  end if;

  for expected in
    select * from (values
      ('profiles', 'id'),
      ('profiles', 'user_id'),
      ('tasks', 'user_id'),
      ('goals', 'user_id'),
      ('pressure_logs', 'user_id')
    ) as required(table_name, column_name)
  loop
    if not exists (
      select 1
      from pg_constraint constraint_record
      where constraint_record.conrelid = to_regclass(format('public.%I', expected.table_name))
        and constraint_record.contype = 'f'
        and constraint_record.confrelid = 'auth.users'::regclass
        and constraint_record.confdeltype = 'c'
        and (
          select array_agg(attribute.attname::text order by key_column.ordinality)
          from unnest(constraint_record.conkey) with ordinality as key_column(attnum, ordinality)
          join pg_attribute attribute
            on attribute.attrelid = constraint_record.conrelid
           and attribute.attnum = key_column.attnum
        ) = array[expected.column_name]::text[]
        and (
          select array_agg(attribute.attname::text order by key_column.ordinality)
          from unnest(constraint_record.confkey) with ordinality as key_column(attnum, ordinality)
          join pg_attribute attribute
            on attribute.attrelid = constraint_record.confrelid
           and attribute.attnum = key_column.attnum
        ) = array['id']::text[]
    ) then
      raise exception using
        errcode = 'P0001',
        message = format(
          'Legacy core schema mismatch: public.%I.%I must reference auth.users(id) ON DELETE CASCADE. Stop and investigate manually.',
          expected.table_name,
          expected.column_name
        );
    end if;
  end loop;
end
$legacy_core_shape_validation$;

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
