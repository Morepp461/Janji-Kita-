-- Fase 8: perencana tempat duduk dengan isolasi data dan pemeriksaan kapasitas transaksional.

create table public.seating_tables (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.invitations(id) on delete cascade,
  label text not null check (length(trim(label)) between 1 and 80),
  capacity integer not null check (capacity between 1 and 1000),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, invitation_id)
);
create index seating_tables_invitation_order_idx
  on public.seating_tables(invitation_id, sort_order, created_at);

create table public.seating_assignments (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.invitations(id) on delete cascade,
  guest_id uuid not null references public.guests(id) on delete cascade,
  seating_table_id uuid not null references public.seating_tables(id) on delete cascade,
  seat_label text check (seat_label is null or length(trim(seat_label)) between 1 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (invitation_id, guest_id)
);
create index seating_assignments_table_idx
  on public.seating_assignments(invitation_id, seating_table_id);
create index seating_assignments_guest_idx
  on public.seating_assignments(guest_id);

create trigger seating_tables_set_updated_at
  before update on public.seating_tables
  for each row execute function public.set_updated_at();
create trigger seating_assignments_set_updated_at
  before update on public.seating_assignments
  for each row execute function public.set_updated_at();

create or replace function app_private.validate_seating_assignment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $phase8$
declare
  target_invitation_id uuid;
  target_capacity integer;
  guest_invitation_id uuid;
  assigned_count integer;
begin
  select st.invitation_id, st.capacity
    into target_invitation_id, target_capacity
  from public.seating_tables st
  where st.id = new.seating_table_id
  for update;

  if target_invitation_id is null then
    raise exception 'Meja tempat duduk tidak ditemukan.' using errcode = '23503';
  end if;

  select g.invitation_id into guest_invitation_id
  from public.guests g
  where g.id = new.guest_id;

  if guest_invitation_id is null or guest_invitation_id <> new.invitation_id
     or target_invitation_id <> new.invitation_id then
    raise exception 'Tamu dan meja harus berasal dari undangan yang sama.' using errcode = '23514';
  end if;

  select count(*)::integer into assigned_count
  from public.seating_assignments sa
  where sa.seating_table_id = new.seating_table_id
    and sa.id is distinct from new.id;

  if assigned_count >= target_capacity then
    raise exception 'Kapasitas meja sudah penuh.' using errcode = '23514';
  end if;

  return new;
end;
$phase8$;

create trigger seating_assignments_validate_capacity
  before insert or update of invitation_id, guest_id, seating_table_id
  on public.seating_assignments
  for each row execute function app_private.validate_seating_assignment();

create or replace function app_private.validate_seating_table_capacity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $phase8$
declare
  assigned_count integer;
begin
  select count(*)::integer into assigned_count
  from public.seating_assignments sa
  where sa.seating_table_id = old.id;

  if new.capacity < assigned_count then
    raise exception 'Kapasitas baru lebih kecil daripada jumlah tamu yang sudah ditempatkan.'
      using errcode = '23514';
  end if;

  return new;
end;
$phase8$;

create trigger seating_tables_validate_capacity
  before update of capacity on public.seating_tables
  for each row execute function app_private.validate_seating_table_capacity();

alter table public.seating_tables enable row level security;
alter table public.seating_assignments enable row level security;

create policy seating_tables_owner_read on public.seating_tables
  for select to authenticated
  using (exists (
    select 1 from public.invitations i
    where i.id = invitation_id and i.owner_user_id = (select auth.uid())
  ));
create policy seating_tables_owner_insert on public.seating_tables
  for insert to authenticated
  with check (exists (
    select 1 from public.invitations i
    where i.id = invitation_id and i.owner_user_id = (select auth.uid())
  ));
create policy seating_tables_owner_update on public.seating_tables
  for update to authenticated
  using (exists (
    select 1 from public.invitations i
    where i.id = invitation_id and i.owner_user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.invitations i
    where i.id = invitation_id and i.owner_user_id = (select auth.uid())
  ));
create policy seating_tables_owner_delete on public.seating_tables
  for delete to authenticated
  using (exists (
    select 1 from public.invitations i
    where i.id = invitation_id and i.owner_user_id = (select auth.uid())
  ));

create policy seating_assignments_owner_read on public.seating_assignments
  for select to authenticated
  using (exists (
    select 1 from public.invitations i
    where i.id = invitation_id and i.owner_user_id = (select auth.uid())
  ));
create policy seating_assignments_owner_insert on public.seating_assignments
  for insert to authenticated
  with check (exists (
    select 1 from public.invitations i
    where i.id = invitation_id and i.owner_user_id = (select auth.uid())
  ));
create policy seating_assignments_owner_update on public.seating_assignments
  for update to authenticated
  using (exists (
    select 1 from public.invitations i
    where i.id = invitation_id and i.owner_user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.invitations i
    where i.id = invitation_id and i.owner_user_id = (select auth.uid())
  ));
create policy seating_assignments_owner_delete on public.seating_assignments
  for delete to authenticated
  using (exists (
    select 1 from public.invitations i
    where i.id = invitation_id and i.owner_user_id = (select auth.uid())
  ));

revoke all on public.seating_tables, public.seating_assignments from public, anon;
grant select, insert, update, delete on public.seating_tables, public.seating_assignments to authenticated;
revoke all on function app_private.validate_seating_assignment() from public, anon;
revoke all on function app_private.validate_seating_table_capacity() from public, anon;
grant execute on function app_private.validate_seating_assignment() to authenticated;
grant execute on function app_private.validate_seating_table_capacity() to authenticated;
