begin;

create extension if not exists pgtap with schema extensions;
select plan(77);

select ok(has_table_privilege('service_role', 'public.billing_orders', 'SELECT'), 'service_role can SELECT billing_orders');
select ok(has_table_privilege('service_role', 'public.billing_orders', 'INSERT'), 'service_role can INSERT billing_orders');
select ok(has_table_privilege('service_role', 'public.billing_orders', 'UPDATE'), 'service_role can UPDATE billing_orders');
select ok(has_table_privilege('service_role', 'public.billing_orders', 'DELETE'), 'service_role can DELETE billing_orders');

select ok(has_table_privilege('service_role', 'public.membership_grants', 'SELECT'), 'service_role can SELECT membership_grants');
select ok(has_table_privilege('service_role', 'public.membership_grants', 'INSERT'), 'service_role can INSERT membership_grants');
select ok(has_table_privilege('service_role', 'public.membership_grants', 'UPDATE'), 'service_role can UPDATE membership_grants');
select ok(has_table_privilege('service_role', 'public.membership_grants', 'DELETE'), 'service_role can DELETE membership_grants');

select ok(has_table_privilege('service_role', 'public.memberships', 'SELECT'), 'service_role can SELECT memberships');
select ok(has_table_privilege('service_role', 'public.memberships', 'INSERT'), 'service_role can INSERT memberships');
select ok(has_table_privilege('service_role', 'public.memberships', 'UPDATE'), 'service_role can UPDATE memberships');
select ok(has_table_privilege('service_role', 'public.memberships', 'DELETE'), 'service_role can DELETE memberships');

select ok(has_table_privilege('service_role', 'public.billing_events', 'SELECT'), 'service_role can SELECT billing_events');
select ok(has_table_privilege('service_role', 'public.billing_events', 'INSERT'), 'service_role can INSERT billing_events');
select ok(has_table_privilege('service_role', 'public.billing_events', 'UPDATE'), 'service_role can UPDATE billing_events');
select ok(has_table_privilege('service_role', 'public.billing_events', 'DELETE'), 'service_role can DELETE billing_events');

select ok(has_table_privilege('service_role', 'public.subscriptions', 'SELECT'), 'service_role can SELECT subscriptions');
select ok(has_table_privilege('service_role', 'public.subscriptions', 'INSERT'), 'service_role can INSERT subscriptions');
select ok(has_table_privilege('service_role', 'public.subscriptions', 'UPDATE'), 'service_role can UPDATE subscriptions');
select ok(has_table_privilege('service_role', 'public.subscriptions', 'DELETE'), 'service_role can DELETE subscriptions');

select ok(has_table_privilege('service_role', 'public.payment_references', 'SELECT'), 'service_role can SELECT payment_references');
select ok(has_table_privilege('service_role', 'public.payment_references', 'INSERT'), 'service_role can INSERT payment_references');
select ok(has_table_privilege('service_role', 'public.payment_references', 'UPDATE'), 'service_role can UPDATE payment_references');
select ok(has_table_privilege('service_role', 'public.payment_references', 'DELETE'), 'service_role can DELETE payment_references');

select ok(has_table_privilege('service_role', 'public.entitlements', 'SELECT'), 'service_role can SELECT entitlements');
select ok(has_table_privilege('service_role', 'public.entitlements', 'INSERT'), 'service_role can INSERT entitlements');
select ok(has_table_privilege('service_role', 'public.entitlements', 'UPDATE'), 'service_role can UPDATE entitlements');
select ok(has_table_privilege('service_role', 'public.entitlements', 'DELETE'), 'service_role can DELETE entitlements');

select ok(
  (select relrowsecurity from pg_class where oid = ('public.' || table_name)::regclass),
  format('%s RLS remains enabled', table_name)
)
from (values
  ('billing_orders'),
  ('membership_grants'),
  ('memberships'),
  ('billing_events'),
  ('subscriptions'),
  ('payment_references'),
  ('entitlements')
) as billing_tables(table_name);

select ok(
  not has_table_privilege(role_name, 'public.' || table_name, privilege_name),
  format('%s cannot %s %s directly', role_name, privilege_name, table_name)
)
from (values ('anon'), ('authenticated')) as client_roles(role_name)
cross join (values
  ('billing_orders'),
  ('membership_grants'),
  ('memberships'),
  ('billing_events'),
  ('subscriptions'),
  ('payment_references'),
  ('entitlements')
) as billing_tables(table_name)
cross join (values ('INSERT'), ('UPDATE'), ('DELETE')) as write_privileges(privilege_name);

select * from finish();
rollback;
