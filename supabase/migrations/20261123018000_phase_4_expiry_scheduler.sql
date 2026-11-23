-- Fase 4: expiry otomatis untuk pesanan, pembayaran, entitlement, dan undangan.
create extension if not exists pg_cron;

create or replace function public.expire_invitations()
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  expired_orders integer := 0;
  expired_entitlements integer := 0;
  expired_invitations integer := 0;
begin
  update public.orders set status = 'expired'
  where status = 'pending' and expires_at <= now();
  get diagnostics expired_orders = row_count;

  update public.payment_attempts set status = 'expired'
  where status = 'pending' and order_id in (
    select id from public.orders where status = 'expired' and expires_at <= now()
  );

  update public.entitlements set status = 'expired'
  where status = 'active' and valid_until <= now();
  get diagnostics expired_entitlements = row_count;

  update public.invitations set status = 'expired', updated_at = now()
  where status = 'active' and active_until <= now();
  get diagnostics expired_invitations = row_count;

  insert into public.audit_logs(actor_user_id, action, target_type, target_id, after_data)
  select null, 'order_expired', 'orders', id,
    jsonb_build_object('order_number', order_number, 'expired_at', expires_at)
  from public.orders where status = 'expired' and expires_at <= now()
    and updated_at >= now() - interval '1 minute';

  insert into public.audit_logs(actor_user_id, action, target_type, target_id, after_data)
  select null, 'invitation_expired', 'invitations', id,
    jsonb_build_object('slug', slug, 'active_until', active_until)
  from public.invitations where status = 'expired'
    and updated_at >= now() - interval '1 minute';

  return expired_orders + expired_entitlements + expired_invitations;
end;
$$;

revoke all on function public.expire_invitations() from public, anon, authenticated;
grant execute on function public.expire_invitations() to service_role;

select cron.unschedule(jobid) from cron.job
where jobname = 'janji-kita-expire-invitations';
select cron.schedule(
  'janji-kita-expire-invitations',
  '*/15 * * * *',
  'select public.expire_invitations();'
);
