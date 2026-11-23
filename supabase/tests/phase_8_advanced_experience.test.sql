begin;
select no_plan();

select has_table('public', 'seating_tables', 'tabel meja tersedia');
select has_table('public', 'seating_assignments', 'tabel penempatan tamu tersedia');
select ok((select relrowsecurity from pg_class where oid = 'public.seating_tables'::regclass), 'RLS meja aktif');
select ok((select relrowsecurity from pg_class where oid = 'public.seating_assignments'::regclass), 'RLS penempatan aktif');
select ok(not has_table_privilege('anon', 'public.seating_tables', 'select'), 'anon tidak dapat membaca meja');
select ok(not has_table_privilege('anon', 'public.seating_assignments', 'select'), 'anon tidak dapat membaca penempatan tamu');
select ok(has_table_privilege('authenticated', 'public.seating_tables', 'select'), 'pengguna terautentikasi dapat membaca meja melalui RLS');
select ok(has_table_privilege('authenticated', 'public.seating_assignments', 'insert'), 'pengguna terautentikasi dapat mengelola penempatan melalui RLS');
select has_index('public', 'seating_tables', 'seating_tables_invitation_order_idx', 'indeks daftar meja tersedia');
select has_index('public', 'seating_assignments', 'seating_assignments_table_idx', 'indeks penempatan per meja tersedia');
select has_index('public', 'seating_assignments', 'seating_assignments_guest_idx', 'indeks penempatan per tamu tersedia');
select has_trigger('public', 'seating_assignments', 'seating_assignments_validate_capacity', 'kapasitas meja divalidasi saat penempatan');
select has_trigger('public', 'seating_tables', 'seating_tables_validate_capacity', 'kapasitas tidak dapat diturunkan di bawah jumlah tamu');
select has_trigger('public', 'seating_tables', 'seating_tables_set_updated_at', 'waktu perubahan meja diperbarui');
select has_trigger('public', 'seating_assignments', 'seating_assignments_set_updated_at', 'waktu perubahan penempatan diperbarui');
select ok(not has_function_privilege('anon', 'app_private.validate_seating_assignment()', 'execute'), 'anon tidak dapat menjalankan helper validasi');
select ok(not has_function_privilege('anon', 'app_private.validate_seating_table_capacity()', 'execute'), 'anon tidak dapat menjalankan helper kapasitas');

select * from finish();
rollback;
