BEGIN;
SELECT plan(10);

SELECT has_table('public', 'life_events', 'life_events table exists');
SELECT has_column('public', 'life_events', 'occurred_at', 'absolute event timestamp exists');
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.life_events'::regclass),
  'RLS is enabled'
);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
VALUES
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'life-a@example.test', '', now(), now()),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'life-b@example.test', '', now(), now());

INSERT INTO public.life_events (id, user_id, type, occurred_at)
VALUES ('22222222-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'wake', '2026-09-05T01:00:00Z');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT lives_ok(
  $$INSERT INTO public.life_events (id, user_id, type, occurred_at) VALUES ('11111111-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'meal', '2026-09-05T08:00:00Z')$$,
  'user can insert own event'
);

SELECT throws_ok(
  $$INSERT INTO public.life_events (id, user_id, type, occurred_at) VALUES ('11111111-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'meal', '2026-09-05T09:00:00Z')$$,
  '42501',
  NULL,
  'user cannot insert another user event'
);

SELECT is((SELECT count(*)::integer FROM public.life_events), 1, 'user selects only own rows');

SELECT lives_ok(
  $$UPDATE public.life_events SET metadata = '{"corrected":true}'::jsonb WHERE id = '11111111-0000-4000-8000-000000000001'$$,
  'user can update own event'
);
SELECT is(
  (SELECT count(*)::integer FROM public.life_events WHERE metadata @> '{"corrected":true}'::jsonb),
  1,
  'own update is visible'
);

SELECT lives_ok(
  $$DELETE FROM public.life_events WHERE id = '22222222-0000-4000-8000-000000000001'$$,
  'deleting another user event leaks no row and raises no error'
);
SELECT is((SELECT count(*)::integer FROM public.life_events), 1, 'another user row remains invisible');

SELECT * FROM finish();
ROLLBACK;
