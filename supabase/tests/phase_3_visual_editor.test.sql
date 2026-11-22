begin;
select plan(18);

select ok(has_function_privilege('authenticated', 'public.save_invitation_draft(uuid,timestamp with time zone,text,jsonb)', 'execute'), 'pengguna terautentikasi dapat menyimpan draft melalui RPC');
select ok(not has_function_privilege('anon', 'public.save_invitation_draft(uuid,timestamp with time zone,text,jsonb)', 'execute'), 'pengunjung publik tidak dapat menyimpan draft');
select ok(exists (
  select 1 from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'save_invitation_draft'
    and p.prosecdef = false
), 'RPC penyimpanan berjalan dengan hak pemanggil');
select ok(exists (
  select 1 from pg_policies
  where schemaname = 'public' and tablename = 'media_assets'
    and policyname = 'media_assets_owner_insert'
), 'unggahan metadata aset dibatasi untuk pemilik');
select ok(exists (
  select 1 from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname = 'private_upload_owner_insert'
), 'unggahan objek tetap dibatasi folder pemilik');
select ok((select relrowsecurity from pg_class where oid = 'public.invitations'::regclass), 'RLS undangan tetap aktif');
select ok((select relrowsecurity from pg_class where oid = 'public.invitation_versions'::regclass), 'RLS versi undangan tetap aktif');
select ok(not has_table_privilege('anon', 'public.invitations', 'update'), 'anon tidak dapat mengubah undangan');
select ok(not has_table_privilege('anon', 'public.invitation_versions', 'update'), 'anon tidak dapat mengubah versi undangan');
select ok(not has_table_privilege('anon', 'public.media_assets', 'insert'), 'anon tidak dapat mendaftarkan aset');
select ok(has_table_privilege('authenticated', 'public.media_assets', 'insert'), 'pengguna memiliki grant insert metadata aset');
select ok(not exists (select 1 from aclexplode(coalesce((select proacl from pg_proc where oid = 'public.save_invitation_draft(uuid,timestamp with time zone,text,jsonb)'::regprocedure), '{}'::aclitem[])) acl where grantee = 0 and privilege_type = 'EXECUTE'), 'hak eksekusi PUBLIC dicabut');
select ok(exists (
  select 1 from pg_trigger
  where tgname = 'invitation_versions_immutable'
    and not tgisinternal
), 'perlindungan versi terbit tetap aktif');


insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000301', 'authenticated', 'authenticated',
  'phase3-editor@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000301', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000301","role":"authenticated"}', true);
select lives_ok(
  $phase3$select public.create_invitation_draft(
    'Draft editor fase 3',
    (select id from public.categories order by sort_order limit 1),
    null
  )$phase3$,
  'pemilik dapat membuat draft untuk editor'
);
select set_config(
  'test.phase3_original_updated_at',
  (select updated_at::text from public.invitations where title = 'Draft editor fase 3'),
  true
);
select lives_ok(
  $phase3$select public.save_invitation_draft(
    (select id from public.invitations where title = 'Draft editor fase 3'),
    (select updated_at from public.invitations where title = 'Draft editor fase 3'),
    'Draft editor tersimpan',
    '{"schemaVersion":1,"pages":[{"id":"page-1","sections":[]}]}'::jsonb
  )$phase3$,
  'pemilik dapat menyimpan dokumen draft'
);
select is(
  (select title from public.invitations where title = 'Draft editor tersimpan'),
  'Draft editor tersimpan',
  'judul draft diperbarui saat autosave'
);
select throws_ok(
  $phase3$select public.save_invitation_draft(
    (select id from public.invitations where title = 'Draft editor tersimpan'),
    current_setting('test.phase3_original_updated_at')::timestamptz - interval '1 second',
    'Simpan konflik',
    '{"schemaVersion":1,"pages":[]}'::jsonb
  )$phase3$,
  '40001',
  'Konflik penyuntingan: draft telah berubah di perangkat lain',
  'autosave menolak versi dasar yang kedaluwarsa'
);
reset role;

select * from finish();
rollback;
