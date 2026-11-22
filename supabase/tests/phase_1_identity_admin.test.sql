begin;
select plan(27);

select has_table('public', 'profiles', 'tabel profil tersedia');
select has_table('public', 'user_roles', 'tabel peran tersedia');
select has_table('public', 'role_permissions', 'tabel izin tersedia');
select has_table('public', 'categories', 'tabel kategori tersedia');
select has_table('public', 'design_styles', 'tabel gaya tersedia');
select has_table('public', 'feature_flags', 'tabel feature flags tersedia');
select has_table('public', 'audit_logs', 'tabel audit tersedia');

select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'RLS profil aktif');
select ok((select relrowsecurity from pg_class where oid = 'public.user_roles'::regclass), 'RLS peran aktif');
select ok((select relrowsecurity from pg_class where oid = 'public.role_permissions'::regclass), 'RLS izin aktif');
select ok((select relrowsecurity from pg_class where oid = 'public.categories'::regclass), 'RLS kategori aktif');
select ok((select relrowsecurity from pg_class where oid = 'public.design_styles'::regclass), 'RLS gaya aktif');
select ok((select relrowsecurity from pg_class where oid = 'public.feature_flags'::regclass), 'RLS feature flags aktif');
select ok((select relrowsecurity from pg_class where oid = 'public.audit_logs'::regclass), 'RLS audit aktif');

select ok((select count(*) >= 8 from public.categories), 'kategori awal sesuai PRD tersedia');
select ok((select count(*) >= 10 from public.design_styles), 'gaya awal sesuai PRD tersedia');
select ok(not has_table_privilege('anon', 'public.audit_logs', 'select'), 'pengunjung publik tidak dapat membaca audit');
select ok(not has_table_privilege('authenticated', 'public.user_roles', 'insert'), 'pengguna tidak dapat menetapkan peran langsung');
select ok(to_regprocedure('public.has_permission(text)') is null, 'helper izin tidak diekspos sebagai RPC publik');
select ok(not has_function_privilege('anon', 'public.handle_new_auth_user()', 'execute'), 'trigger pembuatan profil tidak dapat dipanggil publik');
select ok(not has_function_privilege('authenticated', 'public.write_admin_audit_log()', 'execute'), 'trigger audit tidak dapat dipanggil sebagai RPC');
select ok(has_function_privilege('authenticated', 'public.admin_set_user_role(uuid,text,text)', 'execute'), 'RPC pengelolaan peran tersedia untuk autentikasi');
insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000101', 'authenticated', 'authenticated',
   'phase1-user-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000102', 'authenticated', 'authenticated',
   'phase1-user-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000101","role":"authenticated"}', true);
select is((select count(*) from public.profiles), 1::bigint, 'pengguna hanya membaca profil sendiri');
select is((select count(*) from public.user_roles), 1::bigint, 'pengguna hanya membaca peran sendiri');
select is(public.has_permission('admin.access'), false, 'akun biasa tidak memiliki izin admin');
select ok(has_schema_privilege('authenticated', 'app_private', 'USAGE'), 'schema internal hanya digunakan oleh peran terautentikasi');
select is((select count(*) from public.audit_logs), 0::bigint, 'pengguna biasa tidak dapat membaca audit log');
reset role;

select * from finish();
rollback;
