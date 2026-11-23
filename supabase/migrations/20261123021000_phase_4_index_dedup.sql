drop index if exists public.entitlements_active_expiry_idx;
create index if not exists coupon_redemptions_user_idx
  on public.coupon_redemptions(user_id);
