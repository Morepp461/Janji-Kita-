-- Fase 4: commerce, pembayaran Midtrans sandbox, entitlement, dan publikasi atomik.
create table public.add_ons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  name_i18n jsonb not null check (jsonb_typeof(name_i18n) = 'object'),
  description_i18n jsonb not null default '{}'::jsonb check (jsonb_typeof(description_i18n) = 'object'),
  price bigint not null check (price >= 0),
  currency char(3) not null default 'IDR',
  billing_type text not null check (billing_type in ('one_time', 'recurring', 'quantity')),
  is_active boolean not null default true,
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.commerce_settings (
  key text primary key check (key ~ '^[a-z][a-z0-9_.-]*$'),
  value jsonb not null check (jsonb_typeof(value) = 'object'),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.commerce_settings(key, value)
values ('blank_canvas_price', '{"amount":0,"currency":"IDR"}'::jsonb)
on conflict (key) do nothing;

create table public.invitation_add_ons (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.invitations(id) on delete cascade,
  add_on_id uuid not null references public.add_ons(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_price_snapshot bigint not null check (unit_price_snapshot >= 0),
  currency char(3) not null,
  config_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (invitation_id, add_on_id)
);

create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(code) and code ~ '^[A-Z0-9_-]{3,40}$'),
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  discount_value bigint not null check (discount_value >= 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  per_user_limit integer check (per_user_limit is null or per_user_limit > 0),
  is_active boolean not null default true,
  rules jsonb not null default '{}'::jsonb check (jsonb_typeof(rules) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (discount_type <> 'percent' or discount_value <= 100)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  payer_user_id uuid not null references public.profiles(id) on delete restrict,
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  reseller_user_id uuid references public.profiles(id) on delete set null,
  invitation_id uuid not null references public.invitations(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('draft', 'pending', 'paid', 'failed', 'cancelled', 'expired', 'refunded', 'partially_refunded')),
  subtotal bigint not null check (subtotal >= 0),
  discount_total bigint not null default 0 check (discount_total >= 0),
  tax_total bigint not null default 0 check (tax_total >= 0),
  grand_total bigint not null check (grand_total > 0),
  currency char(3) not null default 'IDR',
  coupon_id uuid references public.coupons(id) on delete set null,
  price_snapshot jsonb not null check (jsonb_typeof(price_snapshot) = 'object'),
  idempotency_key text not null unique,
  paid_at timestamptz,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  item_type text not null check (item_type in ('template', 'add_on', 'extension', 'other')),
  reference_id uuid,
  description_snapshot text not null,
  quantity integer not null check (quantity > 0),
  unit_price bigint not null check (unit_price >= 0),
  line_total bigint not null check (line_total >= 0),
  metadata_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata_snapshot) = 'object')
);

create table public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  provider text not null check (provider in ('midtrans')),
  provider_transaction_id text,
  provider_order_id text not null unique,
  status text not null default 'pending',
  amount bigint not null check (amount > 0),
  currency char(3) not null default 'IDR',
  payment_method text,
  raw_status_code text,
  verified_at timestamptz,
  idempotency_key text not null unique,
  checkout_token text,
  checkout_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_attempt_id uuid not null references public.payment_attempts(id) on delete restrict,
  event_key text not null unique,
  event_type text not null,
  payload_redacted jsonb not null default '{}'::jsonb check (jsonb_typeof(payload_redacted) = 'object'),
  signature_valid boolean not null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  entitlement_key text not null,
  source_type text not null check (source_type in ('subscription', 'order', 'admin')),
  source_id uuid not null,
  valid_from timestamptz not null,
  valid_until timestamptz,
  value jsonb not null check (jsonb_typeof(value) = 'object'),
  status text not null check (status in ('active', 'revoked', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  order_id uuid not null unique references public.orders(id) on delete cascade,
  discount_amount bigint not null check (discount_amount >= 0),
  created_at timestamptz not null default now()
);

create index orders_payer_created_idx on public.orders(payer_user_id, created_at desc);
create index orders_owner_created_idx on public.orders(owner_user_id, created_at desc);
create index orders_status_created_idx on public.orders(status, created_at);
create index orders_invitation_idx on public.orders(invitation_id, created_at desc);
create index order_items_order_idx on public.order_items(order_id);
create index payment_attempts_order_idx on public.payment_attempts(order_id, created_at desc);
create index payment_attempts_transaction_idx on public.payment_attempts(provider_transaction_id);
create index payment_events_attempt_idx on public.payment_events(payment_attempt_id, created_at desc);
create index entitlements_user_key_status_idx on public.entitlements(user_id, entitlement_key, status);
create index entitlements_expiry_idx on public.entitlements(valid_until) where status = 'active';
create unique index entitlements_active_invitation_unique
  on public.entitlements(user_id, entitlement_key, (value ->> 'invitation_id'))
  where status = 'active' and entitlement_key = 'invitation.publish';

create trigger add_ons_set_updated_at before update on public.add_ons
  for each row execute function public.set_updated_at();
create trigger coupons_set_updated_at before update on public.coupons
  for each row execute function public.set_updated_at();
create trigger orders_set_updated_at before update on public.orders
  for each row execute function public.set_updated_at();
create trigger payment_attempts_set_updated_at before update on public.payment_attempts
  for each row execute function public.set_updated_at();
create trigger entitlements_set_updated_at before update on public.entitlements
  for each row execute function public.set_updated_at();

alter table public.commerce_settings enable row level security;
alter table public.add_ons enable row level security;
alter table public.invitation_add_ons enable row level security;
alter table public.coupons enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payment_attempts enable row level security;
alter table public.payment_events enable row level security;
alter table public.entitlements enable row level security;
alter table public.coupon_redemptions enable row level security;

insert into public.role_permissions (role, permission_key) values
  ('admin', 'commerce.manage'),
  ('admin', 'orders.read'),
  ('finance', 'orders.read'),
  ('super_admin', 'commerce.manage'),
  ('super_admin', 'orders.read')
on conflict (role, permission_key) do nothing;

revoke all on public.commerce_settings, public.add_ons, public.invitation_add_ons, public.coupons, public.orders,
  public.order_items, public.payment_attempts, public.payment_events, public.entitlements,
  public.coupon_redemptions from public, anon, authenticated;
grant select on public.add_ons to anon, authenticated;
grant select on public.coupons, public.commerce_settings to authenticated;
grant select on public.invitation_add_ons, public.orders, public.order_items,
  public.payment_attempts, public.entitlements to authenticated;

create policy add_ons_read_active on public.add_ons
  for select to anon using (is_active);
create policy add_ons_read_authenticated on public.add_ons
  for select to authenticated using (is_active or app_private.has_permission('commerce.manage'));
create policy commerce_settings_admin_read on public.commerce_settings
  for select to authenticated using (app_private.has_permission('commerce.manage'));
create policy coupons_admin_read on public.coupons
  for select to authenticated using (app_private.has_permission('commerce.manage'));
create policy invitation_add_ons_owner_read on public.invitation_add_ons
  for select to authenticated using (
    exists (select 1 from public.invitations i
      where i.id = invitation_id and i.owner_user_id = (select auth.uid()))
  );
create policy orders_owner_read on public.orders
  for select to authenticated using (
    payer_user_id = (select auth.uid())
    or owner_user_id = (select auth.uid())
    or app_private.has_permission('orders.read')
  );
create policy order_items_owner_read on public.order_items
  for select to authenticated using (
    exists (select 1 from public.orders o
      where o.id = order_id and (
        o.payer_user_id = (select auth.uid())
        or o.owner_user_id = (select auth.uid())
        or app_private.has_permission('orders.read')
      ))
  );
create policy payment_attempts_owner_read on public.payment_attempts
  for select to authenticated using (
    exists (select 1 from public.orders o
      where o.id = order_id and (
        o.payer_user_id = (select auth.uid())
        or o.owner_user_id = (select auth.uid())
        or app_private.has_permission('orders.read')
      ))
  );
create policy entitlements_owner_read on public.entitlements
  for select to authenticated using (
    user_id = (select auth.uid()) or app_private.has_permission('orders.read')
  );

create or replace function public.admin_upsert_add_on(
  p_id uuid,
  p_code text,
  p_name_i18n jsonb,
  p_description_i18n jsonb,
  p_price bigint,
  p_currency text,
  p_billing_type text,
  p_is_active boolean,
  p_config jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  current_user_id uuid := auth.uid();
  result_id uuid;
begin
  if current_user_id is null or not app_private.has_permission('commerce.manage') then
    raise exception 'Tidak memiliki izin mengelola harga dan add-on' using errcode = '42501';
  end if;
  if p_price < 0 or p_currency <> 'IDR'
    or p_billing_type not in ('one_time', 'recurring', 'quantity')
    or jsonb_typeof(p_name_i18n) <> 'object'
    or jsonb_typeof(coalesce(p_config, '{}'::jsonb)) <> 'object' then
    raise exception 'Konfigurasi add-on tidak valid' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.add_ons(code, name_i18n, description_i18n, price, currency, billing_type, is_active, config)
    values (lower(trim(p_code)), p_name_i18n, coalesce(p_description_i18n, '{}'::jsonb),
      p_price, p_currency, p_billing_type, p_is_active, coalesce(p_config, '{}'::jsonb))
    returning id into result_id;
  else
    update public.add_ons set code = lower(trim(p_code)), name_i18n = p_name_i18n,
      description_i18n = coalesce(p_description_i18n, '{}'::jsonb), price = p_price,
      currency = p_currency, billing_type = p_billing_type, is_active = p_is_active,
      config = coalesce(p_config, '{}'::jsonb)
    where id = p_id returning id into result_id;
    if result_id is null then raise exception 'Add-on tidak ditemukan' using errcode = 'P0002'; end if;
  end if;
  insert into public.audit_logs(actor_user_id, action, target_type, target_id, after_data)
  values (current_user_id, case when p_id is null then 'create' else 'update' end,
    'add_ons', result_id, jsonb_build_object('code', lower(trim(p_code)), 'price', p_price,
      'currency', p_currency, 'is_active', p_is_active, 'billing_type', p_billing_type));
  return result_id;
end;
$$;
revoke all on function public.admin_upsert_add_on(uuid,text,jsonb,jsonb,bigint,text,text,boolean,jsonb) from public, anon;
grant execute on function public.admin_upsert_add_on(uuid,text,jsonb,jsonb,bigint,text,text,boolean,jsonb) to authenticated;

create or replace function public.admin_set_blank_canvas_price(p_price bigint)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $fn$
declare
  current_user_id uuid := auth.uid();
  old_value jsonb;
begin
  if current_user_id is null or not app_private.has_permission('commerce.manage') then
    raise exception 'Tidak memiliki izin mengelola harga kanvas kosong' using errcode = '42501';
  end if;
  if p_price < 0 then raise exception 'Harga tidak boleh negatif' using errcode = '22023'; end if;
  select value into old_value from public.commerce_settings where key = 'blank_canvas_price' for update;
  insert into public.commerce_settings(key, value, updated_by, updated_at)
  values ('blank_canvas_price', jsonb_build_object('amount', p_price, 'currency', 'IDR'), current_user_id, now())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
  insert into public.audit_logs(actor_user_id, action, target_type, before_data, after_data)
  values (current_user_id, 'update_price', 'commerce_settings', old_value,
    jsonb_build_object('key', 'blank_canvas_price', 'amount', p_price, 'currency', 'IDR'));
end;
$fn$;
revoke all on function public.admin_set_blank_canvas_price(bigint) from public, anon;
grant execute on function public.admin_set_blank_canvas_price(bigint) to authenticated;

create or replace function public.admin_set_template_price(p_template_id uuid, p_price bigint)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  current_user_id uuid := auth.uid();
  old_price bigint;
begin
  if current_user_id is null or not app_private.has_permission('commerce.manage') then
    raise exception 'Tidak memiliki izin mengelola harga template' using errcode = '42501';
  end if;
  if p_price < 0 then raise exception 'Harga tidak boleh negatif' using errcode = '22023'; end if;
  select base_price into old_price from public.templates where id = p_template_id for update;
  if not found then raise exception 'Template tidak ditemukan' using errcode = 'P0002'; end if;
  update public.templates set base_price = p_price, currency = 'IDR' where id = p_template_id;
  insert into public.audit_logs(actor_user_id, action, target_type, target_id, before_data, after_data)
  values (current_user_id, 'update_price', 'templates', p_template_id,
    jsonb_build_object('base_price', old_price),
    jsonb_build_object('base_price', p_price, 'currency', 'IDR'));
end;
$$;
revoke all on function public.admin_set_template_price(uuid,bigint) from public, anon;
grant execute on function public.admin_set_template_price(uuid,bigint) to authenticated;

create or replace function public.admin_upsert_coupon(
  p_id uuid,
  p_code text,
  p_discount_type text,
  p_discount_value bigint,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_max_redemptions integer,
  p_per_user_limit integer,
  p_is_active boolean,
  p_rules jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  current_user_id uuid := auth.uid();
  result_id uuid;
begin
  if current_user_id is null or not app_private.has_permission('commerce.manage') then
    raise exception 'Tidak memiliki izin mengelola kupon' using errcode = '42501';
  end if;
  if p_discount_value < 0 or p_discount_type not in ('percent', 'fixed')
    or (p_discount_type = 'percent' and p_discount_value > 100)
    or p_ends_at <= p_starts_at
    or jsonb_typeof(coalesce(p_rules, '{}'::jsonb)) <> 'object' then
    raise exception 'Konfigurasi kupon tidak valid' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.coupons(code, discount_type, discount_value, starts_at, ends_at,
      max_redemptions, per_user_limit, is_active, rules)
    values (upper(trim(p_code)), p_discount_type, p_discount_value, p_starts_at, p_ends_at,
      p_max_redemptions, p_per_user_limit, p_is_active, coalesce(p_rules, '{}'::jsonb))
    returning id into result_id;
  else
    update public.coupons set code = upper(trim(p_code)), discount_type = p_discount_type,
      discount_value = p_discount_value, starts_at = p_starts_at, ends_at = p_ends_at,
      max_redemptions = p_max_redemptions, per_user_limit = p_per_user_limit,
      is_active = p_is_active, rules = coalesce(p_rules, '{}'::jsonb)
    where id = p_id returning id into result_id;
    if result_id is null then raise exception 'Kupon tidak ditemukan' using errcode = 'P0002'; end if;
  end if;
  insert into public.audit_logs(actor_user_id, action, target_type, target_id, after_data)
  values (current_user_id, case when p_id is null then 'create' else 'update' end,
    'coupons', result_id, jsonb_build_object('code', upper(trim(p_code)),
      'discount_type', p_discount_type, 'discount_value', p_discount_value, 'is_active', p_is_active));
  return result_id;
end;
$$;
revoke all on function public.admin_upsert_coupon(uuid,text,text,bigint,timestamptz,timestamptz,integer,integer,boolean,jsonb) from public, anon;
grant execute on function public.admin_upsert_coupon(uuid,text,text,bigint,timestamptz,timestamptz,integer,integer,boolean,jsonb) to authenticated;

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
begin
  if current_user_id is null then raise exception 'Autentikasi diperlukan' using errcode = '42501'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 16 and 128 then
    raise exception 'Kunci idempotensi tidak valid' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_add_ons, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_add_ons, '[]'::jsonb)) > 20 then
    raise exception 'Daftar add-on tidak valid' using errcode = '22023';
  end if;

  select * into existing_order from public.orders
  where idempotency_key = p_idempotency_key;
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

  if invitation_row.template_id is not null then
    select * into template_row from public.templates
    where id = invitation_row.template_id and status = 'published';
    if not found then raise exception 'Template undangan tidak lagi tersedia' using errcode = 'P0002'; end if;
    base_amount := template_row.base_price;
    currency_code := template_row.currency;
    snapshot_items := snapshot_items || jsonb_build_array(jsonb_build_object(
      'item_type', 'template', 'reference_id', template_row.id,
      'description', template_row.title, 'quantity', 1,
      'unit_price', template_row.base_price, 'line_total', template_row.base_price
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
    addon_amount := addon_amount + addon_row.price * quantity_value;
    snapshot_items := snapshot_items || jsonb_build_array(jsonb_build_object(
      'item_type', 'add_on', 'reference_id', addon_row.id,
      'description', addon_row.name_i18n ->> 'id-ID',
      'quantity', quantity_value, 'unit_price', addon_row.price,
      'line_total', addon_row.price * quantity_value,
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
      where cr.coupon_id = coupon_row.id and o.status in ('pending', 'paid')
        and o.expires_at > now()
    ) >= coupon_row.max_redemptions then
      raise exception 'Kuota kupon sudah habis' using errcode = '22023';
    end if;
    if coupon_row.per_user_limit is not null and (
      select count(*) from public.coupon_redemptions cr
      join public.orders o on o.id = cr.order_id
      where cr.coupon_id = coupon_row.id and cr.user_id = current_user_id
        and o.status in ('pending', 'paid') and o.expires_at > now()
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
      'currency', currency_code), p_idempotency_key)
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
revoke all on function public.create_order(uuid,jsonb,text,text) from public, anon;
grant execute on function public.create_order(uuid,jsonb,text,text) to authenticated;

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
revoke all on function public.process_midtrans_notification(text,text,text,text,text,text,bigint,text,jsonb,boolean,timestamptz) from public, anon, authenticated;
grant execute on function public.process_midtrans_notification(text,text,text,text,text,text,bigint,text,jsonb,boolean,timestamptz) to service_role;

create or replace function public.create_invitation_revision(p_invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  current_user_id uuid := auth.uid();
  invitation_row public.invitations%rowtype;
  published_row public.invitation_versions%rowtype;
  next_version integer;
  new_version_id uuid;
begin
  if current_user_id is null then raise exception 'Autentikasi diperlukan' using errcode = '42501'; end if;
  select * into invitation_row from public.invitations
  where id = p_invitation_id and owner_user_id = current_user_id
    and status in ('active', 'expired') and published_version_id is not null
  for update;
  if not found then raise exception 'Undangan aktif tidak ditemukan' using errcode = 'P0002'; end if;
  if invitation_row.draft_version_id is not null then
    select * into published_row from public.invitation_versions
    where id = invitation_row.draft_version_id and state = 'draft';
    if found then return published_row.id; end if;
  end if;
  select * into published_row from public.invitation_versions
  where id = invitation_row.published_version_id and state = 'published';
  if not found then raise exception 'Versi terbit tidak ditemukan' using errcode = 'P0002'; end if;
  select coalesce(max(version_no), 0) + 1 into next_version
  from public.invitation_versions where invitation_id = p_invitation_id;
  insert into public.invitation_versions(invitation_id, version_no, schema_version,
    document, asset_manifest, state, created_by)
  values (p_invitation_id, next_version, published_row.schema_version,
    published_row.document, published_row.asset_manifest, 'draft', current_user_id)
  returning id into new_version_id;
  update public.invitations set draft_version_id = new_version_id where id = p_invitation_id;
  return new_version_id;
end;
$$;
revoke all on function public.create_invitation_revision(uuid) from public, anon;
grant execute on function public.create_invitation_revision(uuid) to authenticated;

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
  update public.invitation_versions set document = p_document where id = current_version.id;
  update public.invitations set title = trim(p_title), updated_at = saved_at
  where id = p_invitation_id;
  return jsonb_build_object('invitation_id', p_invitation_id, 'draft_version_id', current_version.id,
    'version_no', current_version.version_no, 'updated_at', saved_at);
end;
$$;
revoke all on function public.save_invitation_draft(uuid,timestamptz,text,jsonb) from public, anon;
grant execute on function public.save_invitation_draft(uuid,timestamptz,text,jsonb) to authenticated;

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
  select coalesce(max(version_no), 0) + 1 into next_version
  from public.invitation_versions where invitation_id = p_invitation_id;
  insert into public.invitation_versions(invitation_id, version_no, schema_version,
    document, asset_manifest, state, created_by)
  values (p_invitation_id, next_version, draft_row.schema_version,
    draft_row.document, draft_row.asset_manifest, 'published', current_user_id)
  returning id into new_version_id;
  update public.invitations set slug = public_slug, status = 'active',
    active_from = entitlement_row.valid_from, active_until = entitlement_row.valid_until,
    published_version_id = new_version_id, updated_at = now()
  where id = p_invitation_id;
  insert into public.audit_logs(actor_user_id, action, target_type, target_id, before_data, after_data)
  values (current_user_id, 'publish', 'invitations', p_invitation_id,
    jsonb_build_object('published_version_id', invitation_row.published_version_id, 'status', invitation_row.status),
    jsonb_build_object('published_version_id', new_version_id, 'status', 'active', 'slug', public_slug));
  return jsonb_build_object('invitation_id', p_invitation_id, 'slug', public_slug,
    'published_version_id', new_version_id, 'version_no', next_version,
    'active_until', entitlement_row.valid_until);
end;
$$;
revoke all on function public.publish_invitation(uuid,uuid) from public, anon;
grant execute on function public.publish_invitation(uuid,uuid) to authenticated;

create or replace function public.expire_invitations()
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  affected integer;
begin
  if coalesce(auth.jwt() ->> 'role', current_setting('request.jwt.claim.role', true)) <> 'service_role' then
    raise exception 'Hanya service role yang dapat menjalankan proses kedaluwarsa' using errcode = '42501';
  end if;
  update public.invitations set status = 'expired'
  where status = 'active' and active_until <= now();
  get diagnostics affected = row_count;
  update public.entitlements set status = 'expired'
  where status = 'active' and valid_until is not null and valid_until <= now();
  return affected;
end;
$$;
revoke all on function public.expire_invitations() from public, anon, authenticated;
grant execute on function public.expire_invitations() to service_role;

-- RLS tetap menjadi batas baca; seluruh penulisan commerce dilakukan melalui RPC tepercaya.
comment on table public.payment_events is 'Riwayat webhook yang sudah direduksi; jangan simpan signature atau data pembayaran sensitif.';
comment on function public.publish_invitation(uuid,uuid) is 'Menerbitkan snapshot immutable secara atomik setelah entitlement berbayar aktif.';
),
  value jsonb not null check (jsonb_typeof(value) = 'object'),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.commerce_settings(key, value)
values ('blank_canvas_price', '{"amount":0,"currency":"IDR"}'::jsonb)
on conflict (key) do nothing;
