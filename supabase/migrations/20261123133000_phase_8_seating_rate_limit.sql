-- Fase 8: izinkan action rate limit khusus untuk pembacaan seating personal.
alter table public.guest_public_rate_limits
  drop constraint if exists guest_public_rate_limits_action_check;

alter table public.guest_public_rate_limits
  add constraint guest_public_rate_limits_action_check
  check (action in ('rsvp', 'guestbook', 'seating'));
