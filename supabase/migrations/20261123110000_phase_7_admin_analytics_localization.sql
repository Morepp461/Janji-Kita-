-- Fase 7: administrasi operasional, persetujuan marketplace, analitik, dan lokalisasi.

create table public.locales (
  code text primary key check (code ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  name text not null check (length(trim(name)) between 1 and 80),
  native_name text not null check (length(trim(native_name)) between 1 and 80),
  is_active boolean not null default true,
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index locales_one_default_idx on public.locales (is_default) where is_default;
insert into public.locales(code, name, native_name, is_active, is_default, sort_order)
values
  ('id-ID', 'Indonesian', 'Bahasa Indonesia', true, true, 10),
  ('en', 'English', 'English', true, false, 20)
on conflict (code) do nothing;

create table public.system_settings (
  key text primary key check (
    key ~ '^[a-z][a-z0-9_.-]{1,119}$'
    and key !~* '(secret|token|password|private.?key|server.?key|credential)'
  ),
  value jsonb not null,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  description text not null default '' check (length(description) <= 500)
);
insert into public.system_settings(key, value, updated_by, description)
values (
  'localization.timezones',
  '["Asia/Jakarta","Asia/Makassar","Asia/Jayapura","Asia/Singapore","UTC"]'::jsonb,
  null,
  'Daftar zona waktu yang dapat dipilih pengguna dan undangan.'
)
on conflict (key) do nothing;

create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  invitation_id uuid not null references public.invitations(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  consent_type text not null check (consent_type in ('marketplace_template')),
  granted boolean not null default false,
  consent_text_version text not null check (length(trim(consent_text_version)) between 1 and 80),
  granted_at timestamptz,
  withdrawn_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  check (not granted or granted_at is not null),
  check (withdrawn_at is null or granted)
);
create unique index consent_records_order_type_unique
  on public.consent_records(order_id, consent_type) where order_id is not null;
create index consent_records_invitation_type_idx
  on public.consent_records(invitation_id, consent_type, granted, granted_at desc);
create index consent_records_user_idx
  on public.consent_records(user_id, created_at desc);

create table public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null check (event_name ~ '^[a-z][a-z0-9_.-]{1,63}$'),
  user_id uuid references public.profiles(id) on delete set null,
  invitation_id uuid references public.invitations(id) on delete set null,
  session_id text check (session_id is null or length(session_id) <= 128),
  properties jsonb not null default '{}'::jsonb
    check (jsonb_typeof(properties) = 'object' and jsonb_object_length(properties) <= 10),
  occurred_at timestamptz not null default now()
);
create index analytics_events_occurred_idx on public.analytics_events(occurred_at desc);
create index analytics_events_name_time_idx on public.analytics_events(event_name, occurred_at desc);
create index analytics_events_user_time_idx on public.analytics_events(user_id, occurred_at desc)
  where user_id is not null;

alter table public.templates
  add column source_type text not null default 'first_party' check (source_type in ('first_party', 'customer')),
  add column source_invitation_id uuid references public.invitations(id) on delete set null,
  add column source_consent_id uuid references public.consent_records(id) on delete set null,
  add column moderation_note text check (moderation_note is null or length(moderation_note) <= 1000),
  add column moderated_by uuid references public.profiles(id) on delete set null,
  add column moderated_at timestamptz;

alter table public.locales enable row level security;
alter table public.system_settings enable row level security;
alter table public.consent_records enable row level security;
alter table public.analytics_events enable row level security;

revoke all on public.locales, public.system_settings, public.consent_records, public.analytics_events from public;
revoke all on public.locales, public.system_settings, public.consent_records, public.analytics_events from anon;
grant select on public.locales to anon, authenticated;
grant select, insert, update, delete on public.locales to authenticated;
grant select, insert, update, delete on public.system_settings to authenticated;
grant select on public.consent_records, public.analytics_events to authenticated;

create policy locales_read_active on public.locales
  for select to anon, authenticated using (is_active);
create policy locales_admin_select on public.locales
  for select to authenticated using (app_private.has_permission('locales.manage'));
create policy locales_admin_insert on public.locales
  for insert to authenticated with check (app_private.has_permission('locales.manage'));
create policy locales_admin_update on public.locales
  for update to authenticated
  using (app_private.has_permission('locales.manage'))
  with check (app_private.has_permission('locales.manage'));
create policy locales_admin_delete on public.locales
  for delete to authenticated using (app_private.has_permission('locales.manage'));

create policy system_settings_admin_select on public.system_settings
  for select to authenticated using (app_private.has_permission('settings.manage'));
create policy system_settings_admin_insert on public.system_settings
  for insert to authenticated with check (app_private.has_permission('settings.manage'));
create policy system_settings_admin_update on public.system_settings
  for update to authenticated
  using (app_private.has_permission('settings.manage'))
  with check (app_private.has_permission('settings.manage'));
create policy system_settings_admin_delete on public.system_settings
  for delete to authenticated using (app_private.has_permission('settings.manage'));

create policy consent_records_owner_select on public.consent_records
  for select to authenticated using (user_id = (select auth.uid()));
create policy consent_records_admin_select on public.consent_records
  for select to authenticated using (app_private.has_permission('consent.read'));

create policy analytics_events_admin_select on public.analytics_events
  for select to authenticated using (app_private.has_permission('analytics.read'));

insert into public.role_permissions(role, permission_key)
select roles.role, permissions.permission_key
from (values ('admin'), ('super_admin')) as roles(role)
cross join (values ('analytics.read'), ('consent.read'), ('settings.manage'), ('locales.manage')) as permissions(permission_key)
where not exists (
  select 1 from public.role_permissions existing
  where existing.role = roles.role and existing.permission_key = permissions.permission_key
);

create or replace function public.get_public_localization_config()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'locales',
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', l.code,
        'name', l.name,
        'native_name', l.native_name,
        'is_default', l.is_default
      ) order by l.sort_order, l.code)
      from public.locales l where l.is_active
    ), '[]'::jsonb),
    'timezones',
    coalesce((
      select s.value
      from public.system_settings s
      where s.key = 'localization.timezones'
    ), '["Asia/Jakarta","Asia/Makassar","Asia/Jayapura","UTC"]'::jsonb)
  );
$$;
revoke all on function public.get_public_localization_config() from public;
grant execute on function public.get_public_localization_config() to anon, authenticated;

create or replace function public.admin_set_default_locale(p_code text)
returns void
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
begin
  if not app_private.has_permission('locales.manage') then
    raise exception 'Tidak memiliki izin mengelola bahasa';
  end if;
  if not exists (select 1 from public.locales where code = p_code and is_active) then
    raise exception 'Bahasa tidak ditemukan atau tidak aktif';
  end if;
  update public.locales set is_default = false where is_default;
  update public.locales set is_default = true, updated_at = now() where code = p_code;
end;
$$;
revoke all on function public.admin_set_default_locale(text) from public, anon;
grant execute on function public.admin_set_default_locale(text) to authenticated;

create or replace function public.update_invitation_localization(
  p_invitation_id uuid,
  p_locale text,
  p_timezone text
)
returns timestamptz
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  updated_at_value timestamptz;
  allowed_timezones jsonb;
begin
  if auth.uid() is null or not app_private.can_edit_invitation(p_invitation_id) then
    raise exception 'Tidak memiliki akses mengubah undangan';
  end if;
  if not exists (select 1 from public.locales where code = p_locale and is_active) then
    raise exception 'Bahasa undangan tidak tersedia';
  end if;
  select value into allowed_timezones from public.system_settings
  where key = 'localization.timezones';
  if not exists (
    select 1 from jsonb_array_elements_text(coalesce(allowed_timezones, '["Asia/Jakarta","Asia/Makassar","Asia/Jayapura","UTC"]'::jsonb)) as zones(timezone)
    where timezone = p_timezone
  ) then
    raise exception 'Zona waktu undangan tidak tersedia';
  end if;
  update public.invitations
  set locale = p_locale, timezone = p_timezone, updated_at = now()
  where id = p_invitation_id
  returning updated_at into updated_at_value;
  return updated_at_value;
end;
$$;
revoke all on function public.update_invitation_localization(uuid,text,text) from public, anon;
grant execute on function public.update_invitation_localization(uuid,text,text) to authenticated;

create or replace function public.record_marketplace_consent(
  p_invitation_id uuid,
  p_order_id uuid,
  p_consent_text_version text
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  saved_id uuid;
begin
  if auth.uid() is null then raise exception 'Autentikasi diperlukan'; end if;
  if length(trim(coalesce(p_consent_text_version, ''))) not between 1 and 80 then
    raise exception 'Versi persetujuan tidak valid';
  end if;
  if not exists (
    select 1 from public.invitations i
    where i.id = p_invitation_id and i.owner_user_id = auth.uid()
  ) then
    raise exception 'Hanya pemilik undangan yang dapat memberikan persetujuan';
  end if;
  if not exists (
    select 1 from public.orders o
    where o.id = p_order_id and o.invitation_id = p_invitation_id
      and (o.owner_user_id = auth.uid() or o.payer_user_id = auth.uid())
  ) then
    raise exception 'Pesanan tidak sesuai dengan undangan';
  end if;
  insert into public.consent_records(
    user_id, invitation_id, order_id, consent_type, granted,
    consent_text_version, granted_at, metadata
  ) values (
    auth.uid(), p_invitation_id, p_order_id, 'marketplace_template', true,
    p_consent_text_version, now(), jsonb_build_object('scope', 'marketplace_template', 'moderation_status', 'pending')
  )
  on conflict (order_id, consent_type) where order_id is not null
  do update set
    user_id = excluded.user_id,
    granted = true,
    consent_text_version = excluded.consent_text_version,
    granted_at = now(),
    withdrawn_at = null,
    metadata = jsonb_build_object('scope', 'marketplace_template', 'moderation_status', 'pending')
  returning id into saved_id;
  return saved_id;
end;
$$;
revoke all on function public.record_marketplace_consent(uuid,uuid,text) from public, anon;
grant execute on function public.record_marketplace_consent(uuid,uuid,text) to authenticated;

create or replace function public.withdraw_marketplace_consent(p_consent_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.consent_records
  set withdrawn_at = coalesce(withdrawn_at, now())
  where id = p_consent_id and user_id = auth.uid()
    and consent_type = 'marketplace_template' and granted;
  if not found then raise exception 'Persetujuan aktif tidak ditemukan'; end if;
end;
$$;
revoke all on function public.withdraw_marketplace_consent(uuid) from public, anon;
grant execute on function public.withdraw_marketplace_consent(uuid) to authenticated;

create or replace function public.admin_review_marketplace_consent(
  p_consent_id uuid,
  p_decision text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
begin
  if not app_private.has_permission('consent.read') then
    raise exception 'Tidak memiliki izin meninjau persetujuan marketplace';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Keputusan moderasi tidak valid';
  end if;
  if length(coalesce(p_note, '')) > 1000 then
    raise exception 'Catatan moderasi terlalu panjang';
  end if;
  update public.consent_records
  set metadata = metadata || jsonb_build_object(
    'moderation_status', p_decision,
    'reviewed_by', auth.uid(),
    'reviewed_at', now(),
    'review_note', nullif(trim(p_note), '')
  )
  where id = p_consent_id and granted and withdrawn_at is null;
  if not found then raise exception 'Persetujuan aktif tidak ditemukan'; end if;
end;
$$;
revoke all on function public.admin_review_marketplace_consent(uuid,text,text) from public, anon;
grant execute on function public.admin_review_marketplace_consent(uuid,text,text) to authenticated;

create or replace function public.admin_set_template_moderation(
  p_template_id uuid,
  p_status text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  template_row public.templates%rowtype;
  consent_row public.consent_records%rowtype;
begin
  if not app_private.has_permission('templates.manage') then
    raise exception 'Tidak memiliki izin moderasi template';
  end if;
  if p_status not in ('draft', 'published', 'archived') then
    raise exception 'Status moderasi tidak valid';
  end if;
  if length(coalesce(p_note, '')) > 1000 then
    raise exception 'Catatan moderasi terlalu panjang';
  end if;
  select * into template_row from public.templates where id = p_template_id for update;
  if not found then raise exception 'Template tidak ditemukan'; end if;
  if p_status = 'published' and template_row.current_version_id is null then
    raise exception 'Template belum memiliki versi yang dapat diterbitkan';
  end if;
  if template_row.source_type = 'customer' and (template_row.source_invitation_id is null or template_row.source_consent_id is null) then
    raise exception 'Template dari pelanggan wajib ditautkan ke persetujuan aktif';
  end if;
  if template_row.source_consent_id is not null then
    select * into consent_row from public.consent_records
    where id = template_row.source_consent_id
      and invitation_id = template_row.source_invitation_id
      and granted and withdrawn_at is null
      and metadata ->> 'moderation_status' = 'approved';
    if not found then raise exception 'Persetujuan pemilik belum disetujui atau sudah dicabut'; end if;
  end if;
  update public.templates
  set status = p_status,
      moderation_note = nullif(trim(p_note), ''),
      moderated_by = auth.uid(),
      moderated_at = now(),
      updated_at = now()
  where id = p_template_id;
end;
$$;
revoke all on function public.admin_set_template_moderation(uuid,text,text) from public, anon;
grant execute on function public.admin_set_template_moderation(uuid,text,text) to authenticated;

create or replace function public.track_analytics_event(
  p_event_name text,
  p_invitation_id uuid default null,
  p_properties jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  saved_id uuid;
  safe_properties jsonb;
begin
  if auth.uid() is null then raise exception 'Autentikasi diperlukan'; end if;
  if p_event_name not in ('dashboard_view', 'marketplace_view', 'editor_view', 'checkout_view', 'admin_view', 'consent_settings_view') then
    raise exception 'Jenis peristiwa analitik tidak diizinkan';
  end if;
  if p_invitation_id is not null and not app_private.can_view_invitation(p_invitation_id) then
    raise exception 'Tidak memiliki akses ke undangan';
  end if;
  if jsonb_typeof(coalesce(p_properties, '{}'::jsonb)) <> 'object' then
    raise exception 'Properti analitik tidak valid';
  end if;
  safe_properties := jsonb_strip_nulls(jsonb_build_object(
    'route', left(coalesce(p_properties ->> 'route', ''), 120)
  ));
  insert into public.analytics_events(event_name, user_id, invitation_id, properties)
  values (p_event_name, auth.uid(), p_invitation_id, safe_properties)
  returning id into saved_id;
  return saved_id;
end;
$$;
revoke all on function public.track_analytics_event(text,uuid,jsonb) from public, anon;
grant execute on function public.track_analytics_event(text,uuid,jsonb) to authenticated;

create or replace function public.admin_get_analytics_summary(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  summary jsonb;
  day_count integer := greatest(1, least(coalesce(p_days, 30), 90));
begin
  if not app_private.has_permission('analytics.read') then
    raise exception 'Tidak memiliki izin membaca analitik';
  end if;
  select jsonb_build_object(
    'users_total', (select count(*) from public.profiles),
    'invitations_total', (select count(*) from public.invitations where deleted_at is null),
    'invitations_active', (select count(*) from public.invitations where status = 'active' and deleted_at is null),
    'invitations_draft', (select count(*) from public.invitations where status = 'draft' and deleted_at is null),
    'templates_total', (select count(*) from public.templates),
    'templates_published', (select count(*) from public.templates where status = 'published'),
    'templates_pending', (select count(*) from public.templates where status = 'draft'),
    'orders_total', (select count(*) from public.orders),
    'orders_paid', (select count(*) from public.orders where status in ('paid', 'settled', 'captured')),
    'orders_pending', (select count(*) from public.orders where status = 'pending'),
    'consents_active', (select count(*) from public.consent_records where granted and withdrawn_at is null),
    'consents_withdrawn', (select count(*) from public.consent_records where withdrawn_at is not null),
    'events_total', (select count(*) from public.analytics_events where occurred_at >= now() - make_interval(days => day_count)),
    'events_by_name', coalesce((
      select jsonb_object_agg(event_name, event_count)
      from (
        select event_name, count(*) as event_count
        from public.analytics_events
        where occurred_at >= now() - make_interval(days => day_count)
        group by event_name
      ) event_counts
    ), '{}'::jsonb),
    'period_days', day_count
  ) into summary;
  return summary;
end;
$$;
revoke all on function public.admin_get_analytics_summary(integer) from public, anon;
grant execute on function public.admin_get_analytics_summary(integer) to authenticated;

create or replace function public.audit_phase7_admin_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  before_value jsonb;
  after_value jsonb;
  actor uuid := auth.uid();
begin
  if tg_op <> 'INSERT' then
    before_value := to_jsonb(old);
  end if;
  if tg_op <> 'DELETE' then
    after_value := to_jsonb(new);
  end if;
  if tg_table_name = 'system_settings' then
    before_value := case when before_value is null then null else before_value - 'value' end;
    after_value := case when after_value is null then null else after_value - 'value' end;
  elsif tg_table_name = 'consent_records' then
    before_value := case when before_value is null then null else before_value - 'metadata' end;
    after_value := case when after_value is null then null else after_value - 'metadata' end;
  end if;
  insert into public.audit_logs(actor_user_id, action, target_type, before_data, after_data)
  values (actor, lower(tg_table_name) || '.' || lower(tg_op), tg_table_name, before_value, after_value);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger locales_audit_phase7
  after insert or update or delete on public.locales
  for each row execute function public.audit_phase7_admin_change();
create trigger system_settings_audit_phase7
  after insert or update or delete on public.system_settings
  for each row execute function public.audit_phase7_admin_change();
create trigger consent_records_audit_phase7
  after insert or update on public.consent_records
  for each row execute function public.audit_phase7_admin_change();
create trigger templates_audit_phase7
  after update on public.templates
  for each row
  when (
    old.status is distinct from new.status
    or old.source_invitation_id is distinct from new.source_invitation_id
    or old.source_consent_id is distinct from new.source_consent_id
    or old.moderation_note is distinct from new.moderation_note
  )
  execute function public.audit_phase7_admin_change();


-- Template baru dan versi baru wajib melewati antrean moderasi sebelum terlihat di marketplace.
drop function if exists public.admin_create_template(text,text,text,uuid,uuid,bigint,jsonb,uuid);
create or replace function public.admin_create_template(
  p_slug text,
  p_title text,
  p_description text,
  p_category_id uuid,
  p_style_id uuid,
  p_base_price bigint,
  p_document jsonb,
  p_thumbnail_asset_id uuid default null,
  p_source_type text default 'first_party'
)
returns uuid
language plpgsql
set search_path = public, app_private, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  new_template_id uuid;
  new_version_id uuid;
begin
  if current_user_id is null or not app_private.has_permission('templates.manage') then
    raise exception 'Tidak memiliki izin mengelola template' using errcode = '42501';
  end if;
  if p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or length(trim(p_title)) not between 1 and 120 then
    raise exception 'Slug atau judul template tidak valid' using errcode = '22023';
  end if;
  if jsonb_typeof(p_document) <> 'object' or coalesce((p_document ->> 'schemaVersion')::integer, 0) <> 1 then
    raise exception 'Dokumen template harus memakai schemaVersion 1' using errcode = '22023';
  end if;
  if p_source_type not in ('first_party', 'customer') then
    raise exception 'Sumber desain template tidak valid' using errcode = '22023';
  end if;
  if not exists (select 1 from public.categories where id = p_category_id and is_active)
    or not exists (select 1 from public.design_styles where id = p_style_id and is_active) then
    raise exception 'Kategori atau gaya desain tidak tersedia' using errcode = '22023';
  end if;

  insert into public.templates (
    slug, title, description, category_id, style_id, base_price, status,
    thumbnail_asset_id, created_by, source_type
  ) values (
    p_slug, trim(p_title), coalesce(p_description, ''), p_category_id, p_style_id,
    greatest(coalesce(p_base_price, 0), 0), 'draft', p_thumbnail_asset_id, current_user_id, p_source_type
  ) returning id into new_template_id;

  insert into public.template_versions (
    template_id, version_no, schema_version, document, asset_manifest, change_note, created_by
  ) values (
    new_template_id, 1, 1, p_document, '{}'::jsonb, 'Versi awal · menunggu moderasi', current_user_id
  ) returning id into new_version_id;

  update public.templates
  set current_version_id = new_version_id,
      moderation_note = 'Menunggu peninjauan admin'
  where id = new_template_id;

  return new_template_id;
end;
$$;
revoke all on function public.admin_create_template(text,text,text,uuid,uuid,bigint,jsonb,uuid,text) from public, anon;
grant execute on function public.admin_create_template(text,text,text,uuid,uuid,bigint,jsonb,uuid,text) to authenticated;

create or replace function public.admin_create_template_version(
  p_template_id uuid,
  p_document jsonb,
  p_change_note text default null
)
returns uuid
language plpgsql
set search_path = public, app_private, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  next_version integer;
  new_version_id uuid;
begin
  if current_user_id is null or not app_private.has_permission('templates.manage') then
    raise exception 'Tidak memiliki izin mengelola template' using errcode = '42501';
  end if;
  if jsonb_typeof(p_document) <> 'object' or coalesce((p_document ->> 'schemaVersion')::integer, 0) <> 1 then
    raise exception 'Dokumen template harus memakai schemaVersion 1' using errcode = '22023';
  end if;

  perform 1 from public.templates where id = p_template_id for update;
  if not found then raise exception 'Template tidak ditemukan' using errcode = 'P0002'; end if;

  select coalesce(max(version_no), 0) + 1 into next_version
  from public.template_versions where template_id = p_template_id;

  insert into public.template_versions (
    template_id, version_no, schema_version, document, asset_manifest, change_note, created_by
  ) values (
    p_template_id, next_version, 1, p_document, '{}'::jsonb,
    left(coalesce(p_change_note, 'Versi baru · menunggu moderasi'), 500), current_user_id
  ) returning id into new_version_id;

  update public.templates
  set current_version_id = new_version_id,
      status = 'draft',
      moderation_note = 'Versi baru menunggu peninjauan admin',
      moderated_by = null,
      moderated_at = null,
      updated_at = now()
  where id = p_template_id;

  return new_version_id;
end;
$$;
revoke all on function public.admin_create_template_version(uuid,jsonb,text) from public, anon;
grant execute on function public.admin_create_template_version(uuid,jsonb,text) to authenticated;

create trigger media_assets_audit_phase7
  after update on public.media_assets
  for each row
  when (
    old.processing_status is distinct from new.processing_status
    or old.visibility is distinct from new.visibility
  )
  execute function public.audit_phase7_admin_change();


create or replace function public.admin_link_template_consent(
  p_template_id uuid,
  p_invitation_id uuid,
  p_consent_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
begin
  if not app_private.has_permission('templates.manage') then
    raise exception 'Tidak memiliki izin mengelola template';
  end if;
  if not exists (
    select 1 from public.consent_records
    where id = p_consent_id and invitation_id = p_invitation_id
      and consent_type = 'marketplace_template'
      and granted and withdrawn_at is null
      and metadata ->> 'moderation_status' = 'approved'
  ) then
    raise exception 'Persetujuan belum disetujui, tidak aktif, atau tidak cocok dengan undangan';
  end if;
  update public.templates
  set source_type = 'customer',
      source_invitation_id = p_invitation_id,
      source_consent_id = p_consent_id,
      status = 'draft',
      moderation_note = 'Persetujuan ditautkan; menunggu moderasi template',
      moderated_by = null,
      moderated_at = null,
      updated_at = now()
  where id = p_template_id;
  if not found then raise exception 'Template tidak ditemukan'; end if;
end;
$$;
revoke all on function public.admin_link_template_consent(uuid,uuid,uuid) from public, anon;
grant execute on function public.admin_link_template_consent(uuid,uuid,uuid) to authenticated;
