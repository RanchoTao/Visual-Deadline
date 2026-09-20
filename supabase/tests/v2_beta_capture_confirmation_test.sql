begin;
select plan(3);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('44444444-4444-4444-8444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'capture@example.test', '', now(), now());

insert into public.intake_messages (id, user_id, role, text_content, confirmation_status)
values ('44444444-0000-4000-8000-000000000001', '44444444-4444-4444-8444-444444444444', 'user', 'legacy capture', null);

select ok(
  (select confirmation_status is null from public.intake_messages where id = '44444444-0000-4000-8000-000000000001'),
  'legacy intake confirmation state may remain unknown as NULL'
);

insert into public.intake_messages (id, user_id, role, text_content)
values ('44444444-0000-4000-8000-000000000002', '44444444-4444-4444-8444-444444444444', 'user', 'new capture');

select is(
  (select confirmation_status from public.intake_messages where id = '44444444-0000-4000-8000-000000000002'),
  'unconfirmed',
  'new intake defaults to unconfirmed when the field is omitted'
);

select throws_ok(
  $$insert into public.intake_messages (id, user_id, role, text_content, confirmation_status) values ('44444444-0000-4000-8000-000000000003', '44444444-4444-4444-8444-444444444444', 'user', 'invalid capture', 'invented')$$,
  '23514', null, 'invalid explicit confirmation state is rejected'
);

select * from finish();
rollback;
