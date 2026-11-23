begin;
select no_plan();

select has_table('public', 'locales', 'tabel bahasa tersedia');
select has_table('public', 'system_settings', 'tabel pengaturan sistem tersedia');
select has_table('public', 'consent_records', 'tabel persetujuan marketplace tersedia');
select has_table('public', 'analytics_events', 'tabel peristiwa analitik tersedia');
select has_column('public', 'templates', 'source_invitation_id', 'template menyimpan sumber undangan');
select has_column('public', 'templates', 'source_consent_id', 'template menyimpan referensi persetujuan');
select has_column('public', 'templates', 'source_type', 'template membedakan desain first-party dan pelanggan');

select ok((select relrowsecurity from pg_class where oid = 'public.locales'::regclass), 'RLS bahasa aktif');
select ok((select relrowsecurity from pg_class where oid = 'public.system_settings'::regclass), 'RLS pengaturan sistem aktif');
select ok((select relrowsecurity from pg_class where oid = 'public.consent_records'::regclass), 'RLS persetujuan aktif');
select ok((select relrowsecurity from pg_class where oid = 'public.analytics_events'::regclass), 'RLS analitik aktif');

select ok(has_table_privilege('anon', 'public.locales', 'select'), 'publik hanya dapat membaca daftar bahasa aktif melalui RLS');
select ok(not has_table_privilege('anon', 'public.system_settings', 'select'), 'anon tidak dapat membaca pengaturan internal');
select ok(not has_table_privilege('anon', 'public.consent_records', 'select'), 'anon tidak dapat membaca persetujuan');
select ok(has_column_privilege('authenticated', 'public.consent_records', 'id', 'select'), 'pemilik dapat membaca kolom riwayat persetujuan');
select ok(not has_column_privilege('authenticated', 'public.consent_records', 'metadata', 'select'), 'metadata moderasi hanya dapat dibaca admin melalui RPC');
select ok(not has_table_privilege('anon', 'public.analytics_events', 'select'), 'anon tidak dapat membaca peristiwa analitik');
select ok(not has_table_privilege('authenticated', 'public.system_settings', 'update'), 'pengaturan sistem hanya dapat diubah melalui RPC tervalidasi');
select ok(not has_table_privilege('authenticated', 'public.locales', 'update'), 'katalog bahasa hanya dapat diubah melalui RPC tervalidasi');
select ok(not has_table_privilege('authenticated', 'public.templates', 'insert'), 'template tidak dapat dibuat langsung melalui REST');
select ok(not has_table_privilege('authenticated', 'public.templates', 'update'), 'moderasi template hanya dapat dilakukan melalui RPC');
select ok(not has_table_privilege('authenticated', 'public.template_versions', 'insert'), 'versi template hanya dapat dibuat melalui RPC');

select ok(has_function_privilege('anon', 'public.get_public_localization_config()', 'execute'), 'konfigurasi lokalisasi publik tersedia');
select ok(not has_function_privilege('anon', 'public.record_marketplace_consent(uuid,uuid,text)', 'execute'), 'anon tidak dapat memberi persetujuan');
select ok(has_function_privilege('authenticated', 'public.record_marketplace_consent(uuid,uuid,text)', 'execute'), 'pengguna terautentikasi dapat memberi persetujuan melalui RPC');
select ok(has_function_privilege('authenticated', 'public.withdraw_marketplace_consent(uuid)', 'execute'), 'pemilik dapat mencabut persetujuan melalui RPC');
select ok(has_function_privilege('authenticated', 'public.admin_review_marketplace_consent(uuid,text,text)', 'execute'), 'RPC moderasi persetujuan tersedia');
select ok(has_function_privilege('authenticated', 'public.admin_list_marketplace_consents()', 'execute'), 'RPC daftar persetujuan admin tersedia');
select ok(not has_function_privilege('anon', 'public.admin_list_marketplace_consents()', 'execute'), 'anon tidak dapat membaca daftar persetujuan admin');
select ok(has_function_privilege('authenticated', 'public.admin_set_template_moderation(uuid,text,text)', 'execute'), 'RPC moderasi template tersedia');
select ok(has_function_privilege('authenticated', 'public.admin_link_template_consent(uuid,uuid,uuid)', 'execute'), 'RPC penautan persetujuan ke template tersedia');
select ok(not has_function_privilege('anon', 'public.admin_link_template_consent(uuid,uuid,uuid)', 'execute'), 'anon tidak dapat menautkan persetujuan ke template');
select ok(has_function_privilege('authenticated', 'public.admin_create_template(text,text,text,uuid,uuid,bigint,jsonb,uuid)', 'execute'), 'signature lama pembuatan template tetap kompatibel');
select ok(has_function_privilege('authenticated', 'public.admin_get_analytics_summary(integer)', 'execute'), 'RPC ringkasan analitik tersedia');
select ok(has_function_privilege('authenticated', 'public.track_analytics_event(text,uuid,jsonb)', 'execute'), 'RPC pencatatan analitik tersedia');
select ok(has_function_privilege('authenticated', 'public.update_invitation_localization(uuid,text,text)', 'execute'), 'RPC lokalisasi undangan tersedia');
select ok(has_function_privilege('authenticated', 'public.admin_set_locale_active(text,boolean)', 'execute'), 'RPC pengaktifan bahasa tersedia');
select ok(has_function_privilege('authenticated', 'public.admin_update_timezone_options(jsonb)', 'execute'), 'RPC pembaruan zona waktu tersedia');

select is((select count(*)::integer from public.locales where is_active), 2, 'dua bahasa awal aktif');
select is((select count(*)::integer from public.locales where is_default), 1, 'tepat satu bahasa bawaan');
select ok(exists(select 1 from public.role_permissions where role = 'admin' and permission_key = 'analytics.read'), 'admin memiliki izin analitik');
select ok(exists(select 1 from public.role_permissions where role = 'admin' and permission_key = 'consent.manage'), 'admin memiliki izin moderasi persetujuan');
select ok(exists(select 1 from public.role_permissions where role = 'super_admin' and permission_key = 'locales.manage'), 'super admin memiliki izin lokalisasi');
select has_trigger('public', 'profiles', 'profiles_validate_localization', 'preferensi akun divalidasi');
select has_trigger('public', 'invitations', 'invitations_validate_localization', 'preferensi undangan divalidasi');
select has_trigger('public', 'media_assets', 'media_assets_audit_phase7', 'perubahan status media diaudit');

select * from finish();
rollback;
