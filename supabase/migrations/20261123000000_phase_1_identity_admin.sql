-- Fase 1: identitas, peran, izin, administrasi, audit, kategori, gaya, dan feature flags.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  avatar_path text,
  phone text,
  preferred_locale text not null default 'id-ID',
  timezone text not null default 'Asia/Jakarta',
  account_status text not null default 'active'
    check (account_status in ('active', 'suspended', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null
    check (role in ('user', 'admin', 'super_admin', 'finance', 'support', 'moderator', 'reseller')),
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create table public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  role text not null
    check (role in ('user', 'admin', 'super_admin', 'finance', 'support', 'moderator', 'reseller')),
  permission_key text not null,
  created_at timestamptz not null default now(),
  unique (role, permission_key)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name_i18n jsonb not null check (jsonb_typeof(name_i18n) = 'object'),
  description_i18n jsonb not null default '{}'::jsonb check (jsonb_typeof(description_i18n) = 'object'),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.design_styles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name_i18n jsonb not null check (jsonb_typeof(name_i18n) = 'object'),
  description_i18n jsonb not null default '{}'::jsonb check (jsonb_typeof(description_i18n) = 'object'),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.feature_flags (
  key text primary key check (key ~ '^[a-z][a-z0-9_.-]*$'),
  enabled boolean not null default false,
  is_public boolean not null default false,
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  before_data jsonb,
  after_data jsonb,
  ip_hash text,
  user_agent_summary text,
  created_at timestamptz not null default now()
);

create index profiles_account_status_idx on public.profiles(account_status);
create index profiles_created_at_idx on public.profiles(created_at);
create index user_roles_user_id_idx on public.user_roles(user_id);
create index categories_active_order_idx on public.categories(is_active, sort_order);
create index design_styles_active_order_idx on public.design_styles(is_active, sort_order);
create index audit_logs_actor_created_idx on public.audit_logs(actor_user_id, created_at desc);
create index audit_logs_target_created_idx on public.audit_logs(target_type, target_id, created_at desc);

insert into public.role_permissions (role, permission_key) values
  ('admin', 'admin.access'),
  ('admin', 'profiles.read'),
  ('admin', 'categories.manage'),
  ('admin', 'styles.manage'),
  ('admin', 'feature_flags.manage'),
  ('admin', 'audit.read'),
  ('super_admin', 'admin.access'),
  ('super_admin', 'profiles.read'),
  ('super_admin', 'categories.manage'),
  ('super_admin', 'styles.manage'),
  ('super_admin', 'feature_flags.manage'),
  ('super_admin', 'audit.read'),
  ('super_admin', 'roles.manage')
on conflict (role, permission_key) do nothing;

create or replace function public.has_permission(permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and (
        ur.role = 'super_admin'
        or exists (
          select 1
          from public.role_permissions rp
          where rp.role = ur.role
            and rp.permission_key = $1
        )
      )
  );
$$;

revoke all on function public.has_permission(text) from public, anon;
grant execute on function public.has_permission(text) to anon, authenticated;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  requested_name text;
begin
  requested_name := left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), ''), 80);
  insert into public.profiles (id, display_name)
  values (new.id, requested_name)
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'user')
  on conflict (user_id, role) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger categories_set_updated_at before update on public.categories
  for each row execute function public.set_updated_at();
create trigger design_styles_set_updated_at before update on public.design_styles
  for each row execute function public.set_updated_at();
create trigger feature_flags_set_updated_at before update on public.feature_flags
  for each row execute function public.set_updated_at();

create or replace function public.write_admin_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  old_json jsonb;
  new_json jsonb;
  target_uuid uuid;
  target_name text;
begin
  if tg_op <> 'INSERT' then old_json := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then new_json := to_jsonb(new); end if;

  if tg_table_name = 'feature_flags' then
    target_name := coalesce(new_json ->> 'key', old_json ->> 'key');
  else
    target_uuid := coalesce((new_json ->> 'id')::uuid, (old_json ->> 'id')::uuid);
  end if;

  insert into public.audit_logs (
    actor_user_id, action, target_type, target_id, before_data, after_data
  ) values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    target_uuid,
    old_json,
    case when target_name is null then new_json else jsonb_build_object('key', target_name) || coalesce(new_json, '{}'::jsonb) end
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger categories_audit after insert or update or delete on public.categories
  for each row execute function public.write_admin_audit_log();
create trigger design_styles_audit after insert or update or delete on public.design_styles
  for each row execute function public.write_admin_audit_log();
create trigger feature_flags_audit after insert or update or delete on public.feature_flags
  for each row execute function public.write_admin_audit_log();
create trigger user_roles_audit after insert or update or delete on public.user_roles
  for each row execute function public.write_admin_audit_log();

create or replace function public.admin_set_user_role(
  p_user_id uuid,
  p_role text,
  p_action text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission('roles.manage') then
    raise exception 'Tidak memiliki izin untuk mengelola peran' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Peran akun sendiri tidak dapat diubah' using errcode = '42501';
  end if;
  if p_role not in ('user', 'admin', 'super_admin', 'finance', 'support', 'moderator', 'reseller') then
    raise exception 'Peran tidak valid' using errcode = '22023';
  end if;
  if p_action not in ('grant', 'revoke') then
    raise exception 'Aksi tidak valid' using errcode = '22023';
  end if;

  if p_action = 'grant' then
    insert into public.user_roles (user_id, role, granted_by)
    values (p_user_id, p_role, auth.uid())
    on conflict (user_id, role) do nothing;
  else
    delete from public.user_roles
    where user_id = p_user_id and role = p_role;
  end if;
end;
$$;

revoke all on function public.admin_set_user_role(uuid, text, text) from public, anon;
grant execute on function public.admin_set_user_role(uuid, text, text) to authenticated;

-- Bootstrap hanya dapat dipanggil oleh service_role dan hanya sebelum super admin pertama ada.
create or replace function public.bootstrap_first_super_admin(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.user_roles where role = 'super_admin') then
    raise exception 'Super admin pertama sudah ditetapkan' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Profil pengguna tidak ditemukan' using errcode = 'P0002';
  end if;
  insert into public.user_roles (user_id, role)
  values (p_user_id, 'super_admin')
  on conflict (user_id, role) do nothing;
end;
$$;

revoke all on function public.bootstrap_first_super_admin(uuid) from public, anon, authenticated;
grant execute on function public.bootstrap_first_super_admin(uuid) to service_role;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.categories enable row level security;
alter table public.design_styles enable row level security;
alter table public.feature_flags enable row level security;
alter table public.audit_logs enable row level security;

grant select on public.profiles, public.user_roles, public.role_permissions,
  public.categories, public.design_styles, public.feature_flags, public.audit_logs to authenticated;
grant select on public.categories, public.design_styles, public.feature_flags to anon;
grant insert, update, delete on public.categories, public.design_styles, public.feature_flags to authenticated;
grant update (display_name, avatar_path, phone, preferred_locale, timezone)
  on public.profiles to authenticated;

create policy profiles_read_self on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_read_admin on public.profiles
  for select to authenticated
  using (public.has_permission('profiles.read'));
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy user_roles_read_self on public.user_roles
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy user_roles_read_admin on public.user_roles
  for select to authenticated
  using (public.has_permission('roles.manage'));
create policy role_permissions_read_admin on public.role_permissions
  for select to authenticated
  using (public.has_permission('roles.manage'));

create policy categories_read_active on public.categories
  for select to anon, authenticated
  using (is_active or public.has_permission('categories.manage'));
create policy categories_admin_manage on public.categories
  for all to authenticated
  using (public.has_permission('categories.manage'))
  with check (public.has_permission('categories.manage'));

create policy design_styles_read_active on public.design_styles
  for select to anon, authenticated
  using (is_active or public.has_permission('styles.manage'));
create policy design_styles_admin_manage on public.design_styles
  for all to authenticated
  using (public.has_permission('styles.manage'))
  with check (public.has_permission('styles.manage'));

create policy feature_flags_read_public on public.feature_flags
  for select to anon, authenticated
  using (is_public or public.has_permission('feature_flags.manage'));
create policy feature_flags_admin_manage on public.feature_flags
  for all to authenticated
  using (public.has_permission('feature_flags.manage'))
  with check (public.has_permission('feature_flags.manage'));

create policy audit_logs_read_admin on public.audit_logs
  for select to authenticated
  using (public.has_permission('audit.read'));

insert into public.categories (slug, name_i18n, sort_order) values
  ('wedding', '{"id-ID":"Pernikahan","en":"Wedding"}', 1),
  ('birthday', '{"id-ID":"Ulang Tahun","en":"Birthday"}', 2),
  ('family', '{"id-ID":"Keluarga","en":"Family"}', 3),
  ('graduation', '{"id-ID":"Wisuda","en":"Graduation"}', 4),
  ('corporate-business', '{"id-ID":"Korporat & Bisnis","en":"Corporate & Business"}', 5),
  ('community', '{"id-ID":"Komunitas","en":"Community"}', 6),
  ('religious', '{"id-ID":"Keagamaan","en":"Religious"}', 7),
  ('general-event', '{"id-ID":"Acara Umum","en":"General Event"}', 8)
on conflict (slug) do nothing;

insert into public.design_styles (slug, name_i18n, sort_order) values
  ('minimalist', '{"id-ID":"Minimalis","en":"Minimalist"}', 1),
  ('luxury', '{"id-ID":"Mewah","en":"Luxury"}', 2),
  ('botanical', '{"id-ID":"Botani","en":"Botanical"}', 3),
  ('modern', '{"id-ID":"Modern","en":"Modern"}', 4),
  ('traditional', '{"id-ID":"Tradisional","en":"Traditional"}', 5),
  ('vintage', '{"id-ID":"Vintage","en":"Vintage"}', 6),
  ('cute-playful', '{"id-ID":"Ceria","en":"Cute / Playful"}', 7),
  ('editorial', '{"id-ID":"Editorial","en":"Editorial"}', 8),
  ('cinematic', '{"id-ID":"Sinematik","en":"Cinematic"}', 9),
  ('custom-experimental', '{"id-ID":"Kustom / Eksperimental","en":"Custom / Experimental"}', 10)
on conflict (slug) do nothing;

insert into public.feature_flags (key, enabled, is_public, config) values
  ('registration.enabled', true, true, '{}'::jsonb),
  ('admin.categories', true, false, '{}'::jsonb),
  ('admin.styles', true, false, '{}'::jsonb),
  ('admin.feature_flags', true, false, '{}'::jsonb)
on conflict (key) do nothing;
