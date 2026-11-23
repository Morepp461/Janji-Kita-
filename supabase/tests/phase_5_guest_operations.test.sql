begin;
select no_plan();
select has_table('public','guests','tabel tamu tersedia');
select has_table('public','rsvps','tabel RSVP tersedia');
select has_table('public','guestbook_entries','tabel buku tamu tersedia');
select has_table('public','tickets','tabel tiket tersedia');
select has_table('public','checkins','tabel check-in tersedia');
select ok((select relrowsecurity from pg_class where oid='public.guests'::regclass),'RLS tamu aktif');
select ok((select relrowsecurity from pg_class where oid='public.rsvps'::regclass),'RLS RSVP aktif');
select ok((select relrowsecurity from pg_class where oid='public.guestbook_entries'::regclass),'RLS guestbook aktif');
select ok((select relrowsecurity from pg_class where oid='public.tickets'::regclass),'RLS tiket aktif');
select ok((select relrowsecurity from pg_class where oid='public.checkins'::regclass),'RLS check-in aktif');
select ok(not has_table_privilege('anon','public.guests','select'),'anon tidak dapat membaca daftar tamu');
select ok(not has_table_privilege('anon','public.tickets','select'),'anon tidak dapat membaca tiket');
select ok(has_function_privilege('anon','public.submit_guest_rsvp(text,text,integer,jsonb)','execute'),'RPC RSVP publik tersedia');
select ok(has_function_privilege('anon','public.submit_guestbook_entry(text,text)','execute'),'RPC guestbook publik tersedia');
select ok(not has_function_privilege('anon','public.issue_guest_ticket(uuid,text)','execute'),'anon tidak dapat menerbitkan tiket');
select ok(not has_function_privilege('anon','public.check_in_ticket(text,text)','execute'),'anon tidak dapat check-in');

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000501','authenticated','authenticated','phase5-owner@example.test','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000502','authenticated','authenticated','phase5-other@example.test','',now(),'{}','{}',now(),now());

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000501',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000501","role":"authenticated"}',true);
select lives_ok($q$select public.create_invitation_draft('Undangan Operasi Tamu',(select id from public.categories order by sort_order limit 1),null)$q$,'pemilik membuat draft undangan');
reset role;
update public.invitation_versions set state='published'
where id=(select draft_version_id from public.invitations where title='Undangan Operasi Tamu');
update public.invitations set status='active',active_from=now()-interval '1 hour',active_until=now()+interval '1 day',published_version_id=draft_version_id
where title='Undangan Operasi Tamu';

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000502',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000502","role":"authenticated"}',true);
select lives_ok($q$select public.create_invitation_draft('Undangan Milik Pengguna Lain',(select id from public.categories order by sort_order limit 1),null)$q$,'pengguna kedua membuat undangan sendiri');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000501',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000501","role":"authenticated"}',true);
insert into public.guests(id,invitation_id,display_name,email,plus_one_allowed,personalized_token_hash)
select '00000000-0000-0000-0000-000000000503',id,'Tamu Fase Lima','guest@example.test',true,repeat('a',64)
from public.invitations where title='Undangan Operasi Tamu';
insert into public.guests(id,invitation_id,display_name,personalized_token_hash)
select '00000000-0000-0000-0000-000000000504',id,'Tamu Manual',repeat('c',64)
from public.invitations where title='Undangan Operasi Tamu';
select is((select count(*) from public.guests),2::bigint,'pemilik dapat membaca daftar tamu miliknya');
select throws_ok(
  $q$insert into public.guests(invitation_id,display_name)
     select id,'Tamu Tidak Sah' from public.invitations where title='Undangan Milik Pengguna Lain'$q$,
  '42501','new row violates row-level security policy for table "guests"',
  'pemilik tidak dapat menambah tamu ke undangan pengguna lain'
);

select lives_ok($q$select public.submit_guest_rsvp(repeat('a',64),'yes',2,'{"meal":"vegetarian"}'::jsonb)$q$,'tamu dapat mengirim RSVP dan plus-one');
select is((select response from public.rsvps r join public.guests g on g.id=r.guest_id where g.display_name='Tamu Fase Lima'),'yes','jawaban RSVP tersimpan');
select is((select attendee_count from public.rsvps r join public.guests g on g.id=r.guest_id where g.display_name='Tamu Fase Lima'),2,'jumlah kehadiran tersimpan');
select is((select status from public.guests where display_name='Tamu Fase Lima'),'responded','status tamu berubah setelah RSVP');

select lives_ok($q$select public.submit_guestbook_entry(repeat('a',64),'Selamat menempuh hidup baru!')$q$,'tamu dapat mengirim ucapan');
select is((select moderation_status from public.guestbook_entries limit 1),'pending','ucapan menunggu moderasi');
select lives_ok($q$select public.submit_guestbook_entry(repeat('a',64),'Ucapan kedua')$q$,'ucapan kedua diterima');
select lives_ok($q$select public.submit_guestbook_entry(repeat('a',64),'Ucapan ketiga')$q$,'ucapan ketiga diterima');
select throws_ok(
  $q$select public.submit_guestbook_entry(repeat('a',64),'Ucapan keempat')$q$,
  'P0001','Terlalu banyak pengiriman ucapan. Coba lagi nanti.',
  'rate limit guestbook mencegah spam'
);

select lives_ok($q$select public.issue_guest_ticket('00000000-0000-0000-0000-000000000503',repeat('b',64))$q$,'pemilik menerbitkan tiket');
select is((select count(*) from public.tickets where guest_id='00000000-0000-0000-0000-000000000503'),1::bigint,'satu tiket diterbitkan per tamu');
select is((select length(ticket_code) from public.tickets where guest_id='00000000-0000-0000-0000-000000000503'),12,'kode tiket acak dibuat');
select is((public.check_in_ticket(repeat('b',64))->>'status'),'checked_in','tiket valid dapat check-in');
select is((public.check_in_ticket(repeat('b',64))->>'status'),'duplicate','tiket yang sama ditolak sebagai duplikat');
select is((select count(*) from public.checkins where ticket_id=(select id from public.tickets where guest_id='00000000-0000-0000-0000-000000000503')),1::bigint,'check-in hanya tercatat sekali');
select is((select status from public.guests where id='00000000-0000-0000-0000-000000000503'),'checked_in','status tamu diperbarui');
select is((public.check_in_guest_manually('00000000-0000-0000-0000-000000000504')->>'status'),'checked_in','check-in manual tersedia');
select is((select method from public.checkins where ticket_id=(select id from public.tickets where guest_id='00000000-0000-0000-0000-000000000504')),'manual','metode manual tercatat');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000502',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000502","role":"authenticated"}',true);
select is((select count(*) from public.guests),0::bigint,'pengguna lain tidak dapat membaca tamu');
select is((select count(*) from public.rsvps),0::bigint,'pengguna lain tidak dapat membaca RSVP');
select is((select count(*) from public.guestbook_entries),0::bigint,'pengguna lain tidak dapat membaca guestbook');
select * from finish();
rollback;
