begin;
select plan(22);

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
select ok(not has_function_privilege('anon', 'public.has_permission(text)', 'execute'), 'helper izin tidak dapat dipanggil melalui API publik');
select ok(not has_function_privilege('anon', 'public.handle_new_auth_user()', 'execute'), 'trigger pembuatan profil tidak dapat dipanggil publik');
select ok(not has_function_privilege('authenticated', 'public.write_admin_audit_log()', 'execute'), 'trigger audit tidak dapat dipanggil sebagai RPC');
select ok(has_function_privilege('authenticated', 'public.admin_set_user_role(uuid,text,text)', 'execute'), 'RPC pengelolaan peran tersedia untuk autentikasi');
select * from finish();
rollback;
