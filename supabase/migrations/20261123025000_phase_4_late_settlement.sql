-- Pembayaran terverifikasi tetap diproses jika webhook tiba setelah expiry order.
create or replace function public.process_midtrans_notification(
  p_provider_order_id text,
  p_provider_transaction_id text,
  p_transaction_status text,
  p_fraud_status text,
  p_payment_type text,
  p_status_code text,
  p_gross_amount bigint,
  p_refund_amount bigint,
  p_event_key text,
  p_payload_redacted jsonb,
  p_signature_valid boolean,
  p_verified_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  attempt_row public.payment_attempts%rowtype;
  order_row public.orders%rowtype;
  entitlement_row public.entitlements%rowtype;
  paid_time timestamptz := coalesce(p_verified_at, clock_timestamp());
  duration_days integer := 30;
  entitlement_start timestamptz;
  entitlement_end timestamptz;
  mapped_status text;
  inserted_event uuid;
begin
  if coalesce(auth.jwt() ->> 'role', current_setting('request.jwt.claim.role', true)) <> 'service_role' then
    raise exception 'Webhook hanya dapat diproses oleh service role' using errcode = '42501';
  end if;
  if p_signature_valid is distinct from true then
    raise exception 'Tanda tangan pembayaran tidak valid' using errcode = '42501';
  end if;
  if nullif(trim(p_event_key), '') is null then
    raise exception 'Kunci event pembayaran wajib diisi' using errcode = '22023';
  end if;

  select * into attempt_row from public.payment_attempts
  where provider = 'midtrans' and provider_order_id = p_provider_order_id
  for update;
  if not found then raise exception 'Referensi pembayaran tidak ditemukan' using errcode = 'P0002'; end if;
  select * into order_row from public.orders where id = attempt_row.order_id for update;
  if not found then raise exception 'Pesanan tidak ditemukan' using errcode = 'P0002'; end if;
  if p_gross_amount <> attempt_row.amount or p_gross_amount <> order_row.grand_total then
    raise exception 'Nominal pembayaran tidak sesuai snapshot pesanan' using errcode = '22023';
  end if;
  if p_refund_amount is not null and (p_refund_amount < 0 or p_refund_amount > order_row.grand_total) then
    raise exception 'Nominal pengembalian dana tidak valid' using errcode = '22023';
  end if;

  insert into public.payment_events(payment_attempt_id, event_key, event_type,
    payload_redacted, signature_valid, processed_at)
  values (attempt_row.id, p_event_key, coalesce(p_transaction_status, 'unknown'),
    coalesce(p_payload_redacted, '{}'::jsonb), true, now())
  on conflict (event_key) do nothing
  returning id into inserted_event;

  if inserted_event is null then
    return jsonb_build_object('processed', false, 'duplicate', true, 'order_status', order_row.status);
  end if;

  mapped_status := case
    when p_transaction_status = 'settlement'
      or (p_transaction_status = 'capture' and coalesce(p_fraud_status, '') = 'accept') then 'paid'
    when p_transaction_status = 'pending' then 'pending'
    when p_transaction_status = 'deny' then 'failed'
    when p_transaction_status = 'cancel' then 'cancelled'
    when p_transaction_status = 'expire' then 'expired'
    when p_transaction_status in ('refund', 'partial_refund') then
      case when p_transaction_status = 'refund' then 'refunded' else 'partially_refunded' end
    else 'pending'
  end;

  update public.payment_attempts set
    provider_transaction_id = coalesce(p_provider_transaction_id, provider_transaction_id),
    status = case when status in ('paid', 'settlement', 'capture') and mapped_status <> 'refunded'
      then status else coalesce(p_transaction_status, status) end,
    payment_method = coalesce(p_payment_type, payment_method),
    raw_status_code = p_status_code,
    verified_at = paid_time
  where id = attempt_row.id;

  if order_row.status <> 'paid' or mapped_status in ('refunded', 'partially_refunded') then
    if mapped_status = 'paid' and order_row.status not in ('refunded', 'partially_refunded') then
      update public.orders set status = 'paid', paid_at = coalesce(paid_at, paid_time)
      where id = order_row.id;
      duration_days := greatest(1, least(365, coalesce((order_row.price_snapshot ->> 'duration_days')::integer, 30)));

      select * into entitlement_row from public.entitlements
      where user_id = order_row.owner_user_id and entitlement_key = 'invitation.publish'
        and value ->> 'invitation_id' = order_row.invitation_id::text and status = 'active'
      for update;

      if found then
        entitlement_start := entitlement_row.valid_from;
        entitlement_end := greatest(entitlement_row.valid_until, paid_time) + make_interval(days => duration_days);
        update public.entitlements set source_id = order_row.id, valid_until = entitlement_end,
          status = 'active', value = jsonb_build_object('invitation_id', order_row.invitation_id,
            'order_id', order_row.id, 'duration_days', duration_days)
        where id = entitlement_row.id;
      else
        entitlement_start := paid_time;
        entitlement_end := paid_time + make_interval(days => duration_days);
        insert into public.entitlements(user_id, entitlement_key, source_type, source_id,
          valid_from, valid_until, value, status)
        values (order_row.owner_user_id, 'invitation.publish', 'order', order_row.id,
          entitlement_start, entitlement_end, jsonb_build_object('invitation_id', order_row.invitation_id,
            'order_id', order_row.id, 'duration_days', duration_days), 'active');
      end if;

      insert into public.invitation_add_ons(invitation_id, add_on_id, quantity,
        unit_price_snapshot, currency, config_snapshot)
      select order_row.invitation_id, oi.reference_id, oi.quantity, oi.unit_price,
        order_row.currency, oi.metadata_snapshot
      from public.order_items oi
      where oi.order_id = order_row.id and oi.item_type = 'add_on' and oi.reference_id is not null
      on conflict (invitation_id, add_on_id) do update set
        quantity = excluded.quantity,
        unit_price_snapshot = excluded.unit_price_snapshot,
        currency = excluded.currency,
        config_snapshot = excluded.config_snapshot;

      update public.invitations set active_from = entitlement_start, active_until = entitlement_end
      where id = order_row.invitation_id and status in ('draft', 'active', 'expired');
      insert into public.audit_logs(actor_user_id, action, target_type, target_id, after_data)
      values (null, 'payment_verified', 'orders', order_row.id,
        jsonb_build_object('order_number', order_row.order_number, 'amount', order_row.grand_total,
          'provider', 'midtrans', 'transaction_id', p_provider_transaction_id,
          'entitlement_until', entitlement_end));
    elsif mapped_status in ('failed', 'cancelled', 'expired') and order_row.status not in ('paid', 'refunded', 'partially_refunded') then
      update public.orders set
        status = case when order_row.status = 'refunded' then 'refunded' else mapped_status end,
        refund_total = greatest(refund_total, least(grand_total,
          coalesce(p_refund_amount, case when mapped_status = 'refunded' then grand_total else refund_total end)))
      where id = order_row.id;
    elsif mapped_status in ('refunded', 'partially_refunded') then
      update public.orders set
        status = case when order_row.status = 'refunded' then 'refunded' else mapped_status end,
        refund_total = greatest(refund_total, least(grand_total,
          coalesce(p_refund_amount, case when mapped_status = 'refunded' then grand_total else refund_total end)))
      where id = order_row.id;
      if mapped_status = 'refunded' or order_row.status = 'refunded' then
        update public.entitlements set status = 'revoked'
        where user_id = order_row.owner_user_id and entitlement_key = 'invitation.publish'
          and value ->> 'invitation_id' = order_row.invitation_id::text and status = 'active';
        update public.invitations set status = 'suspended'
        where id = order_row.invitation_id and status = 'active';
      end if;
      insert into public.audit_logs(actor_user_id, action, target_type, target_id, after_data)
      values (null, mapped_status, 'orders', order_row.id,
        jsonb_build_object('provider', 'midtrans', 'transaction_id', p_provider_transaction_id,
          'refund_total', (select refund_total from public.orders where id = order_row.id)));
    end if;
  end if;

  return jsonb_build_object('processed', true, 'duplicate', false,
    'order_status', (select status from public.orders where id = order_row.id));
end;
$$;
revoke all on function public.process_midtrans_notification(text,text,text,text,text,text,bigint,bigint,text,jsonb,boolean,timestamp with time zone) from public, anon, authenticated;
grant execute on function public.process_midtrans_notification(text,text,text,text,text,text,bigint,bigint,text,jsonb,boolean,timestamp with time zone) to service_role;
