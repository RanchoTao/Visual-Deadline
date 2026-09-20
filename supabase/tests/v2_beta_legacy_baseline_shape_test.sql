begin;
select plan(8);

with expected(table_name, column_name, type_name, must_be_not_null) as (
  values
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
), actual as (
  select
    class_record.relname::text as table_name,
    attribute.attname::text as column_name,
    attribute.atttypid,
    attribute.attnotnull
  from pg_attribute attribute
  join pg_class class_record on class_record.oid = attribute.attrelid
  join pg_namespace namespace_record on namespace_record.oid = class_record.relnamespace
  where namespace_record.nspname = 'public'
    and class_record.relname in ('profiles', 'tasks', 'goals', 'pressure_logs')
    and attribute.attnum > 0
    and not attribute.attisdropped
)
select ok(
  not exists (
    select 1
    from expected
    left join actual using (table_name, column_name)
    where actual.column_name is null
      or actual.atttypid <> to_regtype(expected.type_name)
      or actual.attnotnull is distinct from expected.must_be_not_null
  ),
  'legacy core required columns retain their established types and nullability'
);

select ok(
  not exists (
    select required.table_name
    from (values ('profiles'), ('tasks'), ('goals'), ('pressure_logs')) as required(table_name)
    where not exists (
      select 1
      from pg_constraint constraint_record
      where constraint_record.conrelid = to_regclass(format('public.%I', required.table_name))
        and constraint_record.contype = 'p'
        and (
          select array_agg(attribute.attname::text order by key_column.ordinality)
          from unnest(constraint_record.conkey) with ordinality as key_column(attnum, ordinality)
          join pg_attribute attribute
            on attribute.attrelid = constraint_record.conrelid
           and attribute.attnum = key_column.attnum
        ) = array['id']::text[]
    )
  ),
  'every legacy core table has its established id primary key'
);

select ok(
  exists (
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
  ),
  'profiles user_id remains unique'
);

select ok(
  exists (
    select 1
    from pg_constraint constraint_record
    where constraint_record.conrelid = 'public.profiles'::regclass
      and constraint_record.contype = 'c'
      and regexp_replace(lower(pg_get_constraintdef(constraint_record.oid)), '[[:space:]()]', '', 'g') = 'checkid=user_id'
  ),
  'profiles retains the id equals user_id ownership identity check'
);

select ok(
  not exists (
    select *
    from (values
      ('profiles', 'id'),
      ('profiles', 'user_id'),
      ('tasks', 'user_id'),
      ('goals', 'user_id'),
      ('pressure_logs', 'user_id')
    ) as required(table_name, column_name)
    where not exists (
      select 1
      from pg_constraint constraint_record
      where constraint_record.conrelid = to_regclass(format('public.%I', required.table_name))
        and constraint_record.contype = 'f'
        and constraint_record.confrelid = 'auth.users'::regclass
        and constraint_record.confdeltype = 'c'
        and (
          select array_agg(attribute.attname::text order by key_column.ordinality)
          from unnest(constraint_record.conkey) with ordinality as key_column(attnum, ordinality)
          join pg_attribute attribute
            on attribute.attrelid = constraint_record.conrelid
           and attribute.attnum = key_column.attnum
        ) = array[required.column_name]::text[]
    )
  ),
  'legacy ownership columns reference auth.users with cascade deletion'
);

select ok(
  not exists (
    select required.table_name
    from (values ('profiles'), ('tasks'), ('goals'), ('pressure_logs')) as required(table_name)
    where not exists (
      select 1
      from pg_attrdef default_record
      join pg_attribute attribute
        on attribute.attrelid = default_record.adrelid
       and attribute.attnum = default_record.adnum
      where default_record.adrelid = to_regclass(format('public.%I', required.table_name))
        and attribute.attname = 'data'
        and replace(pg_get_expr(default_record.adbin, default_record.adrelid), ' ', '') = '''{}''::jsonb'
    )
  ),
  'legacy JSONB payloads retain the empty-object default'
);

select ok(
  not exists (
    select required.table_name
    from (values ('profiles'), ('tasks'), ('goals'), ('pressure_logs')) as required(table_name)
    where not exists (
      select 1
      from pg_trigger trigger_record
      where trigger_record.tgrelid = to_regclass(format('public.%I', required.table_name))
        and trigger_record.tgname = required.table_name || '_set_updated_at'
        and not trigger_record.tgisinternal
    )
  ),
  'legacy updated_at triggers exist'
);

select ok(
  not exists (
    select required.table_name
    from (values ('profiles'), ('tasks'), ('goals'), ('pressure_logs')) as required(table_name)
    join pg_class class_record on class_record.oid = to_regclass(format('public.%I', required.table_name))
    where not class_record.relrowsecurity
  ),
  'legacy core tables have RLS enabled'
);

select * from finish();
rollback;
