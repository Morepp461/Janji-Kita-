begin;
select plan(30);

select has_table('public', 'templates', 'tabel template tersedia');
select has_table('public', 'template_versions', 'tabel versi template tersedia');
select has_table('public', 'media_assets', 'tabel aset media tersedia');
select has_table('public', 'invitations', 'tabel undangan tersedia');
select has_table('public', 'invitation_versions', 'tabel versi undangan tersedia');

select ok((select relrowsecurity from pg_class where oid = 'public.templates'::regclass), 'RLS template aktif');
select ok((select relrowsecurity from pg_class where oid = 'public.template_versions'::regclass), 'RLS versi template aktif');
select ok((select relrowsecurity from pg_class where oid = 'public.media_assets'::regclass), 'RLS aset media aktif');
select ok((select relrowsecurity from pg_class where oid = 'public.invitations'::regclass), 'RLS undangan aktif');
select ok((select relrowsecurity from pg_class where oid = 'public.invitation_versions'::regclass), 'RLS versi undangan aktif');

select ok(not has_table_privilege('anon', 'public.invitations', 'select'), 'pengunjung publik tidak dapat membaca tabel undangan');
select ok(not has_table_privilege('anon', 'public.invitation_versions', 'select'), 'pengunjung publik tidak dapat membaca versi draft');
select ok(not has_table_privilege('anon', 'public.media_assets', 'select'), 'pengunjung publik tidak dapat membaca seluruh metadata aset');
select ok(has_column_privilege('anon', 'public.media_assets', 'object_path', 'select'), 'pengunjung publik hanya membaca lokasi aset yang diizinkan');
select ok(not has_column_privilege('anon', 'public.media_assets', 'owner_user_id', 'select'), 'pengunjung publik tidak dapat membaca pemilik aset');
select has_view('public', 'published_invitations', 'view renderer publik tersedia');
select ok(has_table_privilege('anon', 'public.published_invitations', 'select'), 'pengunjung publik dapat membaca view renderer');
select ok(has_column_privilege('anon', 'public.invitations', 'slug', 'select'), 'pengunjung publik dapat membaca slug undangan aktif');
select ok(not has_column_privilege('anon', 'public.invitations', 'owner_user_id', 'select'), 'pengunjung publik tidak dapat membaca pemilik undangan');
select ok(has_column_privilege('anon', 'public.invitation_versions', 'document', 'select'), 'pengunjung publik dapat membaca dokumen versi terbit');
select ok(has_function_privilege('authenticated', 'public.create_invitation_draft(text,uuid,uuid)', 'execute'), 'RPC pembuatan draft tersedia');
select ok(not has_function_privilege('anon', 'public.create_invitation_draft(text,uuid,uuid)', 'execute'), 'pengunjung publik tidak dapat membuat draft');
select ok(has_function_privilege('authenticated', 'public.admin_create_template(text,text,text,uuid,uuid,bigint,jsonb,uuid)', 'execute'), 'RPC pembuatan template tersedia');
select ok(not has_function_privilege('anon', 'public.admin_create_template(text,text,text,uuid,uuid,bigint,jsonb,uuid)', 'execute'), 'pengunjung publik tidak dapat membuat template');
select ok(exists (select 1 from storage.buckets where id = 'template-assets' and public), 'bucket aset template publik tersedia');
select ok(exists (select 1 from storage.buckets where id = 'user-uploads-private' and not public), 'bucket unggahan pengguna bersifat privat');


insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000201', 'authenticated', 'authenticated',
  'phase2-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000201', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000201","role":"authenticated"}', true);
select lives_ok(
  $phase2$select public.create_invitation_draft(
    'Draft fase 2',
    (select id from public.categories order by sort_order limit 1),
    null
  )$phase2$,
  'pengguna dapat membuat draft dari kanvas kosong'
);
reset role;

with new_invitation as (
  insert into public.invitations (
    owner_user_id, created_by, title, event_category_id, status
  )
  values (
    '00000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000201',
    'Undangan terbit untuk pengujian',
    (select id from public.categories order by sort_order limit 1),
    'draft'
  )
  returning id
),
new_version as (
  insert into public.invitation_versions (
    invitation_id, version_no, schema_version, document, state, created_by
  )
  select
    id, 1, 1,
    '{"schemaVersion":1,"pages":[]}'::jsonb,
    'published',
    '00000000-0000-0000-0000-000000000201'
  from new_invitation
  returning id, invitation_id
)
update public.invitations i
set status = 'active',
    slug = 'phase2-active-smoke-test',
    active_from = now() - interval '1 hour',
    active_until = now() + interval '1 hour',
    published_version_id = v.id
from new_version v
where i.id = v.invitation_id;

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(
  (select count(*) from public.published_invitations),
  1::bigint,
  'renderer publik hanya menampilkan undangan aktif, bukan draft'
);
select is(
  (select count(slug) from public.invitations),
  1::bigint,
  'RLS publik menyembunyikan baris draft'
);
select is(
  (select count(document) from public.invitation_versions),
  1::bigint,
  'RLS publik hanya menampilkan versi terbit yang sedang aktif'
);
reset role;

select * from finish();
rollback;
