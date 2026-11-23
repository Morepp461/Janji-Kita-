-- Fase 5: pengelolaan tamu, RSVP, guestbook, tiket QR, dan check-in.

create table public.guests (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.invitations(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 120),
  email text,
  phone text,
  guest_group text,
  plus_one_allowed boolean not null default false,
  personalized_token_hash text unique check (personalized_token_hash is null or personalized_token_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'invited' check (status in ('invited','viewed','responded','checked_in')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index guests_invitation_email_unique
  on public.guests(invitation_id, lower(email))
  where email is not null and trim(email) <> '';
create unique index guests_invitation_phone_unique
  on public.guests(invitation_id, regexp_replace(phone, '[^0-9]', '', 'g'))
  where phone is not null and regexp_replace(phone, '[^0-9]', '', 'g') <> '';
create index guests_invitation_name_idx on public.guests(invitation_id, display_name);
create index guests_invitation_status_idx on public.guests(invitation_id, status);

create table public.rsvps (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.invitations(id) on delete cascade,
  guest_id uuid not null unique references public.guests(id) on delete cascade,
  response text not null check (response in ('yes','no','maybe')),
  attendee_count integer not null default 0 check (attendee_count between 0 and 2),
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  responded_at timestamptz not null default now(),
  source text not null default 'personalized_link',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index rsvps_invitation_response_idx on public.rsvps(invitation_id, response);
create index rsvps_guest_responded_idx on public.rsvps(guest_id, responded_at desc);

create table public.guestbook_entries (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.invitations(id) on delete cascade,
  guest_id uuid references public.guests(id) on delete set null,
  display_name text not null check (length(trim(display_name)) between 1 and 120),
  message text not null check (length(trim(message)) between 1 and 500),
  moderation_status text not null default 'pending' check (moderation_status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  moderated_by uuid references public.profiles(id) on delete set null,
  moderated_at timestamptz
);
create index guestbook_moderation_idx on public.guestbook_entries(invitation_id, moderation_status, created_at desc);

create or replace function public.set_guestbook_moderation_metadata()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $
begin
  if new.moderation_status is distinct from old.moderation_status then
    new.moderated_by := (select auth.uid());
    new.moderated_at := now();
  end if;
  return new;
end;
$;
create trigger guestbook_moderation_metadata
  before update on public.guestbook_entries
  for each row execute function public.set_guestbook_moderation_metadata();



create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.invitations(id) on delete cascade,
  guest_id uuid not null unique references public.guests(id) on delete cascade,
  ticket_code text not null unique default upper(encode(extensions.gen_random_bytes(6), 'hex')),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'valid' check (status in ('valid','used','revoked')),
  issued_at timestamptz not null default now(),
  used_at timestamptz
);
create index tickets_invitation_status_idx on public.tickets(invitation_id, status);

create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null unique references public.tickets(id) on delete cascade,
  invitation_id uuid not null references public.invitations(id) on delete cascade,
  checked_in_by uuid references public.profiles(id) on delete set null,
  checked_in_at timestamptz not null default now(),
  method text not null check (method in ('qr','manual')),
  device_label text
);
create index checkins_invitation_time_idx on public.checkins(invitation_id, checked_in_at desc);

create table public.guest_public_rate_limits (
  token_hash text not null check (token_hash ~ '^[a-f0-9]{64}$'),
  action text not null check (action in ('rsvp','guestbook')),
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0,
  primary key (token_hash, action)
);
alter table public.guest_public_rate_limits enable row level security;

create trigger guests_set_updated_at before update on public.guests
  for each row execute function public.set_updated_at();
create trigger rsvps_set_updated_at before update on public.rsvps
  for each row execute function public.set_updated_at();

alter table public.guests enable row level security;
alter table public.rsvps enable row level security;
alter table public.guestbook_entries enable row level security;
alter table public.tickets enable row level security;
alter table public.checkins enable row level security;

create policy guests_owner_select on public.guests for select to authenticated
  using (exists (select 1 from public.invitations i where i.id = invitation_id and i.owner_user_id = (select auth.uid())));
create policy guests_owner_insert on public.guests for insert to authenticated
  with check (exists (select 1 from public.invitations i where i.id = invitation_id and i.owner_user_id = (select auth.uid())));
create policy guests_owner_update on public.guests for update to authenticated
  using (exists (select 1 from public.invitations i where i.id = invitation_id and i.owner_user_id = (select auth.uid())))
  with check (exists (select 1 from public.invitations i where i.id = invitation_id and i.owner_user_id = (select auth.uid())));
create policy guests_owner_delete on public.guests for delete to authenticated
  using (exists (select 1 from public.invitations i where i.id = invitation_id and i.owner_user_id = (select auth.uid())));

create policy rsvps_owner_select on public.rsvps for select to authenticated
  using (exists (select 1 from public.invitations i where i.id = invitation_id and i.owner_user_id = (select auth.uid())));
create policy guestbook_owner_select on public.guestbook_entries for select to authenticated
  using (exists (select 1 from public.invitations i where i.id = invitation_id and i.owner_user_id = (select auth.uid())));
create policy guestbook_owner_moderate on public.guestbook_entries for update to authenticated
  using (exists (select 1 from public.invitations i where i.id = invitation_id and i.owner_user_id = (select auth.uid())))
  with check (exists (select 1 from public.invitations i where i.id = invitation_id and i.owner_user_id = (select auth.uid())));
create policy guestbook_owner_delete on public.guestbook_entries for delete to authenticated
  using (exists (select 1 from public.invitations i where i.id = invitation_id and i.owner_user_id = (select auth.uid())));
create policy tickets_owner_select on public.tickets for select to authenticated
  using (exists (select 1 from public.invitations i where i.id = invitation_id and i.owner_user_id = (select auth.uid())));
create policy checkins_owner_select on public.checkins for select to authenticated
  using (exists (select 1 from public.invitations i where i.id = invitation_id and i.owner_user_id = (select auth.uid())));

revoke all on public.guests, public.rsvps, public.guestbook_entries, public.tickets, public.checkins, public.guest_public_rate_limits from anon, public, authenticated;
grant select, insert, update, delete on public.guests to authenticated;
grant select on public.rsvps to authenticated;
grant select, update, delete on public.guestbook_entries to authenticated;
grant select on public.tickets, public.checkins to authenticated;

create or replace function public.consume_guest_rate_limit(p_token_hash text, p_action text, p_max integer)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_count integer;
begin
  insert into public.guest_public_rate_limits(token_hash, action, window_started_at, request_count)
  values (p_token_hash, p_action, now(), 1)
  on conflict (token_hash, action) do update
    set window_started_at = case
          when public.guest_public_rate_limits.window_started_at < now() - interval '1 hour' then now()
          else public.guest_public_rate_limits.window_started_at end,
        request_count = case
          when public.guest_public_rate_limits.window_started_at < now() - interval '1 hour' then 1
          else public.guest_public_rate_limits.request_count + 1 end
  returning request_count into current_count;
  return current_count <= p_max;
end;
$$;
revoke all on function public.consume_guest_rate_limit(text,text,integer) from public, anon, authenticated;

create or replace function public.mark_guest_viewed(p_token_hash text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    return false;
  end if;
  update public.guests g
  set status = 'viewed'
  from public.invitations i
  where i.id = g.invitation_id and g.personalized_token_hash = p_token_hash
    and g.status = 'invited' and i.status = 'active'
    and i.published_version_id is not null
    and i.active_from <= now() and i.active_until > now();
  return found;
end;
$$;

create or replace function public.submit_guest_rsvp(
  p_token_hash text,
  p_response text,
  p_attendee_count integer,
  p_answers jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  guest_row public.guests%rowtype;
  invitation_row public.invitations%rowtype;
  saved_rsvp public.rsvps%rowtype;
begin
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$'
     or p_response not in ('yes','no','maybe')
     or p_attendee_count < 0 or p_attendee_count > 2
     or jsonb_typeof(coalesce(p_answers, '{}'::jsonb)) <> 'object' then
    raise exception 'Data RSVP tidak valid';
  end if;
  select g.* into guest_row
  from public.guests g
  where g.personalized_token_hash = p_token_hash
  for update;
  if not found then raise exception 'Tautan tamu tidak valid'; end if;
  select i.* into invitation_row from public.invitations i
  where i.id = guest_row.invitation_id and i.status = 'active'
    and i.published_version_id is not null
    and i.active_from <= now() and i.active_until > now();
  if not found then raise exception 'Undangan tidak aktif'; end if;
  if p_attendee_count > case when guest_row.plus_one_allowed then 2 else 1 end then
    raise exception 'Jumlah kehadiran melebihi izin tamu';
  end if;
  if not public.consume_guest_rate_limit(p_token_hash, 'rsvp', 5) then
    raise exception 'Terlalu banyak perubahan RSVP. Coba lagi nanti.';
  end if;
  insert into public.rsvps(invitation_id, guest_id, response, attendee_count, answers, responded_at)
  values (guest_row.invitation_id, guest_row.id, p_response, p_attendee_count, coalesce(p_answers, '{}'::jsonb), now())
  on conflict (guest_id) do update set response = excluded.response,
    attendee_count = excluded.attendee_count, answers = excluded.answers,
    responded_at = now(), updated_at = now()
  returning * into saved_rsvp;
  update public.guests set status = 'responded' where id = guest_row.id;
  return jsonb_build_object('id', saved_rsvp.id, 'response', saved_rsvp.response, 'attendee_count', saved_rsvp.attendee_count);
end;
$$;

create or replace function public.submit_guestbook_entry(p_token_hash text, p_message text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  guest_row public.guests%rowtype;
  entry_id uuid;
begin
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Tautan tamu tidak valid';
  end if;
  if length(trim(coalesce(p_message, ''))) not between 1 and 500 then
    raise exception 'Pesan harus berisi 1 sampai 500 karakter';
  end if;
  select g.* into guest_row from public.guests g
  join public.invitations i on i.id = g.invitation_id
  where g.personalized_token_hash = p_token_hash and i.status = 'active'
    and i.published_version_id is not null and i.active_from <= now() and i.active_until > now();
  if not found then raise exception 'Tautan tamu tidak valid atau undangan tidak aktif'; end if;
  if not public.consume_guest_rate_limit(p_token_hash, 'guestbook', 3) then
    raise exception 'Batas pengiriman ucapan tercapai. Coba lagi nanti.';
  end if;
  insert into public.guestbook_entries(invitation_id, guest_id, display_name, message, moderation_status)
  values (guest_row.invitation_id, guest_row.id, guest_row.display_name, trim(p_message), 'pending')
  returning id into entry_id;
  return entry_id;
end;
$$;

create or replace function public.get_public_guestbook(p_slug text)
returns table(display_name text, message text, created_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.display_name, e.message, e.created_at
  from public.guestbook_entries e
  join public.invitations i on i.id = e.invitation_id
  where i.slug = p_slug and i.status = 'active'
    and i.published_version_id is not null
    and i.active_from <= now() and i.active_until > now()
    and e.moderation_status = 'approved'
  order by e.created_at desc
  limit 50;
$$;

create or replace function public.issue_guest_ticket(p_guest_id uuid, p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  guest_row public.guests%rowtype;
  ticket_row public.tickets%rowtype;
begin
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Token tiket tidak valid';
  end if;
  select g.* into guest_row
  from public.guests g
  join public.invitations i on i.id = g.invitation_id
  where g.id = p_guest_id and i.owner_user_id = (select auth.uid())
    and i.status = 'active' and i.active_from <= now() and i.active_until > now();
  if not found then raise exception 'Tamu atau undangan tidak dapat menerbitkan tiket'; end if;
  select * into ticket_row from public.tickets where guest_id = guest_row.id for update;
  if found and ticket_row.status = 'used' then
    raise exception 'Tiket sudah digunakan dan tidak dapat diterbitkan ulang';
  end if;
  insert into public.tickets(invitation_id, guest_id, token_hash)
  values (guest_row.invitation_id, guest_row.id, p_token_hash)
  on conflict (guest_id) do update set token_hash = excluded.token_hash,
    ticket_code = upper(encode(extensions.gen_random_bytes(6), 'hex')),
    status = 'valid', issued_at = now(), used_at = null
  returning * into ticket_row;
  return jsonb_build_object('id', ticket_row.id, 'ticket_code', ticket_row.ticket_code, 'status', ticket_row.status);
end;
$$;

create or replace function public.check_in_ticket(p_token_hash text, p_device_label text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ticket_row public.tickets%rowtype;
  guest_name text;
begin
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('status', 'invalid');
  end if;
  select t.* into ticket_row
  from public.tickets t
  join public.invitations i on i.id = t.invitation_id
  where t.token_hash = p_token_hash and i.owner_user_id = (select auth.uid())
    and i.status = 'active' and i.active_from <= now() and i.active_until > now()
  for update of t;
  if not found then return jsonb_build_object('status', 'invalid'); end if;
  select g.display_name into guest_name from public.guests g where g.id = ticket_row.guest_id;
  if ticket_row.status = 'used' then
    return jsonb_build_object('status', 'duplicate', 'guest_name', guest_name);
  elsif ticket_row.status = 'revoked' then
    return jsonb_build_object('status', 'invalid');
  end if;
  insert into public.checkins(ticket_id, invitation_id, checked_in_by, method, device_label)
  values (ticket_row.id, ticket_row.invitation_id, (select auth.uid()), 'qr', left(p_device_label, 80))
  on conflict (ticket_id) do nothing;
  update public.tickets set status = 'used', used_at = now() where id = ticket_row.id;
  update public.guests set status = 'checked_in' where id = ticket_row.guest_id;
  return jsonb_build_object('status', 'checked_in', 'guest_name', guest_name);
end;
$$;

create or replace function public.check_in_guest_manually(p_guest_id uuid, p_device_label text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  guest_row public.guests%rowtype;
  ticket_row public.tickets%rowtype;
begin
  select g.* into guest_row
  from public.guests g
  join public.invitations i on i.id = g.invitation_id
  where g.id = p_guest_id and i.owner_user_id = (select auth.uid())
    and i.status = 'active' and i.active_from <= now() and i.active_until > now();
  if not found then return jsonb_build_object('status', 'invalid'); end if;
  insert into public.tickets(invitation_id, guest_id, token_hash)
  values (guest_row.invitation_id, guest_row.id, encode(extensions.gen_random_bytes(32), 'hex'))
  on conflict (guest_id) do nothing;
  select * into ticket_row from public.tickets where guest_id = guest_row.id for update;
  if ticket_row.status = 'used' then
    return jsonb_build_object('status', 'duplicate', 'guest_name', guest_row.display_name);
  elsif ticket_row.status = 'revoked' then
    return jsonb_build_object('status', 'invalid');
  end if;
  insert into public.checkins(ticket_id, invitation_id, checked_in_by, method, device_label)
  values (ticket_row.id, ticket_row.invitation_id, (select auth.uid()), 'manual', left(p_device_label, 80))
  on conflict (ticket_id) do nothing;
  update public.tickets set status = 'used', used_at = now() where id = ticket_row.id;
  update public.guests set status = 'checked_in' where id = guest_row.id;
  return jsonb_build_object('status', 'checked_in', 'guest_name', guest_row.display_name);
end;
$$;

revoke all on function public.mark_guest_viewed(text) from public;
revoke all on function public.get_public_guestbook(text) from public;
revoke all on function public.submit_guest_rsvp(text,text,integer,jsonb) from public;
revoke all on function public.submit_guestbook_entry(text,text) from public;
revoke all on function public.issue_guest_ticket(uuid,text) from public, anon;
revoke all on function public.check_in_ticket(text,text) from public, anon;
revoke all on function public.check_in_guest_manually(uuid,text) from public, anon;
grant execute on function public.mark_guest_viewed(text) to anon, authenticated;
grant execute on function public.get_public_guestbook(text) to anon, authenticated;
grant execute on function public.submit_guest_rsvp(text,text,integer,jsonb) to anon, authenticated;
grant execute on function public.submit_guestbook_entry(text,text) to anon, authenticated;
grant execute on function public.issue_guest_ticket(uuid,text) to authenticated;
grant execute on function public.check_in_ticket(text,text) to authenticated;
grant execute on function public.check_in_guest_manually(uuid,text) to authenticated;

comment on table public.guests is 'Daftar tamu privat; token personal hanya disimpan dalam bentuk hash.';
comment on table public.tickets is 'Tiket tamu dengan token QR acak; tidak menyimpan PII pada payload QR.';
comment on table public.guest_public_rate_limits is 'Pembatasan RSVP dan guestbook per token tamu.';
