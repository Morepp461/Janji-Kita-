-- Fase 4: akses server-side terbatas untuk Edge Functions dan job internal.
grant select, insert, update, delete on public.add_ons, public.invitation_add_ons,
  public.commerce_settings, public.coupons, public.orders, public.order_items,
  public.payment_attempts, public.payment_events, public.entitlements,
  public.coupon_redemptions, public.invitations, public.invitation_versions
to service_role;
