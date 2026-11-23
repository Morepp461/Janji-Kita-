-- Fase 6: kode atribusi dan penerapan harga wholesale pada checkout reseller.

alter table public.reseller_profiles
  add column if not exists referral_code text
  not null default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
create unique index if not exists reseller_profiles_referral_code_idx
  on public.reseller_profiles(referral_code);

create or replace function public.attribute_invitation_to_reseller(
  p_invitation_id uuid,
  p_referral_code text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  current_user_id uuid := auth.uid();
  reseller_id uuid;
begin
  if current_user_id is null then raise exception 'Autentikasi diperlukan' using errcode = '42501'; end if;
  select rp.user_id into reseller_id
  from public.reseller_profiles rp
  where rp.referral_code = upper(trim(coalesce(p_referral_code, '')))
    and rp.status = 'approved';
  if reseller_id is null then raise exception 'Kode reseller tidak valid atau tidak aktif' using errcode = '22023'; end if;
  update public.invitations
  set reseller_user_id = reseller_id, updated_at = now()
  where id = p_invitation_id and owner_user_id = current_user_id
    and deleted_at is null and status in ('draft', 'active', 'expired');
  if not found then raise exception 'Undangan tidak ditemukan atau bukan milik akun ini' using errcode = '42501'; end if;
  insert into public.audit_logs(actor_user_id, action, target_type, target_id, after_data)
  values (current_user_id, 'reseller.attributed', 'invitation', p_invitation_id,
    jsonb_build_object('reseller_user_id', reseller_id));
  return reseller_id;
end;
$$;
revoke all on function public.attribute_invitation_to_reseller(uuid, text) from public, anon;
grant execute on function public.attribute_invitation_to_reseller(uuid, text) to authenticated;

create or replace function public.create_order(
  p_invitation_id uuid,
  p_add_ons jsonb default '[]'::jsonb,
  p_coupon_code text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  current_user_id uuid := auth.uid();
  invitation_row public.invitations%rowtype;
  template_row public.templates%rowtype;
  addon_row public.add_ons%rowtype;
  coupon_row public.coupons%rowtype;
  reseller_row public.reseller_profiles%rowtype;
  existing_order public.orders%rowtype;
  new_order_id uuid;
  new_order_number text;
  currency_code text := 'IDR';
  base_amount bigint := 0;
  addon_amount bigint := 0;
  subtotal_amount bigint := 0;
  discount_amount bigint := 0;
  grand_amount bigint := 0;
  quantity_value integer;
  addon_id uuid;
  item jsonb;
  coupon_code_value text;
  snapshot_items jsonb := '[]'::jsonb;
  snapshot_coupon jsonb := 'null'::jsonb;
  draft_version uuid;
  allowed_template_ids jsonb;
  allowed_categories jsonb;
  allowed_addons jsonb;
  minimum_amount bigint;
  reseller_price bigint;
  reseller_mode boolean := false;
begin
  if current_user_id is null then raise exception 'Autentikasi diperlukan' using errcode = '42501'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 16 and 128 then
    raise exception 'Kunci idempotensi tidak valid' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_add_ons, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_add_ons, '[]'::jsonb)) > 20 then
    raise exception 'Daftar add-on tidak valid' using errcode = '22023';
  end if;

  select * into existing_order from public.orders where idempotency_key = p_idempotency_key;
  if found then
    if existing_order.payer_user_id <> current_user_id then
      raise exception 'Kunci idempotensi sudah digunakan' using errcode = '42501';
    end if;
    return jsonb_build_object('order_id', existing_order.id, 'order_number', existing_order.order_number,
      'status', existing_order.status, 'grand_total', existing_order.grand_total, 'currency', existing_order.currency);
  end if;

  select * into invitation_row from public.invitations
  where id = p_invitation_id and owner_user_id = current_user_id
    and deleted_at is null and status in ('draft', 'active', 'expired')
  for update;
  if not found then raise exception 'Undangan tidak ditemukan atau bukan milik akun ini' using errcode = 'P0002'; end if;
  draft_version := invitation_row.draft_version_id;
  if draft_version is null then raise exception 'Simpan draft sebelum checkout' using errcode = '55000'; end if;

  if invitation_row.reseller_user_id = current_user_id then
    select * into reseller_row from public.reseller_profiles
    where user_id = current_user_id and status = 'approved';
    reseller_mode := found;
  end if;

  if invitation_row.template_id is not null then
    select * into template_row from public.templates
    where id = invitation_row.template_id and status = 'published';
    if not found then raise exception 'Template undangan tidak lagi tersedia' using errcode = 'P0002'; end if;
    base_amount := template_row.base_price;
    currency_code := template_row.currency;
    if reseller_mode then
      select rpr.wholesale_price into reseller_price
      from public.reseller_price_rules rpr
      where rpr.reseller_tier = reseller_row.pricing_tier
        and rpr.template_id = template_row.id and rpr.add_on_id is null
        and rpr.valid_from <= now() and (rpr.valid_until is null or rpr.valid_until > now())
      order by rpr.valid_from desc, rpr.created_at desc limit 1;
      if found then base_amount := reseller_price; end if;
    end if;
    snapshot_items := snapshot_items || jsonb_build_array(jsonb_build_object(
      'item_type', 'template', 'reference_id', template_row.id,
      'description', template_row.title, 'quantity', 1,
      'unit_price', base_amount, 'line_total', base_amount,
      'retail_unit_price', template_row.base_price,
      'pricing_mode', case when reseller_mode then 'reseller_wholesale' else 'retail' end
    ));
  end if;

  for item in select value from jsonb_array_elements(coalesce(p_add_ons, '[]'::jsonb))
  loop
    addon_id := (item ->> 'id')::uuid;
    quantity_value := (item ->> 'quantity')::integer;
    if quantity_value is null or quantity_value < 1 or quantity_value > 100 then
      raise exception 'Jumlah add-on tidak valid' using errcode = '22023';
    end if;
    select * into addon_row from public.add_ons
    where id = addon_id and is_active and billing_type in ('one_time', 'quantity')
    for share;
    if not found then raise exception 'Add-on tidak tersedia' using errcode = 'P0002'; end if;
    if addon_row.currency <> currency_code then raise exception 'Mata uang add-on tidak sesuai' using errcode = '22023'; end if;
    if exists (
      select 1 from jsonb_array_elements(coalesce(p_add_ons, '[]'::jsonb)) x
      where x ->> 'id' = addon_id::text
      group by x ->> 'id' having count(*) > 1
    ) then raise exception 'Add-on duplikat tidak diperbolehkan' using errcode = '22023'; end if;
    reseller_price := addon_row.price;
    if reseller_mode then
      select rpr.wholesale_price into reseller_price
      from public.reseller_price_rules rpr
      where rpr.reseller_tier = reseller_row.pricing_tier
        and rpr.add_on_id = addon_row.id and rpr.template_id is null
        and rpr.valid_from <= now() and (rpr.valid_until is null or rpr.valid_until > now())
      order by rpr.valid_from desc, rpr.created_at desc limit 1;
      if not found then reseller_price := addon_row.price; end if;
    end if;
    addon_amount := addon_amount + reseller_price * quantity_value;
    snapshot_items := snapshot_items || jsonb_build_array(jsonb_build_object(
      'item_type', 'add_on', 'reference_id', addon_row.id,
      'description', addon_row.name_i18n ->> 'id-ID',
      'quantity', quantity_value, 'unit_price', reseller_price,
      'line_total', reseller_price * quantity_value,
      'retail_unit_price', addon_row.price,
      'pricing_mode', case when reseller_mode then 'reseller_wholesale' else 'retail' end,
      'config', addon_row.config
    ));
  end loop;

  subtotal_amount := base_amount + addon_amount;
  if subtotal_amount <= 0 then
    raise exception 'Harga undangan belum dikonfigurasi. Hubungi admin sebelum checkout.' using errcode = '22023';
  end if;

  if nullif(trim(p_coupon_code), '') is not null then
    coupon_code_value := upper(trim(p_coupon_code));
    select * into coupon_row from public.coupons
    where code = coupon_code_value and is_active
      and starts_at <= now() and ends_at > now()
    for update;
    if not found then raise exception 'Kupon tidak berlaku atau sudah berakhir' using errcode = '22023'; end if;

    allowed_template_ids := coupon_row.rules -> 'template_ids';
    allowed_categories := coupon_row.rules -> 'category_ids';
    allowed_addons := coupon_row.rules -> 'add_on_ids';
    if invitation_row.reseller_user_id is not null
      and coalesce((coupon_row.rules ->> 'reseller_compatible')::boolean, true) = false then
      raise exception 'Kupon tidak berlaku untuk pesanan reseller' using errcode = '22023';
    end if;
    minimum_amount := coalesce((coupon_row.rules ->> 'minimum_order')::bigint, 0);
    if subtotal_amount < minimum_amount then raise exception 'Minimum transaksi kupon belum terpenuhi' using errcode = '22023'; end if;
    if allowed_template_ids is not null and invitation_row.template_id is not null
      and not (allowed_template_ids ? invitation_row.template_id::text) then
      raise exception 'Kupon tidak berlaku untuk template ini' using errcode = '22023';
    end if;
    if allowed_categories is not null and not (allowed_categories ? invitation_row.event_category_id::text) then
      raise exception 'Kupon tidak berlaku untuk kategori ini' using errcode = '22023';
    end if;
    if allowed_addons is not null and exists (
      select 1 from jsonb_array_elements(coalesce(p_add_ons, '[]'::jsonb)) x
      where not (allowed_addons ? (x ->> 'id'))
    ) then raise exception 'Kupon tidak berlaku untuk add-on yang dipilih' using errcode = '22023'; end if;
    if coupon_row.max_redemptions is not null and (
      select count(*) from public.coupon_redemptions cr
      join public.orders o on o.id = cr.order_id
      where cr.coupon_id = coupon_row.id and o.status in ('pending', 'paid', 'partially_refunded', 'refunded')
        and o.expires_at > now()
    ) >= coupon_row.max_redemptions then
      raise exception 'Kuota kupon sudah habis' using errcode = '22023';
    end if;
    if coupon_row.per_user_limit is not null and (
      select count(*) from public.coupon_redemptions cr
      join public.orders o on o.id = cr.order_id
      where cr.coupon_id = coupon_row.id and cr.user_id = current_user_id
        and o.status in ('pending', 'paid', 'partially_refunded', 'refunded') and o.expires_at > now()
    ) >= coupon_row.per_user_limit then
      raise exception 'Batas penggunaan kupon untuk akun ini sudah tercapai' using errcode = '22023';
    end if;
    if coupon_row.discount_type = 'percent' then
      discount_amount := floor(subtotal_amount * coupon_row.discount_value / 100.0)::bigint;
    else
      discount_amount := least(subtotal_amount, coupon_row.discount_value);
    end if;
    snapshot_coupon := jsonb_build_object('id', coupon_row.id, 'code', coupon_row.code,
      'discount_type', coupon_row.discount_type, 'discount_value', coupon_row.discount_value,
      'discount_amount', discount_amount);
  end if;

  grand_amount := subtotal_amount - discount_amount;
  if grand_amount <= 0 then raise exception 'Total pembayaran harus lebih dari nol' using errcode = '22023'; end if;

  new_order_number := 'JK-' || to_char(now() at time zone 'UTC', 'YYYYMMDD') || '-'
    || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.orders(order_number, payer_user_id, owner_user_id, reseller_user_id,
    invitation_id, status, subtotal, discount_total, tax_total, grand_total, currency,
    coupon_id, price_snapshot, idempotency_key)
  values (new_order_number, current_user_id, invitation_row.owner_user_id, invitation_row.reseller_user_id,
    invitation_row.id, 'pending', subtotal_amount, discount_amount, 0, grand_amount, currency_code,
    coupon_row.id, jsonb_build_object('items', snapshot_items, 'coupon', snapshot_coupon,
      'draft_version_id', draft_version, 'duration_days', 30, 'tax_total', 0,
      'currency', currency_code, 'reseller', case when invitation_row.reseller_user_id is null then null
        else jsonb_build_object('user_id', invitation_row.reseller_user_id,
          'tier', case when reseller_mode then reseller_row.pricing_tier else null end,
          'pricing_mode', case when reseller_mode then 'wholesale' else 'retail' end) end),
    p_idempotency_key)
  returning id into new_order_id;

  for item in select value from jsonb_array_elements(snapshot_items)
  loop
    insert into public.order_items(order_id, item_type, reference_id, description_snapshot,
      quantity, unit_price, line_total, metadata_snapshot)
    values (new_order_id, item ->> 'item_type', nullif(item ->> 'reference_id', '')::uuid,
      coalesce(item ->> 'description', 'Item undangan'), (item ->> 'quantity')::integer,
      (item ->> 'unit_price')::bigint, (item ->> 'line_total')::bigint,
      coalesce(item -> 'config', '{}'::jsonb));
  end loop;

  if coupon_row.id is not null then
    insert into public.coupon_redemptions(coupon_id, user_id, order_id, discount_amount)
    values (coupon_row.id, current_user_id, new_order_id, discount_amount);
  end if;

  return jsonb_build_object('order_id', new_order_id, 'order_number', new_order_number,
    'status', 'pending', 'subtotal', subtotal_amount, 'discount_total', discount_amount,
    'tax_total', 0, 'grand_total', grand_amount, 'currency', currency_code);
end;
$$;

grant execute on function public.create_order(uuid, jsonb, text, text) to authenticated;
