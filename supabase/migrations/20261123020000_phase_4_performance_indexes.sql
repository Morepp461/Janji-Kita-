-- Indeks untuk FK dan job commerce Fase 4.
create index if not exists commerce_settings_updated_by_idx
  on public.commerce_settings(updated_by) where updated_by is not null;
create index if not exists coupon_redemptions_coupon_user_idx
  on public.coupon_redemptions(coupon_id, user_id);
create index if not exists coupon_redemptions_user_idx
  on public.coupon_redemptions(user_id);
create index if not exists invitation_add_ons_add_on_id_idx
  on public.invitation_add_ons(add_on_id);
create index if not exists orders_coupon_id_idx
  on public.orders(coupon_id) where coupon_id is not null;
create index if not exists orders_reseller_user_id_idx
  on public.orders(reseller_user_id) where reseller_user_id is not null;
create index if not exists orders_pending_expiry_idx
  on public.orders(expires_at) where status = 'pending';
create index if not exists invitations_active_expiry_idx
  on public.invitations(active_until) where status = 'active';
create index if not exists payment_attempts_midtrans_pending_created_idx
  on public.payment_attempts(created_at) where provider = 'midtrans' and status = 'pending';
