begin;
select no_plan();

select has_table('public', 'invitation_collaborators', 'tabel kolaborator tersedia');
select has_table('public', 'collaborator_invites', 'tabel undangan kolaborator tersedia');
select has_table('public', 'subscription_plans', 'tabel paket Premium tersedia');
select has_table('public', 'subscriptions', 'tabel langganan tersedia');
select has_table('public', 'reseller_profiles', 'tabel profil reseller tersedia');
select has_table('public', 'reseller_price_rules', 'tabel aturan harga reseller tersedia');
select has_table('public', 'reseller_clients', 'tabel klien reseller tersedia');
select has_table('public', 'reseller_sales', 'tabel penjualan reseller tersedia');

select ok((select relrowsecurity from pg_class where oid='public.invitation_collaborators'::regclass), 'RLS kolaborator aktif');
select ok((select relrowsecurity from pg_class where oid='public.subscriptions'::regclass), 'RLS langganan aktif');
select ok((select relrowsecurity from pg_class where oid='public.reseller_clients'::regclass), 'RLS klien reseller aktif');
select ok(not has_table_privilege('anon','public.invitation_collaborators','select'), 'anon tidak dapat membaca kolaborator');
select ok(not has_table_privilege('anon','public.subscriptions','select'), 'anon tidak dapat membaca langganan');
select ok(not has_table_privilege('anon','public.reseller_clients','select'), 'anon tidak dapat membaca klien');
select ok(not has_function_privilege('anon','public.invite_collaborator(uuid,text,text)','execute'), 'anon tidak dapat mengundang kolaborator');
select ok(not has_function_privilege('authenticated','public.sync_subscription_provider_event(text,text,uuid,text,text,text,timestamptz,timestamptz,text,jsonb)','execute'), 'adapter provider hanya dapat dipanggil service role');

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000601','authenticated','authenticated','phase6-owner@example.test','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000602','authenticated','authenticated','phase6-editor@example.test','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000603','authenticated','authenticated','phase6-editor-two@example.test','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000604','authenticated','authenticated','phase6-viewer@example.test','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000605','authenticated','authenticated','phase6-admin@example.test','',now(),'{}','{}',now(),now());

insert into public.user_roles(user_id, role)
values ('00000000-0000-0000-0000-000000000605','admin')
on conflict (user_id, role) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000601',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000601","role":"authenticated","email":"phase6-owner@example.test"}',true);
select lives_ok(
  $q$select public.create_invitation_draft('Undangan Fase Enam',(select id from public.categories order by sort_order limit 1),null)$q$,
  'pemilik membuat undangan'
);
select lives_ok(
  $q$select public.invite_collaborator((select id from public.invitations where title='Undangan Fase Enam'),'phase6-editor@example.test','editor')$q$,
  'pemilik mengundang editor pertama'
);
select lives_ok(
  $q$select public.invite_collaborator((select id from public.invitations where title='Undangan Fase Enam'),'phase6-editor-two@example.test','editor')$q$,
  'pemilik mengundang editor kedua'
);
select lives_ok(
  $q$select public.invite_collaborator((select id from public.invitations where title='Undangan Fase Enam'),'phase6-viewer@example.test','viewer')$q$,
  'pemilik mengundang pembaca'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000602',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000602","role":"authenticated","email":"phase6-editor@example.test"}',true);
select lives_ok(
  $q$select public.accept_collaborator_invite((select id from public.collaborator_invites where invited_email='phase6-editor@example.test' and status='pending'))$q$,
  'editor menerima undangan'
);
select lives_ok(
  $q$select public.apply_reseller('Usaha Uji Fase Enam','phase6-editor@example.test','2026-11-23-v1')$q$,
  'pengguna mengirim aplikasi reseller'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000603',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000603","role":"authenticated","email":"phase6-editor-two@example.test"}',true);
select throws_ok(
  $q$select public.accept_collaborator_invite((select id from public.collaborator_invites where invited_email='phase6-editor-two@example.test' and status='pending'))$q$,
  'P0001','Batas editor aktif undangan telah tercapai.',
  'akun reguler tidak dapat menambahkan editor kedua'
);
reset role;

update public.subscription_plans
set monthly_price=25000,billing_provider='manual-test',collaborator_limit=4,grace_period_days=3,is_active=true
where code='premium_monthly';

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000605',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000605","role":"authenticated","email":"phase6-admin@example.test"}',true);
select lives_ok(
  $q$select public.admin_set_subscription('00000000-0000-0000-0000-000000000601','premium_monthly','manual-test','active',now(),now()+interval '30 days',null,false)$q$,
  'admin menyinkronkan langganan Premium'
);
select lives_ok(
  $q$select public.review_reseller_application('00000000-0000-0000-0000-000000000602','approved','standard')$q$,
  'admin menyetujui aplikasi reseller'
);
reset role;

select is(
  (select (value ->> 'collaborator_limit')::integer from public.entitlements
   where user_id='00000000-0000-0000-0000-000000000601' and entitlement_key='collaborator_limit' and status='active'
   order by created_at desc limit 1),
  4,
  'entitlement Premium mengikuti batas paket'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000603',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000603","role":"authenticated","email":"phase6-editor-two@example.test"}',true);
select lives_ok(
  $q$select public.accept_collaborator_invite((select id from public.collaborator_invites where invited_email='phase6-editor-two@example.test' and status='pending'))$q$,
  'Premium mengizinkan editor tambahan sesuai konfigurasi'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000604',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000604","role":"authenticated","email":"phase6-viewer@example.test"}',true);
select lives_ok(
  $q$select public.accept_collaborator_invite((select id from public.collaborator_invites where invited_email='phase6-viewer@example.test' and status='pending'))$q$,
  'pembaca menerima undangan tanpa memakai slot editor'
);
reset role;

select is(
  (select count(*) from public.invitation_collaborators where invitation_id=(select id from public.invitations where title='Undangan Fase Enam') and status='accepted' and role='editor'),
  2::bigint,'jumlah editor aktif sesuai entitlement Premium'
);
select is(
  (select count(*) from public.invitation_collaborators where invitation_id=(select id from public.invitations where title='Undangan Fase Enam') and status='accepted' and role='viewer'),
  1::bigint,'pembaca tidak dihitung sebagai editor'
);

select is(
  (select status from public.reseller_profiles where user_id='00000000-0000-0000-0000-000000000602'),
  'approved','status reseller berubah setelah persetujuan'
);
select ok(
  exists(select 1 from public.user_roles where user_id='00000000-0000-0000-0000-000000000602' and role='reseller'),
  'peran reseller diberikan setelah persetujuan'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000602',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000602","role":"authenticated","email":"phase6-editor@example.test"}',true);
select lives_ok(
  $q$insert into public.reseller_clients(reseller_user_id,name,email) values ('00000000-0000-0000-0000-000000000602','Klien Terdaftar','phase6-owner@example.test')$q$,
  'reseller mencatat klien terdaftar'
);
select lives_ok(
  $q$select public.create_reseller_invitation_draft(
    (select id from public.reseller_clients where reseller_user_id='00000000-0000-0000-0000-000000000602' and email='phase6-owner@example.test'),
    'Undangan Klien Reseller',
    (select id from public.categories order by sort_order limit 1),
    null
  )$q$,
  'reseller membuat undangan atas nama klien'
);
reset role;

select is((select owner_user_id from public.invitations where title='Undangan Klien Reseller'),
  '00000000-0000-0000-0000-000000000601'::uuid,'klien tetap menjadi pemilik undangan');
select is((select created_by from public.invitations where title='Undangan Klien Reseller'),
  '00000000-0000-0000-0000-000000000602'::uuid,'reseller tercatat sebagai pembuat undangan');
select is((select reseller_user_id from public.invitations where title='Undangan Klien Reseller'),
  '00000000-0000-0000-0000-000000000602'::uuid,'atribusi reseller terpisah dari pemilik dan pembuat');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000601',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000601","role":"authenticated","email":"phase6-owner@example.test"}',true);
select lives_ok(
  $q$select public.attribute_invitation_to_reseller(
    (select id from public.invitations where title='Undangan Fase Enam'),
    (select referral_code from public.reseller_profiles where user_id='00000000-0000-0000-0000-000000000602')
  )$q$,
  'pemilik dapat menerapkan kode referral reseller'
);
reset role;

select is((select reseller_user_id from public.invitations where title='Undangan Fase Enam'),
  '00000000-0000-0000-0000-000000000602'::uuid,'kode referral menyimpan atribusi reseller');
select * from finish();
rollback;
