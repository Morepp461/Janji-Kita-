-- Fase 4: pertahankan snapshot publik saat draft aktif diedit dan aktifkan add-on setelah pembayaran.

create or replace function public.process_midtrans_notification(
  p_provider_order_id text,
  p_provider_transaction_id text,
  p_transaction_status text,
  p_fraud_status text,
  p_payment_type text,
  p_status_code text,
  p_gross_amount bigint,
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
    if mapped_status = 'paid' and order_row.status not in ('refunded', 'partially_refunded', 'cancelled', 'expired') then
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
      update public.orders set status = mapped_status where id = order_row.id;
    elsif mapped_status in ('refunded', 'partially_refunded') then
      update public.orders set status = mapped_status where id = order_row.id;
      if mapped_status = 'refunded' then
        update public.entitlements set status = 'revoked'
        where user_id = order_row.owner_user_id and entitlement_key = 'invitation.publish'
          and value ->> 'invitation_id' = order_row.invitation_id::text and status = 'active';
        update public.invitations set status = 'suspended'
        where id = order_row.invitation_id and status = 'active';
      end if;
      insert into public.audit_logs(actor_user_id, action, target_type, target_id, after_data)
      values (null, mapped_status, 'orders', order_row.id,
        jsonb_build_object('provider', 'midtrans', 'transaction_id', p_provider_transaction_id));
    end if;
  end if;

  return jsonb_build_object('processed', true, 'duplicate', false,
    'order_status', (select status from public.orders where id = order_row.id));
end;
$$;

create or replace function public.save_invitation_draft(
  p_invitation_id uuid,
  p_expected_updated_at timestamptz,
  p_title text,
  p_document jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  current_user_id uuid := auth.uid();
  current_invitation public.invitations%rowtype;
  current_version public.invitation_versions%rowtype;
  saved_at timestamptz := clock_timestamp();
  next_document jsonb;
begin
  if current_user_id is null then raise exception 'Autentikasi diperlukan' using errcode = '42501'; end if;
  if length(trim(coalesce(p_title, ''))) not between 1 and 160
    or jsonb_typeof(p_document) <> 'object'
    or coalesce((p_document ->> 'schemaVersion')::integer, 0) <> 1
    or coalesce(jsonb_typeof(p_document -> 'pages'), '') <> 'array'
    or octet_length(p_document::text) > 1048576 then
    raise exception 'Dokumen tidak valid atau melebihi batas 1 MB' using errcode = '22023';
  end if;
  select * into current_invitation from public.invitations
  where id = p_invitation_id and owner_user_id = current_user_id
    and status in ('draft', 'active', 'expired') and deleted_at is null
  for update;
  if not found then raise exception 'Draft tidak ditemukan atau bukan milik akun ini' using errcode = 'P0002'; end if;
  if current_invitation.draft_version_id is null then raise exception 'Versi draft tidak ditemukan' using errcode = 'P0002'; end if;
  if current_invitation.updated_at is distinct from p_expected_updated_at then
    raise exception 'Konflik penyuntingan: draft telah berubah di perangkat lain' using errcode = '40001';
  end if;
  select * into current_version from public.invitation_versions
  where id = current_invitation.draft_version_id and invitation_id = p_invitation_id and state = 'draft'
  for update;
  if not found then raise exception 'Versi draft tidak tersedia' using errcode = 'P0002'; end if;

  next_document := p_document || jsonb_build_object(
    'metadata',
    coalesce(p_document -> 'metadata', '{}'::jsonb) || jsonb_build_object('title', trim(p_title))
  );
  update public.invitation_versions set document = next_document where id = current_version.id;
  update public.invitations set
    title = case when published_version_id is null then trim(p_title) else title end,
    updated_at = saved_at
  where id = p_invitation_id;
  return jsonb_build_object('invitation_id', p_invitation_id, 'draft_version_id', current_version.id,
    'version_no', current_version.version_no, 'updated_at', saved_at);
end;
$$;

create or replace function public.publish_invitation(p_invitation_id uuid, p_expected_draft_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  current_user_id uuid := auth.uid();
  invitation_row public.invitations%rowtype;
  draft_row public.invitation_versions%rowtype;
  entitlement_row public.entitlements%rowtype;
  next_version integer;
  new_version_id uuid;
  public_slug text;
  published_title text;
begin
  if current_user_id is null then raise exception 'Autentikasi diperlukan' using errcode = '42501'; end if;
  select * into invitation_row from public.invitations
  where id = p_invitation_id and owner_user_id = current_user_id and deleted_at is null
    and status in ('draft', 'active', 'expired')
  for update;
  if not found then raise exception 'Undangan tidak ditemukan atau bukan milik akun ini' using errcode = 'P0002'; end if;
  if invitation_row.draft_version_id is null or invitation_row.draft_version_id <> p_expected_draft_version_id then
    raise exception 'Versi draft berubah. Muat ulang editor sebelum menerbitkan.' using errcode = '40001';
  end if;
  select * into entitlement_row from public.entitlements
  where user_id = current_user_id and entitlement_key = 'invitation.publish'
    and value ->> 'invitation_id' = p_invitation_id::text and status = 'active'
    and source_type = 'order'
    and exists (select 1 from public.orders o where o.id = source_id and o.invitation_id = p_invitation_id and o.status = 'paid')
    and valid_from <= now() and valid_until > now()
  order by valid_until desc limit 1 for update;
  if not found then raise exception 'Pembayaran diperlukan sebelum undangan dapat diterbitkan' using errcode = '42501'; end if;
  select * into draft_row from public.invitation_versions
  where id = invitation_row.draft_version_id and invitation_id = p_invitation_id and state = 'draft'
  for update;
  if not found then raise exception 'Versi draft tidak tersedia' using errcode = 'P0002'; end if;
  if coalesce((draft_row.document ->> 'schemaVersion')::integer, 0) <> 1
    or coalesce(jsonb_typeof(draft_row.document -> 'pages'), '') <> 'array'
    or jsonb_array_length(draft_row.document -> 'pages') = 0
    or octet_length(draft_row.document::text) > 1048576 then
    raise exception 'Dokumen belum memenuhi validasi publikasi' using errcode = '22023';
  end if;
  if invitation_row.slug is null then
    public_slug := 'undangan-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  else
    public_slug := invitation_row.slug;
  end if;
  published_title := coalesce(nullif(trim(draft_row.document -> 'metadata' ->> 'title'), ''), invitation_row.title);
  select coalesce(max(version_no), 0) + 1 into next_version
  from public.invitation_versions where invitation_id = p_invitation_id;
  insert into public.invitation_versions(invitation_id, version_no, schema_version,
    document, asset_manifest, state, created_by)
  values (p_invitation_id, next_version, draft_row.schema_version,
    draft_row.document, draft_row.asset_manifest, 'published', current_user_id)
  returning id into new_version_id;
  update public.invitations set title = published_title, slug = public_slug, status = 'active',
    active_from = entitlement_row.valid_from, active_until = entitlement_row.valid_until,
    published_version_id = new_version_id, updated_at = now()
  where id = p_invitation_id;
  insert into public.audit_logs(actor_user_id, action, target_type, target_id, before_data, after_data)
  values (current_user_id, 'publish', 'invitations', p_invitation_id,
    jsonb_build_object('published_version_id', invitation_row.published_version_id, 'status', invitation_row.status),
    jsonb_build_object('published_version_id', new_version_id, 'status', 'active', 'slug', public_slug, 'title', published_title));
  return jsonb_build_object('invitation_id', p_invitation_id, 'slug', public_slug,
    'published_version_id', new_version_id, 'version_no', next_version,
    'active_until', entitlement_row.valid_until);
end;
$$;
