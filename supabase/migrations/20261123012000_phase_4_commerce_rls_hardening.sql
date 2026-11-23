-- Fase 4: pengetatan kebijakan baca tabel commerce.
grant select on public.coupon_redemptions to authenticated;

create policy coupon_redemptions_owner_read on public.coupon_redemptions
  for select to authenticated using (
    user_id = (select auth.uid()) or app_private.has_permission('orders.read')
  );

create policy payment_events_service_role_all on public.payment_events
  for all to service_role using (true) with check (true);
