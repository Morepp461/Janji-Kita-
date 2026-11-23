begin;
select no_plan();

select has_table('public', 'orders', 'tabel pesanan tersedia');
select has_table('public', 'order_items', 'snapshot item pesanan tersedia');
select has_table('public', 'payment_attempts', 'percobaan pembayaran tersedia');
select has_table('public', 'payment_events', 'riwayat webhook tersedia');
select has_table('public', 'entitlements', 'entitlement tersedia');
select has_table('public', 'coupons', 'kupon tersedia');
select has_table('public', 'coupon_redemptions', 'reservasi kupon tersedia');
select has_table('public', 'add_ons', 'katalog add-on tersedia');
select has_table('public', 'invitation_add_ons', 'snapshot add-on undangan tersedia');

select ok((select relrowsecurity from pg_class where oid = 'public.orders'::regclass), 'RLS pesanan aktif');
select ok((select relrowsecurity from pg_class where oid = 'public.payment_attempts'::regclass), 'RLS percobaan pembayaran aktif');
select ok((select relrowsecurity from pg_class where oid = 'public.payment_events'::regclass), 'RLS event pembayaran aktif');
select ok(not has_table_privilege('anon', 'public.orders', 'select'), 'anon tidak dapat membaca pesanan');
select ok(not has_table_privilege('authenticated', 'public.payment_events', 'select'), 'pengguna tidak dapat membaca payload webhook');
select ok(has_function_privilege('authenticated', 'public.create_order(uuid,jsonb,text,text)', 'execute'), 'checkout RPC tersedia untuk pengguna');
select ok(not has_function_privilege('anon', 'public.create_order(uuid,jsonb,text,text)', 'execute'), 'anon tidak dapat membuat pesanan');
select ok(has_function_privilege('authenticated', 'public.publish_invitation(uuid,uuid)', 'execute'), 'RPC publikasi tersedia untuk pengguna');
select ok(not has_function_privilege('anon', 'public.publish_invitation(uuid,uuid)', 'execute'), 'anon tidak dapat menerbitkan undangan');
select ok(has_function_privilege('service_role', 'public.process_midtrans_notification(text,text,text,text,text,text,bigint,text,jsonb,boolean,timestamp with time zone)', 'execute'), 'webhook hanya dapat diproses service role');
select ok(not has_function_privilege('authenticated', 'public.process_midtrans_notification(text,text,text,text,text,text,bigint,text,jsonb,boolean,timestamp with time zone)', 'execute'), 'pengguna tidak dapat memalsukan webhook');
select ok(not has_function_privilege('anon', 'public.expire_invitations()', 'execute'), 'anon tidak dapat menjalankan job kedaluwarsa');

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000401', 'authenticated', 'authenticated',
  'phase4-commerce@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.templates (
  id, slug, title, category_id, style_id, description, base_price, currency, status, created_by
) values (
  '00000000-0000-0000-0000-000000000402', 'phase4-commerce-template', 'Template Commerce',
  (select id from public.categories order by sort_order limit 1),
  (select id from public.design_styles order by sort_order limit 1),
  'Fixture fase 4', 10000, 'IDR', 'draft',
  '00000000-0000-0000-0000-000000000401'
);
insert into public.template_versions (
  id, template_id, version_no, schema_version, document, created_by
) values (
  '00000000-0000-0000-0000-000000000403',
  '00000000-0000-0000-0000-000000000402', 1, 1,
  '{"schemaVersion":1,"pages":[{"id":"page-1","sections":[{"id":"section-1","type":"Section","props":{},"children":[]}]}]}'::jsonb,
  '00000000-0000-0000-0000-000000000401'
);
update public.templates set current_version_id = '00000000-0000-0000-0000-000000000403',
  status = 'published' where id = '00000000-0000-0000-0000-000000000402';

insert into public.add_ons(code, name_i18n, price, currency, billing_type, is_active)
values ('phase4-addon', '{"id-ID":"Add-on Uji"}'::jsonb, 2500, 'IDR', 'quantity', true);
insert into public.coupons(code, discount_type, discount_value, starts_at, ends_at,
  max_redemptions, per_user_limit, is_active, rules)
values ('FASE4HEMAT', 'percent', 10, now() - interval '1 day', now() + interval '1 day',
  5, 1, true, '{}'::jsonb);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000401', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000401","role":"authenticated"}', true);

select lives_ok(
  $phase4$select public.create_invitation_draft(
    'Undangan Commerce Fase 4',
    (select id from public.categories order by sort_order limit 1),
    '00000000-0000-0000-0000-000000000402'
  )$phase4$,
  'pengguna dapat membuat draft untuk checkout'
);

select lives_ok(
  $phase4$select public.create_order(
    (select id from public.invitations where title = 'Undangan Commerce Fase 4'),
    '[{"id":"' || (select id::text from public.add_ons where code = 'phase4-addon') || '","quantity":2}]'::jsonb,
    'FASE4HEMAT',
    'phase4-idempotency-key-0001'
  )$phase4$,
  'checkout membuat snapshot harga di backend'
);

select is(
  (select subtotal from public.orders where idempotency_key = 'phase4-idempotency-key-0001'),
  15000::bigint,
  'subtotal berasal dari harga template dan kuantitas add-on'
);
select is(
  (select discount_total from public.orders where idempotency_key = 'phase4-idempotency-key-0001'),
  1500::bigint,
  'kupon dihitung di backend'
);
select is(
  (select grand_total from public.orders where idempotency_key = 'phase4-idempotency-key-0001'),
  13500::bigint,
  'total pesanan menyimpan snapshot setelah diskon'
);
select is(
  (select count(*) from public.order_items oi join public.orders o on o.id = oi.order_id
    where o.idempotency_key = 'phase4-idempotency-key-0001'),
  2::bigint,
  'baris item menyimpan snapshot template dan add-on'
);
select is(
  (select count(*) from public.coupon_redemptions cr join public.orders o on o.id = cr.order_id
    where o.idempotency_key = 'phase4-idempotency-key-0001'),
  1::bigint,
  'penggunaan kupon direservasi bersama pembuatan pesanan'
);
select is(
  (select status from public.orders where idempotency_key = 'phase4-idempotency-key-0001'),
  'pending',
  'pesanan menunggu verifikasi gateway'
);

select throws_ok(
  $phase4$select public.publish_invitation(
    (select id from public.invitations where title = 'Undangan Commerce Fase 4'),
    (select draft_version_id from public.invitations where title = 'Undangan Commerce Fase 4')
  )$phase4$,
  '42501',
  'Pembayaran diperlukan sebelum undangan dapat diterbitkan',
  'pesanan belum dibayar tidak dapat menerbitkan undangan'
);

reset role;
insert into public.payment_attempts(order_id, provider, provider_order_id, status,
  amount, currency, idempotency_key)
select id, 'midtrans', order_number, 'pending', grand_total, currency,
  'midtrans:' || id::text
from public.orders where idempotency_key = 'phase4-idempotency-key-0001';

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select lives_ok(
  $phase4$select public.process_midtrans_notification(
    (select order_number from public.orders where idempotency_key = 'phase4-idempotency-key-0001'),
    'midtrans-transaction-401', 'settlement', '', 'qris', '200', 13500,
    'midtrans-transaction-401:200:settlement:2026-11-23T00:00:00Z',
    '{"order_id":"redacted","transaction_status":"settlement"}'::jsonb,
    true, now()
  )$phase4$,
  'webhook settlement yang tervalidasi memproses pembayaran'
);

select is(
  (select status from public.orders where idempotency_key = 'phase4-idempotency-key-0001'),
  'paid',
  'pesanan berubah menjadi paid setelah webhook tervalidasi'
);
select is(
  (select count(*) from public.entitlements where entitlement_key = 'invitation.publish'
    and value ->> 'invitation_id' = (select id::text from public.invitations where title = 'Undangan Commerce Fase 4')
    and status = 'active'),
  1::bigint,
  'pembayaran sukses membuat satu entitlement publikasi'
);
select is(
  (select count(*) from public.invitation_add_ons ia
    join public.invitations i on i.id = ia.invitation_id
    where i.title = 'Undangan Commerce Fase 4'),
  1::bigint,
  'add-on berbayar disimpan sebagai entitlement undangan'
);
select is(
  public.process_midtrans_notification(
    (select order_number from public.orders where idempotency_key = 'phase4-idempotency-key-0001'),
    'midtrans-transaction-401', 'settlement', '', 'qris', '200', 13500,
    'midtrans-transaction-401:200:settlement:2026-11-23T00:00:00Z',
    '{"order_id":"redacted","transaction_status":"settlement"}'::jsonb,
    true, now()
  ) ->> 'duplicate',
  'true',
  'webhook duplikat dikenali tanpa memproses ulang'
);
select is(
  (select count(*) from public.entitlements where entitlement_key = 'invitation.publish'
    and value ->> 'invitation_id' = (select id::text from public.invitations where title = 'Undangan Commerce Fase 4')),
  1::bigint,
  'webhook duplikat tidak menggandakan entitlement'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000401', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000401","role":"authenticated"}', true);
select lives_ok(
  $phase4$select public.publish_invitation(
    (select id from public.invitations where title = 'Undangan Commerce Fase 4'),
    (select draft_version_id from public.invitations where title = 'Undangan Commerce Fase 4')
  )$phase4$,
  'pemilik dapat menerbitkan undangan setelah pembayaran sukses'
);
select is(
  (select status from public.invitations where title = 'Undangan Commerce Fase 4'),
  'active',
  'publikasi mengaktifkan undangan'
);
select is(
  public.get_public_invitation((select slug from public.invitations where title = 'Undangan Commerce Fase 4'))->>'title',
  'Undangan Commerce Fase 4',
  'renderer publik hanya menampilkan versi yang sudah diterbitkan'
);

select lives_ok(
  $phase4$select public.create_invitation_revision(
    (select id from public.invitations where title = 'Undangan Commerce Fase 4')
  )$phase4$,
  'pemilik dapat membuat revisi dari versi publik'
);
select lives_ok(
  $phase4$select public.save_invitation_draft(
    (select id from public.invitations where title = 'Undangan Commerce Fase 4'),
    (select updated_at from public.invitations where title = 'Undangan Commerce Fase 4'),
    'Undangan Commerce Fase 4 Diperbarui',
    '{"schemaVersion":1,"pages":[{"id":"page-1","sections":[{"id":"section-1","type":"Section","props":{},"children":[{"id":"heading-1","type":"Heading","props":{"text":"Versi kedua"},"style":{}}]}]}]}'::jsonb
  )$phase4$,
  'revisi draft dapat disimpan tanpa mengubah versi publik'
);
select is(
  public.get_public_invitation((select slug from public.invitations where title = 'Undangan Commerce Fase 4'))->>'title',
  'Undangan Commerce Fase 4',
  'autosave tidak mengubah versi publik sebelum update diterbitkan'
);
select lives_ok(
  $phase4$select public.publish_invitation(
    (select id from public.invitations where title = 'Undangan Commerce Fase 4 Diperbarui'),
    (select draft_version_id from public.invitations where title = 'Undangan Commerce Fase 4 Diperbarui')
  )$phase4$,
  'pemilik dapat menerbitkan pembaruan secara atomik'
);
select is(
  public.get_public_invitation((select slug from public.invitations where title = 'Undangan Commerce Fase 4 Diperbarui'))->>'title',
  'Undangan Commerce Fase 4 Diperbarui',
  'renderer beralih ke versi baru setelah publikasi berhasil'
);

reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.entitlements set valid_until = now() - interval '1 minute'
where entitlement_key = 'invitation.publish';
update public.invitations set active_until = now() - interval '1 minute'
where title = 'Undangan Commerce Fase 4 Diperbarui';
select is(public.expire_invitations() >= 1, true, 'job kedaluwarsa memperbarui status undangan');
reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(
  public.get_public_invitation((select slug from public.invitations where title = 'Undangan Commerce Fase 4 Diperbarui')),
  null::jsonb,
  'renderer tidak mengembalikan undangan yang sudah kedaluwarsa'
);

select * from finish();
rollback;
