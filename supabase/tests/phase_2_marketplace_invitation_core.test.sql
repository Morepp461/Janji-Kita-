begin;
select plan(23);

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

select * from finish();
rollback;
