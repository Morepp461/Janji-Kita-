begin;
select plan(13);

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
select ok(not has_function_privilege('public', 'public.save_invitation_draft(uuid,timestamp with time zone,text,jsonb)', 'execute'), 'hak eksekusi publik dicabut');
select ok(exists (
  select 1 from pg_trigger
  where tgname = 'invitation_versions_immutable'
    and not tgisinternal
), 'perlindungan versi terbit tetap aktif');

select * from finish();
rollback;
