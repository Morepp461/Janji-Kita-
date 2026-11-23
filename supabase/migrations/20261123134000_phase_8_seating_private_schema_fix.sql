-- Fase 8: pastikan helper seating tetap privat setelah migrasi korektif.
alter function app_private.get_public_guest_seating_internal(text) security definer;
alter function app_private.get_public_guest_seating_internal(text)
  set search_path = pg_catalog, public;

alter function public.get_public_guest_seating(text) security definer;
alter function public.get_public_guest_seating(text)
  set search_path = pg_catalog, public, app_private;

revoke usage on schema app_private from anon;
revoke all on function app_private.get_public_guest_seating_internal(text)
  from public, anon, authenticated;
revoke all on function public.get_public_guest_seating(text)
  from public, anon, authenticated;
grant execute on function public.get_public_guest_seating(text)
  to anon, authenticated;
