begin;
select no_plan();

select has_table('public', 'guests', 'tabel tamu tersedia');
select has_table('public', 'rsvps', 'tabel RSVP tersedia');
select has_table('public', 'guestbook_entries', 'tabel buku tamu tersedia');
select has_table('public', 'tickets', 'tabel tiket tersedia');
select has_table('public', 'checkins', 'tabel check-in tersedia');
select ok((select relrowsecurity from pg_class where oid = 'public.guests'::regclass), 'RLS tamu aktif');
select ok((select relrowsecurity from pg_class where oid = 'public.rsvps'::regclass), 'RLS RSVP aktif');
select ok((select relrowsecurity from pg_class where oid = 'public.guestbook_entries'::regclass), 'RLS buku tamu aktif');
select ok((select relrowsecurity from pg_class where oid = 'public.tickets'::regclass), 'RLS tiket aktif');
select ok((select relrowsecurity from pg_class where oid = 'public.checkins'::regclass), 'RLS check-in aktif');
select ok(not has_table_privilege('anon', 'public.guests', 'select'), 'anon tidak dapat membaca daftar tamu');
select ok(not has_table_privilege('anon', 'public.tickets', 'select'), 'anon tidak dapat membaca token tiket');
select ok(has_function_privilege('anon', 'public.submit_guest_rsvp(text,text,integer,jsonb)', 'execute'), 'RPC RSVP publik tersedia');
select ok(has_function_privilege('anon', 'public.submit_guestbook_entry(text,text)', 'execute'), 'RPC buku tamu publik tersedia');
select ok(not has_function_privilege('anon', 'public.issue_guest_ticket(uuid,text)', 'execute'), 'anon tidak dapat menerbitkan tiket');
select ok(not has_function_privilege('anon', 'public.check_in_ticket(text,text)', 'execute'), 'anon tidak dapat melakukan check-in');

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000501', 'authenticated', 'authenticated',
  'phase5-guest-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
), (
  '00000000-0000-0000-0000-000000000502', 'authenticated', 'authenticated',
  'phase5-other-user@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000501', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000501","role":"authenticated"}', true);

select lives_ok(
  $phase5$select public.create_invitation_draft(
    'Undangan Operasi Tamu',
    (select id from public.categories order by sort_order limit 1),
    null
  )$phase5$,
  'pemilik dapat membuat draft undangan untuk operasi tamu'
);
reset role;
update public.invitation_versions
set state = 'published'
where id = (select draft_version_id from public.invitations where title = 'Undangan Operasi Tamu');
update public.invitations
set status = 'active', active_from = now() - interval '1 hour',
    active_until = now() + interval '1 day',
    published_version_id = draft_version_id
where title = 'Undangan Operasi Tamu';

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000501', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000501","role":"authenticated"}', true);

insert into public.guests(id, invitation_id, display_name, email, plus_one_allowed, personalized_token_hash)
select '00000000-0000-0000-0000-000000000503', id, 'Tamu Fase Lima', 'guest@example.test', true,
  'personal-token-hash-phase5'
from public.invitations where title = 'Undangan Operasi Tamu';
insert into public.guests(id, invitation_id, display_name, personalized_token_hash)
select '00000000-0000-0000-0000-000000000504', id, 'Tamu Manual', 'personal-token-hash-manual'
from public.invitations where title = 'Undangan Operasi Tamu';

select is((select count(*) from public.guests), 2::bigint, 'pemilik dapat membaca daftar tamu miliknya');
select throws_ok(
  $phase5$insert into public.guests(invitation_id, display_name)
    select id, 'Tamu Tidak Sah' from public.invitations where title = 'Undangan Operasi Tamu'$phase5$,
  'pemilik dapat menambah tamu hanya untuk undangan sendiri',
  'uji kebijakan insert tamu'
);

select lives_ok(
  $phase5$select public.submit_guest_rsvp('personal-token-hash-phase5', 'yes', 2, '{"meal":"vegetarian"}'::jsonb)$phase5$,
  'tamu personal dapat mengirim RSVP dan plus-one yang diizinkan'
);
select is((select response from public.rsvps r join public.guests g on g.id = r.guest_id where g.display_name = 'Tamu Fase Lima'), 'yes', 'jawaban RSVP tersimpan');
select is((select attendee_count from public.rsvps r join public.guests g on g.id = r.guest_id where g.display_name = 'Tamu Fase Lima'), 2, 'jumlah kehadiran tersimpan');
select is((select status from public.guests where display_name = 'Tamu Fase Lima'), 'responded', 'status tamu berubah setelah RSVP');

select lives_ok(
  $phase5$select public.submit_guestbook_entry('personal-token-hash-phase5', 'Selamat menempuh hidup baru!')$phase5$,
  'tamu personal dapat mengirim ucapan'
);
select is((select moderation_status from public.guestbook_entries limit 1), 'pending', 'ucapan menunggu moderasi sebelum publik');
select throws_ok(
  $phase5$select public.submit_guestbook_entry('personal-token-hash-phase5', 'Ucapan keempat')$phase5$,
  'batas pengiriman guestbook per token diberlakukan',
  'rate limit guestbook mencegah spam'
);

select lives_ok(
  $phase5$select public.issue_guest_ticket('00000000-0000-0000-0000-000000000503', 'ticket-token-hash-phase5')$phase5$,
  'pemilik dapat menerbitkan tiket dengan token hash'
);
select is((select count(*) from public.tickets where guest_id = '00000000-0000-0000-0000-000000000503'), 1::bigint, 'satu tiket diterbitkan per tamu');
select is((select length(ticket_code) from public.tickets where guest_id = '00000000-0000-0000-0000-000000000503'), 12, 'kode tiket acak dibuat');
select is((public.check_in_ticket('ticket-token-hash-phase5')->>'status'), 'checked_in', 'tiket valid dapat check-in');
select is((public.check_in_ticket('ticket-token-hash-phase5')->>'status'), 'duplicate', 'tiket yang sama ditolak sebagai duplikat');
select is((select count(*) from public.checkins where ticket_id = (select id from public.tickets where guest_id = '00000000-0000-0000-0000-000000000503')), 1::bigint, 'check-in hanya tercatat satu kali');
select is((select status from public.guests where id = '00000000-0000-0000-0000-000000000503'), 'checked_in', 'status tamu diperbarui setelah check-in');

select is((public.check_in_guest_manually('00000000-0000-0000-0000-000000000504')->>'status'), 'checked_in', 'check-in manual tersedia sebagai fallback');
select is((select method from public.checkins where ticket_id = (select id from public.tickets where guest_id = '00000000-0000-0000-0000-000000000504')), 'manual', 'metode check-in manual dicatat');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000502', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000502","role":"authenticated"}', true);
select is((select count(*) from public.guests), 0::bigint, 'pengguna lain tidak dapat membaca daftar tamu');
select is((select count(*) from public.rsvps), 0::bigint, 'pengguna lain tidak dapat membaca RSVP');
select is((select count(*) from public.guestbook_entries), 0::bigint, 'pengguna lain tidak dapat membaca buku tamu');
select * from finish();
rollback;
