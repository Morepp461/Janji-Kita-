-- Fase 8: tambahkan aksi pembatasan permintaan untuk informasi meja tamu personal.
alter table public.guest_public_rate_limits
  drop constraint if exists guest_public_rate_limits_action_check;
alter table public.guest_public_rate_limits
  add constraint guest_public_rate_limits_action_check
  check (action in ('rsvp', 'guestbook', 'seating'));

-- Fase 8: akses publik terbatas untuk informasi meja pada tautan tamu personal.

create or replace function app_private.get_public_guest_seating_internal(p_token_hash text)
returns table(table_label text, seat_label text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $phase8$
begin
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    return;
  end if;

  if not exists (
    select 1
    from public.guests g
    join public.invitations i on i.id = g.invitation_id
    where g.personalized_token_hash = p_token_hash
      and i.status = 'active'
      and i.active_from <= now()
      and i.active_until > now()
      and i.published_version_id is not null
  ) then
    return;
  end if;

  if not public.consume_guest_rate_limit(p_token_hash, 'seating', 30) then
    return;
  end if;

  return query
  select st.label, sa.seat_label
  from public.guests g
  join public.seating_assignments sa
    on sa.guest_id = g.id and sa.invitation_id = g.invitation_id
  join public.seating_tables st
    on st.id = sa.seating_table_id and st.invitation_id = g.invitation_id
  join public.invitations i on i.id = g.invitation_id
  where g.personalized_token_hash = p_token_hash
    and i.status = 'active'
    and i.active_from <= now()
    and i.active_until > now()
    and i.published_version_id is not null
  limit 1;
end;
$phase8$;

create or replace function public.get_public_guest_seating(p_token_hash text)
returns table(table_label text, seat_label text)
language sql
security definer
set search_path = pg_catalog, public, app_private
as $phase8$
  select * from app_private.get_public_guest_seating_internal(p_token_hash);
$phase8$;

revoke all on function app_private.get_public_guest_seating_internal(text) from public, anon, authenticated;
revoke all on function public.get_public_guest_seating(text) from public, anon, authenticated;
grant execute on function public.get_public_guest_seating(text) to anon, authenticated;
