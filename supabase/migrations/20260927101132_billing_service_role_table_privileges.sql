-- The service-role backend performs provider reconciliation and audited billing
-- persistence. RLS bypass does not grant ordinary PostgreSQL table privileges,
-- so grant the backend role explicit CRUD without expanding client access.
begin;

grant select, insert, update, delete on table
  public.billing_orders,
  public.membership_grants,
  public.memberships,
  public.billing_events,
  public.subscriptions,
  public.payment_references,
  public.entitlements
to service_role;

commit;
