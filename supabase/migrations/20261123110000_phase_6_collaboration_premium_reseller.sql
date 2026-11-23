-- Fase 6: kolaborasi, Premium, dan reseller.
-- Seluruh perubahan bersifat aditif. Pembayaran langganan nyata tetap menunggu
-- konfigurasi provider dan persetujuan gerbang rilis monetisasi.

create table public.invitation_collaborators (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.invitations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('editor', 'viewer')),
  invited_by uuid not null references public.profiles(id),
  status text not null default 'pending' check (status in ('invited', 'pending', 'accepted', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (invitation_id, user_id)
);
create index invitation_collaborators_user_status_idx
  on public.invitation_collaborators(user_id, status, role);
create index invitation_collaborators_invitation_status_idx
  on public.invitation_collaborators(invitation_id, status, role);

create table public.collaborator_invites (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.invitations(id) on delete cascade,
  invited_email text not null,
  role text not null check (role in ('editor', 'viewer')),
  invited_by uuid not null references public.profiles(id),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_by uuid null references public.profiles(id),
  accepted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (invited_email = lower(trim(invited_email))),
  check (length(invited_email) between 3 and 254)
);
create unique index collaborator_invites_pending_email_idx
  on public.collaborator_invites(invitation_id, invited_email)
  where status = 'pending';
create index collaborator_invites_email_status_idx
  on public.collaborator_invites(invited_email, status, expires_at);

create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_-]{1,63}$'),
  name text not null check (length(trim(name)) between 1 and 100),
  monthly_price bigint null check (monthly_price is null or monthly_price >= 0),
  currency char(3) not null default 'IDR',
  collaborator_limit integer not null check (collaborator_limit > 2 and collaborator_limit <= 100),
  billing_provider text null,
  trial_days integer not null default 0 check (trial_days between 0 and 90),
  grace_period_days integer not null default 0 check (grace_period_days between 0 and 60),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.subscription_plans(code, name, collaborator_limit, is_active)
values ('premium_monthly', 'Premium Bulanan', 5, false)
on conflict (code) do nothing;

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null,
  provider_subscription_id text null,
  plan_code text not null references public.subscription_plans(code),
  status text not null check (status in ('trialing', 'active', 'past_due', 'cancelled', 'expired')),
  period_start timestamptz not null,
  period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end > period_start)
);
create unique index subscriptions_provider_id_idx
  on public.subscriptions(provider, provider_subscription_id)
  where provider_subscription_id is not null;
create index subscriptions_user_status_idx on public.subscriptions(user_id, status, period_end);

create table public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  subscription_id uuid null references public.subscriptions(id) on delete set null,
  event_type text not null,
  payload_redacted jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload_redacted) = 'object'),
  processed_at timestamptz null,
  created_at timestamptz not null default now(),
  unique(provider, provider_event_id)
);

create table public.reseller_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  status text not null default 'applied'
    check (status in ('applied', 'approved', 'rejected', 'suspended')),
  business_name text not null check (length(trim(business_name)) between 1 and 120),
  contact_email text not null,
  pricing_tier text not null default 'standard',
  terms_version text not null,
  approved_by uuid null references public.profiles(id),
  approved_at timestamptz null,
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reseller_profiles_status_created_idx on public.reseller_profiles(status, created_at);

create table public.reseller_price_rules (
  id uuid primary key default gen_random_uuid(),
  reseller_tier text not null,
  template_id uuid null references public.templates(id) on delete cascade,
  add_on_id uuid null references public.add_ons(id) on delete cascade,
  wholesale_price bigint not null check (wholesale_price >= 0),
  currency char(3) not null default 'IDR',
  valid_from timestamptz not null default now(),
  valid_until timestamptz null,
  created_at timestamptz not null default now(),
  check ((template_id is not null)::integer + (add_on_id is not null)::integer = 1),
  check (valid_until is null or valid_until > valid_from)
);
create index reseller_price_rules_lookup_idx
  on public.reseller_price_rules(reseller_tier, valid_from desc, template_id, add_on_id);

create table public.reseller_clients (
  id uuid primary key default gen_random_uuid(),
  reseller_user_id uuid not null references public.profiles(id) on delete cascade,
  client_user_id uuid null references public.profiles(id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 120),
  email text not null,
  phone text null,
  notes text null,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index reseller_clients_email_idx
  on public.reseller_clients(reseller_user_id, lower(email));
create index reseller_clients_reseller_created_idx
  on public.reseller_clients(reseller_user_id, created_at desc);

create table public.reseller_sales (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  reseller_user_id uuid not null references public.profiles(id),
  client_id uuid null references public.reseller_clients(id) on delete set null,
  wholesale_amount bigint not null check (wholesale_amount >= 0),
  resale_amount bigint null check (resale_amount is null or resale_amount >= 0),
  currency char(3) not null default 'IDR',
  recorded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index reseller_sales_reseller_created_idx on public.reseller_sales(reseller_user_id, created_at desc);

insert into public.role_permissions(role, permission_key)
select roles.role, permissions.permission_key
from (values ('admin'), ('super_admin')) as roles(role)
cross join (values ('reseller.manage'), ('subscriptions.manage')) as permissions(permission_key)
on conflict (role, permission_key) do nothing;

create or replace function app_private.collaborator_limit_for_invitation(p_invitation_id uuid)
returns integer
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(max((e.value ->> 'collaborator_limit')::integer), 2)
  from public.invitations i
  left join public.entitlements e
    on e.user_id = i.owner_user_id
   and e.entitlement_key = 'collaborator_limit'
   and e.status = 'active'
   and e.valid_from <= now()
   and (e.valid_until is null or e.valid_until > now())
  where i.id = p_invitation_id;
$$;

create or replace function app_private.can_view_invitation(p_invitation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1 from public.invitations i
    where i.id = p_invitation_id and i.owner_user_id = (select auth.uid())
  ) or exists (
    select 1 from public.invitation_collaborators c
    where c.invitation_id = p_invitation_id
      and c.user_id = (select auth.uid())
      and c.status = 'accepted'
  );
$$;

create or replace function app_private.can_edit_invitation(p_invitation_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  owner_id uuid;
  limit_count integer;
  editor_rank bigint;
begin
  select i.owner_user_id into owner_id
  from public.invitations i where i.id = p_invitation_id;
  if owner_id is null then return false; end if;
  if owner_id = (select auth.uid()) then return true; end if;

  limit_count := app_private.collaborator_limit_for_invitation(p_invitation_id);
  select ranked.editor_rank into editor_rank
  from (
    select c.user_id,
      row_number() over (order by c.created_at, c.id) as editor_rank
    from public.invitation_collaborators c
    where c.invitation_id = p_invitation_id
      and c.role = 'editor'
      and c.status = 'accepted'
  ) ranked
  where ranked.user_id = (select auth.uid());

  return coalesce(editor_rank, 0) > 0 and editor_rank <= greatest(limit_count - 1, 0);
end;
$$;

create or replace function app_private.enforce_collaborator_limit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  max_editors integer;
  active_editors integer;
begin
  if new.role <> 'editor' or new.status <> 'accepted' then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.invitation_id::text, 0));
  max_editors := app_private.collaborator_limit_for_invitation(new.invitation_id);
  select count(*) into active_editors
  from public.invitation_collaborators c
  where c.invitation_id = new.invitation_id
    and c.role = 'editor'
    and c.status = 'accepted'
    and c.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);
  if 1 + active_editors >= max_editors then
    raise exception 'Batas editor aktif undangan telah tercapai.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger invitation_collaborators_limit
before insert or update of role, status, invitation_id
on public.invitation_collaborators
for each row execute function app_private.enforce_collaborator_limit();

create or replace function public.invite_collaborator(
  p_invitation_id uuid,
  p_email text,
  p_role text default 'editor'
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_email text := lower(trim(coalesce(p_email, '')));
  invite_id uuid;
begin
  if current_user_id is null then raise exception 'Autentikasi diperlukan' using errcode = '42501'; end if;
  if p_role not in ('editor', 'viewer') then raise exception 'Peran kolaborator tidak valid' using errcode = '22023'; end if;
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Alamat email tidak valid' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.invitations i
    where i.id = p_invitation_id and i.owner_user_id = current_user_id and i.deleted_at is null
  ) then
    raise exception 'Hanya pemilik undangan yang dapat mengundang kolaborator' using errcode = '42501';
  end if;
  if exists (
    select 1 from auth.users u
    where lower(u.email) = normalized_email and u.id = current_user_id
  ) then
    raise exception 'Pemilik undangan tidak dapat mengundang dirinya sendiri' using errcode = '22023';
  end if;
  insert into public.collaborator_invites(invitation_id, invited_email, role, invited_by)
  values (p_invitation_id, normalized_email, p_role, current_user_id)
  on conflict (invitation_id, invited_email) where status = 'pending'
  do update set role = excluded.role, expires_at = now() + interval '14 days',
    invited_by = excluded.invited_by, updated_at = now()
  returning id into invite_id;
  insert into public.audit_logs(actor_user_id, action, target_type, target_id, after_data)
  values (current_user_id, 'collaborator.invited', 'invitation', p_invitation_id,
    jsonb_build_object('invite_id', invite_id, 'email', normalized_email, 'role', p_role));
  return invite_id;
end;
$$;

create or replace function public.accept_collaborator_invite(p_invite_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  invite_row public.collaborator_invites%rowtype;
  collaborator_id uuid;
begin
  if current_user_id is null or current_email = '' then
    raise exception 'Autentikasi dengan email terverifikasi diperlukan' using errcode = '42501';
  end if;
  select * into invite_row from public.collaborator_invites
  where id = p_invite_id and invited_email = current_email
    and status = 'pending' and expires_at > now()
  for update;
  if not found then raise exception 'Undangan kolaborasi tidak ditemukan atau kedaluwarsa' using errcode = 'P0002'; end if;
  if invite_row.invited_by = current_user_id then raise exception 'Pemilik tidak dapat menerima undangannya sendiri' using errcode = '42501'; end if;
  insert into public.invitation_collaborators(invitation_id, user_id, role, invited_by, status)
  values (invite_row.invitation_id, current_user_id, invite_row.role, invite_row.invited_by, 'accepted')
  on conflict (invitation_id, user_id)
  do update set role = excluded.role, status = 'accepted', invited_by = excluded.invited_by, updated_at = now()
  returning id into collaborator_id;
  update public.collaborator_invites set status = 'accepted', accepted_by = current_user_id,
    accepted_at = now(), updated_at = now() where id = p_invite_id;
  insert into public.audit_logs(actor_user_id, action, target_type, target_id, after_data)
  values (current_user_id, 'collaborator.accepted', 'invitation', invite_row.invitation_id,
    jsonb_build_object('collaborator_id', collaborator_id, 'role', invite_row.role));
  return collaborator_id;
end;
$$;

create or replace function public.revoke_collaborator(p_collaborator_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  current_user_id uuid := auth.uid();
  invitation_id_value uuid;
begin
  if current_user_id is null then raise exception 'Autentikasi diperlukan' using errcode = '42501'; end if;
  update public.invitation_collaborators c
  set status = 'revoked', updated_at = now()
  from public.invitations i
  where c.id = p_collaborator_id and i.id = c.invitation_id
    and i.owner_user_id = current_user_id
  returning c.invitation_id into invitation_id_value;
  if invitation_id_value is null then raise exception 'Kolaborator tidak ditemukan' using errcode = 'P0002'; end if;
  insert into public.audit_logs(actor_user_id, action, target_type, target_id, after_data)
  values (current_user_id, 'collaborator.revoked', 'invitation', invitation_id_value,
    jsonb_build_object('collaborator_id', p_collaborator_id));
  return true;
end;
$$;

create or replace function public.apply_reseller(
  p_business_name text,
  p_contact_email text,
  p_terms_version text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  current_user_id uuid := auth.uid();
  profile_id uuid;
begin
  if current_user_id is null then raise exception 'Autentikasi diperlukan' using errcode = '42501'; end if;
  if length(trim(coalesce(p_business_name, ''))) not between 1 and 120
    or lower(trim(coalesce(p_contact_email, ''))) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or length(trim(coalesce(p_terms_version, ''))) not between 1 and 40 then
    raise exception 'Data pendaftaran reseller tidak valid' using errcode = '22023';
  end if;
  insert into public.reseller_profiles(user_id, business_name, contact_email, terms_version)
  values (current_user_id, trim(p_business_name), lower(trim(p_contact_email)), trim(p_terms_version))
  on conflict (user_id) do update set
    business_name = excluded.business_name,
    contact_email = excluded.contact_email,
    terms_version = excluded.terms_version,
    status = case when public.reseller_profiles.status in ('rejected', 'suspended')
      then 'applied' else public.reseller_profiles.status end,
    updated_at = now()
  returning id into profile_id;
  insert into public.audit_logs(actor_user_id, action, target_type, target_id, after_data)
  values (current_user_id, 'reseller.applied', 'reseller_profile', profile_id,
    jsonb_build_object('business_name', trim(p_business_name), 'terms_version', trim(p_terms_version)));
  return profile_id;
end;
$$;

create or replace function public.review_reseller_application(p_user_id uuid, p_status text, p_pricing_tier text default 'standard')
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  current_user_id uuid := auth.uid();
  profile_id uuid;
  previous_status text;
begin
  if current_user_id is null or not app_private.has_permission('reseller.manage') then
    raise exception 'Tidak memiliki izin mengelola reseller' using errcode = '42501';
  end if;
  if p_status not in ('approved', 'rejected', 'suspended') then
    raise exception 'Status peninjauan tidak valid' using errcode = '22023';
  end if;
  select id, status into profile_id, previous_status
  from public.reseller_profiles where user_id = p_user_id for update;
  if profile_id is null then raise exception 'Pendaftaran reseller tidak ditemukan' using errcode = 'P0002'; end if;
  update public.reseller_profiles set status = p_status, pricing_tier = trim(coalesce(p_pricing_tier, 'standard')),
    approved_by = case when p_status = 'approved' then current_user_id else null end,
    approved_at = case when p_status = 'approved' then now() else null end,
    updated_at = now()
  where id = profile_id;
  if p_status = 'approved' then
    insert into public.user_roles(user_id, role, granted_by)
    values (p_user_id, 'reseller', current_user_id)
    on conflict (user_id, role) do nothing;
  else
    delete from public.user_roles where user_id = p_user_id and role = 'reseller';
  end if;
  insert into public.audit_logs(actor_user_id, action, target_type, target_id, before_data, after_data)
  values (current_user_id, 'reseller.application_reviewed', 'reseller_profile', profile_id,
    jsonb_build_object('status', previous_status),
    jsonb_build_object('status', p_status, 'pricing_tier', trim(coalesce(p_pricing_tier, 'standard'))));
  return true;
end;
$$;

create or replace function public.admin_set_subscription(
  p_user_id uuid,
  p_plan_code text,
  p_provider text,
  p_status text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_provider_subscription_id text default null,
  p_cancel_at_period_end boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  current_user_id uuid := auth.uid();
  plan_row public.subscription_plans%rowtype;
  subscription_id_value uuid;
  old_row public.subscriptions%rowtype;
begin
  if current_user_id is null or not app_private.has_permission('subscriptions.manage') then
    raise exception 'Tidak memiliki izin mengelola langganan' using errcode = '42501';
  end if;
  if p_status not in ('trialing', 'active', 'past_due', 'cancelled', 'expired')
    or p_period_start is null or p_period_end <= p_period_start
    or length(trim(coalesce(p_provider, ''))) not between 1 and 40 then
    raise exception 'Data langganan tidak valid' using errcode = '22023';
  end if;
  select * into plan_row from public.subscription_plans where code = p_plan_code and is_active;
  if not found then raise exception 'Paket Premium belum aktif atau tidak ditemukan' using errcode = 'P0002'; end if;
  if p_status in ('active', 'trialing', 'past_due') and
    (plan_row.monthly_price is null or plan_row.billing_provider is null or plan_row.billing_provider <> trim(p_provider)) then
    raise exception 'Harga dan provider penagihan paket belum dikonfigurasi dengan benar' using errcode = '22023';
  end if;
  select * into old_row from public.subscriptions
  where user_id = p_user_id and plan_code = p_plan_code
  order by created_at desc limit 1 for update;
  if found then
    update public.subscriptions set provider = trim(p_provider),
      provider_subscription_id = p_provider_subscription_id, status = p_status,
      period_start = p_period_start, period_end = p_period_end,
      cancel_at_period_end = p_cancel_at_period_end, updated_at = now()
    where id = old_row.id returning id into subscription_id_value;
  else
    insert into public.subscriptions(user_id, provider, provider_subscription_id, plan_code,
      status, period_start, period_end, cancel_at_period_end)
    values (p_user_id, trim(p_provider), p_provider_subscription_id, p_plan_code,
      p_status, p_period_start, p_period_end, p_cancel_at_period_end)
    returning id into subscription_id_value;
  end if;

  update public.entitlements set status = 'revoked', updated_at = now()
  where user_id = p_user_id and entitlement_key = 'collaborator_limit'
    and source_type = 'subscription' and source_id <> subscription_id_value and status = 'active';

  update public.entitlements set valid_from = p_period_start,
    valid_until = case when p_status = 'past_due' then p_period_end + make_interval(days => plan_row.grace_period_days) else p_period_end end,
    value = jsonb_build_object('collaborator_limit', plan_row.collaborator_limit, 'plan_code', plan_row.code),
    status = case when (p_status in ('active', 'trialing') and p_period_end > now())
      or (p_status = 'past_due' and p_period_end + make_interval(days => plan_row.grace_period_days) > now()) then 'active' else 'expired' end,
    updated_at = now()
  where user_id = p_user_id and entitlement_key = 'collaborator_limit'
    and source_type = 'subscription' and source_id = subscription_id_value;
  if not found then
    insert into public.entitlements(user_id, entitlement_key, source_type, source_id,
      valid_from, valid_until, value, status)
    values (p_user_id, 'collaborator_limit', 'subscription', subscription_id_value,
      p_period_start, case when p_status = 'past_due' then p_period_end + make_interval(days => plan_row.grace_period_days) else p_period_end end,
      jsonb_build_object('collaborator_limit', plan_row.collaborator_limit, 'plan_code', plan_row.code),
      case when (p_status in ('active', 'trialing') and p_period_end > now())
        or (p_status = 'past_due' and p_period_end + make_interval(days => plan_row.grace_period_days) > now()) then 'active' else 'expired' end);
  end if;

  insert into public.audit_logs(actor_user_id, action, target_type, target_id, after_data)
  values (current_user_id, 'subscription.admin_updated', 'subscription', subscription_id_value,
    jsonb_build_object('user_id', p_user_id, 'plan_code', p_plan_code, 'status', p_status,
      'period_end', p_period_end, 'collaborator_limit', plan_row.collaborator_limit));
  return subscription_id_value;
end;
$$;

create or replace function public.sync_subscription_provider_event(
  p_provider text,
  p_provider_event_id text,
  p_user_id uuid,
  p_plan_code text,
  p_provider_subscription_id text,
  p_status text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_event_type text,
  p_payload_redacted jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  plan_row public.subscription_plans%rowtype;
  subscription_id_value uuid;
  event_id uuid;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Akses adapter langganan ditolak' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_provider, ''))) not between 1 and 40
    or length(trim(coalesce(p_provider_event_id, ''))) not between 1 and 200
    or p_status not in ('trialing', 'active', 'past_due', 'cancelled', 'expired')
    or p_period_start is null or p_period_end <= p_period_start
    or jsonb_typeof(coalesce(p_payload_redacted, '{}'::jsonb)) <> 'object' then
    raise exception 'Event provider langganan tidak valid' using errcode = '22023';
  end if;
  insert into public.subscription_events(provider, provider_event_id, event_type, payload_redacted)
  values (p_provider, p_provider_event_id, p_event_type, coalesce(p_payload_redacted, '{}'::jsonb))
  on conflict (provider, provider_event_id) do nothing
  returning id into event_id;
  if event_id is null then
    select s.id into subscription_id_value
    from public.subscriptions s
    where s.provider = p_provider and s.provider_subscription_id = p_provider_subscription_id;
    return subscription_id_value;
  end if;
  select * into plan_row from public.subscription_plans where code = p_plan_code and is_active;
  if not found then raise exception 'Paket provider tidak aktif atau tidak ditemukan' using errcode = 'P0002'; end if;
  if p_status in ('active', 'trialing', 'past_due') and
    (plan_row.monthly_price is null or plan_row.billing_provider is distinct from p_provider) then
    raise exception 'Konfigurasi provider dan harga paket belum lengkap' using errcode = '22023';
  end if;
  insert into public.subscriptions(user_id, provider, provider_subscription_id, plan_code,
    status, period_start, period_end)
  values (p_user_id, p_provider, p_provider_subscription_id, p_plan_code,
    p_status, p_period_start, p_period_end)
  on conflict (provider, provider_subscription_id) where provider_subscription_id is not null
  do update set status = excluded.status, period_start = excluded.period_start,
    period_end = excluded.period_end, updated_at = now()
  returning id into subscription_id_value;
  update public.entitlements set status = 'revoked', updated_at = now()
  where user_id = p_user_id and entitlement_key = 'collaborator_limit'
    and source_type = 'subscription' and source_id <> subscription_id_value and status = 'active';
  update public.entitlements set valid_from = p_period_start,
    valid_until = case when p_status = 'past_due' then p_period_end + make_interval(days => plan_row.grace_period_days) else p_period_end end,
    value = jsonb_build_object('collaborator_limit', plan_row.collaborator_limit, 'plan_code', plan_row.code),
    status = case when (p_status in ('active', 'trialing') and p_period_end > now())
      or (p_status = 'past_due' and p_period_end + make_interval(days => plan_row.grace_period_days) > now()) then 'active' else 'expired' end,
    updated_at = now()
  where user_id = p_user_id and entitlement_key = 'collaborator_limit'
    and source_type = 'subscription' and source_id = subscription_id_value;
  if not found then
    insert into public.entitlements(user_id, entitlement_key, source_type, source_id,
      valid_from, valid_until, value, status)
    values (p_user_id, 'collaborator_limit', 'subscription', subscription_id_value,
      p_period_start, case when p_status = 'past_due' then p_period_end + make_interval(days => plan_row.grace_period_days) else p_period_end end,
      jsonb_build_object('collaborator_limit', plan_row.collaborator_limit, 'plan_code', plan_row.code),
      case when (p_status in ('active', 'trialing') and p_period_end > now())
        or (p_status = 'past_due' and p_period_end + make_interval(days => plan_row.grace_period_days) > now()) then 'active' else 'expired' end);
  end if;
  update public.subscription_events set subscription_id = subscription_id_value, processed_at = now()
  where id = event_id;
  return subscription_id_value;
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
  if current_user_id is null or not app_private.can_edit_invitation(p_invitation_id) then
    raise exception 'Akses edit undangan ditolak' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_title, ''))) not between 1 and 160
    or jsonb_typeof(p_document) <> 'object'
    or coalesce((p_document ->> 'schemaVersion')::integer, 0) <> 1
    or coalesce(jsonb_typeof(p_document -> 'pages'), '') <> 'array'
    or octet_length(p_document::text) > 1048576 then
    raise exception 'Dokumen tidak valid atau melebihi batas 1 MB' using errcode = '22023';
  end if;
  select * into current_invitation from public.invitations
  where id = p_invitation_id and status in ('draft', 'active', 'expired') and deleted_at is null
  for update;
  if not found then raise exception 'Draft tidak ditemukan' using errcode = 'P0002'; end if;
  if current_invitation.draft_version_id is null then raise exception 'Versi draft tidak ditemukan' using errcode = 'P0002'; end if;
  if current_invitation.updated_at is distinct from p_expected_updated_at then
    raise exception 'Konflik penyuntingan: draft telah berubah di perangkat lain' using errcode = '40001';
  end if;
  select * into current_version from public.invitation_versions
  where id = current_invitation.draft_version_id and invitation_id = p_invitation_id and state = 'draft'
  for update;
  if not found then raise exception 'Versi draft tidak tersedia' using errcode = 'P0002'; end if;
  next_document := p_document || jsonb_build_object(
    'metadata', coalesce(p_document -> 'metadata', '{}'::jsonb) || jsonb_build_object('title', trim(p_title))
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
  if current_user_id is null or not app_private.can_edit_invitation(p_invitation_id) then
    raise exception 'Akses edit undangan ditolak' using errcode = '42501';
  end if;
  select * into invitation_row from public.invitations
  where id = p_invitation_id and status in ('active', 'expired') and published_version_id is not null
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

alter table public.invitation_collaborators enable row level security;
alter table public.collaborator_invites enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_events enable row level security;
alter table public.reseller_profiles enable row level security;
alter table public.reseller_price_rules enable row level security;
alter table public.reseller_clients enable row level security;
alter table public.reseller_sales enable row level security;

revoke all on table public.invitation_collaborators, public.collaborator_invites,
  public.subscription_plans, public.subscriptions, public.subscription_events,
  public.reseller_profiles, public.reseller_price_rules, public.reseller_clients,
  public.reseller_sales from public, anon;

create policy invitation_collaborators_read on public.invitation_collaborators
for select to authenticated
using (user_id = (select auth.uid()) or app_private.can_view_invitation(invitation_id));
create policy collaborator_invites_read on public.collaborator_invites
for select to authenticated
using (
  invited_email = lower(coalesce(auth.jwt() ->> 'email', ''))
  or exists (select 1 from public.invitations i
    where i.id = invitation_id and i.owner_user_id = (select auth.uid()))
);
create policy subscription_plans_read_active on public.subscription_plans
for select to authenticated using (is_active or app_private.has_permission('subscriptions.manage'));
create policy subscription_plans_admin_write on public.subscription_plans
for all to authenticated
using (app_private.has_permission('subscriptions.manage'))
with check (app_private.has_permission('subscriptions.manage'));
create policy subscriptions_owner_read on public.subscriptions
for select to authenticated
using (user_id = (select auth.uid()) or app_private.has_permission('subscriptions.manage'));
create policy subscription_events_admin_read on public.subscription_events
for select to authenticated using (app_private.has_permission('subscriptions.manage'));
create policy reseller_profiles_owner_read on public.reseller_profiles
for select to authenticated
using (user_id = (select auth.uid()) or app_private.has_permission('reseller.manage'));
create policy reseller_profiles_admin_write on public.reseller_profiles
for all to authenticated
using (app_private.has_permission('reseller.manage'))
with check (app_private.has_permission('reseller.manage'));
create policy reseller_price_rules_read on public.reseller_price_rules
for select to authenticated
using (
  app_private.has_permission('reseller.manage')
  or exists (select 1 from public.reseller_profiles rp
    where rp.user_id = (select auth.uid()) and rp.status = 'approved')
);
create policy reseller_price_rules_admin_write on public.reseller_price_rules
for all to authenticated
using (app_private.has_permission('reseller.manage'))
with check (app_private.has_permission('reseller.manage'));
create policy reseller_clients_owner_all on public.reseller_clients
for all to authenticated
using (
  reseller_user_id = (select auth.uid())
  and exists (select 1 from public.reseller_profiles rp
    where rp.user_id = (select auth.uid()) and rp.status = 'approved')
)
with check (
  reseller_user_id = (select auth.uid())
  and exists (select 1 from public.reseller_profiles rp
    where rp.user_id = (select auth.uid()) and rp.status = 'approved')
);
create policy reseller_clients_admin_read on public.reseller_clients
for select to authenticated using (app_private.has_permission('reseller.manage'));
create policy orders_reseller_read on public.orders
for select to authenticated
using (reseller_user_id = (select auth.uid()) and exists (
  select 1 from public.reseller_profiles rp where rp.user_id = (select auth.uid()) and rp.status = 'approved'
));
create policy reseller_sales_owner_read on public.reseller_sales
for select to authenticated
using (reseller_user_id = (select auth.uid()) or app_private.has_permission('reseller.manage'));
create policy reseller_sales_owner_insert on public.reseller_sales
for insert to authenticated
with check (
  reseller_user_id = (select auth.uid())
  and recorded_by = (select auth.uid())
  and exists (select 1 from public.reseller_profiles rp
    where rp.user_id = (select auth.uid()) and rp.status = 'approved')
  and exists (select 1 from public.orders o
    where o.id = order_id and o.reseller_user_id = (select auth.uid()))
  and (client_id is null or exists (select 1 from public.reseller_clients rc
    where rc.id = client_id and rc.reseller_user_id = (select auth.uid())))
);

create policy invitations_collaborator_read on public.invitations
for select to authenticated
using (app_private.can_view_invitation(id));
create policy invitation_versions_collaborator_read on public.invitation_versions
for select to authenticated
using (app_private.can_view_invitation(invitation_id));

create policy media_assets_collaborator_read on public.media_assets
for select to authenticated
using (
  exists (
    select 1 from public.invitations i
    where i.id::text = split_part(media_assets.object_path, '/', 2)
      and i.owner_user_id = media_assets.owner_user_id
      and app_private.can_view_invitation(i.id)
  )
);
create policy media_assets_collaborator_insert on public.media_assets
for insert to authenticated
with check (
  storage_bucket = 'user-uploads-private'
  and visibility = 'private'
  and processing_status in ('uploaded', 'ready')
  and exists (
    select 1 from public.invitations i
    where i.id::text = split_part(media_assets.object_path, '/', 2)
      and i.owner_user_id = media_assets.owner_user_id
      and split_part(media_assets.object_path, '/', 1) = i.owner_user_id::text
      and app_private.can_edit_invitation(i.id)
  )
);
create policy private_upload_collaborator_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'user-uploads-private'
  and exists (
    select 1 from public.invitations i
    where i.id::text = (storage.foldername(name))[2]
      and i.owner_user_id::text = (storage.foldername(name))[1]
      and app_private.can_edit_invitation(i.id)
  )
);
create policy private_upload_collaborator_read on storage.objects
for select to authenticated
using (
  bucket_id = 'user-uploads-private'
  and exists (
    select 1 from public.invitations i
    where i.id::text = (storage.foldername(name))[2]
      and i.owner_user_id::text = (storage.foldername(name))[1]
      and app_private.can_view_invitation(i.id)
  )
);

grant select on public.invitation_collaborators, public.collaborator_invites,
  public.subscription_plans, public.subscriptions, public.reseller_profiles,
  public.reseller_price_rules, public.reseller_clients, public.reseller_sales
to authenticated;
grant insert, update, delete on public.subscription_plans to authenticated;
grant select on public.subscription_events to authenticated;
grant execute on function public.invite_collaborator(uuid, text, text) to authenticated;
grant execute on function public.accept_collaborator_invite(uuid) to authenticated;
grant execute on function public.revoke_collaborator(uuid) to authenticated;
grant execute on function public.apply_reseller(text, text, text) to authenticated;
grant execute on function public.review_reseller_application(uuid, text, text) to authenticated;
grant execute on function public.admin_set_subscription(uuid, text, text, text, timestamptz, timestamptz, text, boolean) to authenticated;
grant execute on function public.sync_subscription_provider_event(text, text, uuid, text, text, text, timestamptz, timestamptz, text, jsonb) to service_role;
revoke all on function public.invite_collaborator(uuid, text, text) from public, anon;
revoke all on function public.accept_collaborator_invite(uuid) from public, anon;
revoke all on function public.revoke_collaborator(uuid) from public, anon;
revoke all on function public.apply_reseller(text, text, text) from public, anon;
revoke all on function public.review_reseller_application(uuid, text, text) from public, anon;
revoke all on function public.admin_set_subscription(uuid, text, text, text, timestamptz, timestamptz, text, boolean) from public, anon;
revoke all on function public.sync_subscription_provider_event(text, text, uuid, text, text, text, timestamptz, timestamptz, text, jsonb) from public, anon, authenticated;

revoke all on function app_private.collaborator_limit_for_invitation(uuid) from public, anon, authenticated;
revoke all on function app_private.can_view_invitation(uuid) from public, anon, authenticated;
revoke all on function app_private.can_edit_invitation(uuid) from public, anon, authenticated;
revoke all on function app_private.enforce_collaborator_limit() from public, anon, authenticated;
grant usage on schema app_private to authenticated;
grant execute on function app_private.can_view_invitation(uuid) to authenticated;
grant execute on function app_private.can_edit_invitation(uuid) to authenticated;

comment on table public.invitation_collaborators is 'Keanggotaan kolaborator undangan. Batas editor aktif ditegakkan secara transaksional.';
comment on table public.collaborator_invites is 'Undangan kolaborasi berbasis email; penerimaan harus cocok dengan email sesi terautentikasi.';
comment on table public.subscriptions is 'Status langganan Premium dari adapter provider atau administrasi; bukan bukti pembayaran yang dibuat browser.';
comment on table public.subscription_events is 'Event provider langganan dengan payload yang sudah direduksi dan kunci idempotensi.';
comment on table public.reseller_sales is 'Catatan harga jual reseller dan biaya wholesale. Margin adalah catatan, bukan payout.';

  and exists (
    select 1 from public.invitations i
    where i.id::text = (storage.foldername(name))[2]
      and i.owner_user_id::text = (storage.foldername(name))[1]
      and app_private.can_edit_invitation(i.id)
  )
);
create policy private_upload_collaborator_read on storage.objects
for select to authenticated
using (
  bucket_id = 'user-uploads-private'
  and (storage.foldername(name))[2] ~* '^[0-9a-f-]{36}

grant select on public.invitation_collaborators, public.collaborator_invites,
  public.subscription_plans, public.subscriptions, public.reseller_profiles,
  public.reseller_price_rules, public.reseller_clients, public.reseller_sales
to authenticated;
grant insert, update, delete on public.subscription_plans to authenticated;
grant select on public.subscription_events to authenticated;
grant execute on function public.invite_collaborator(uuid, text, text) to authenticated;
grant execute on function public.accept_collaborator_invite(uuid) to authenticated;
grant execute on function public.revoke_collaborator(uuid) to authenticated;
grant execute on function public.apply_reseller(text, text, text) to authenticated;
grant execute on function public.review_reseller_application(uuid, text, text) to authenticated;
grant execute on function public.admin_set_subscription(uuid, text, text, text, timestamptz, timestamptz, text, boolean) to authenticated;
grant execute on function public.sync_subscription_provider_event(text, text, uuid, text, text, text, timestamptz, timestamptz, text, jsonb) to service_role;
revoke all on function public.invite_collaborator(uuid, text, text) from public, anon;
revoke all on function public.accept_collaborator_invite(uuid) from public, anon;
revoke all on function public.revoke_collaborator(uuid) from public, anon;
revoke all on function public.apply_reseller(text, text, text) from public, anon;
revoke all on function public.review_reseller_application(uuid, text, text) from public, anon;
revoke all on function public.admin_set_subscription(uuid, text, text, text, timestamptz, timestamptz, text, boolean) from public, anon;
revoke all on function public.sync_subscription_provider_event(text, text, uuid, text, text, text, timestamptz, timestamptz, text, jsonb) from public, anon, authenticated;

revoke all on function app_private.collaborator_limit_for_invitation(uuid) from public, anon, authenticated;
revoke all on function app_private.can_view_invitation(uuid) from public, anon, authenticated;
revoke all on function app_private.can_edit_invitation(uuid) from public, anon, authenticated;
revoke all on function app_private.enforce_collaborator_limit() from public, anon, authenticated;
grant usage on schema app_private to authenticated;
grant execute on function app_private.can_view_invitation(uuid) to authenticated;
grant execute on function app_private.can_edit_invitation(uuid) to authenticated;

comment on table public.invitation_collaborators is 'Keanggotaan kolaborator undangan. Batas editor aktif ditegakkan secara transaksional.';
comment on table public.collaborator_invites is 'Undangan kolaborasi berbasis email; penerimaan harus cocok dengan email sesi terautentikasi.';
comment on table public.subscriptions is 'Status langganan Premium dari adapter provider atau administrasi; bukan bukti pembayaran yang dibuat browser.';
comment on table public.subscription_events is 'Event provider langganan dengan payload yang sudah direduksi dan kunci idempotensi.';
comment on table public.reseller_sales is 'Catatan harga jual reseller dan biaya wholesale. Margin adalah catatan, bukan payout.';

  and exists (
    select 1 from public.invitations i
    where i.id::text = (storage.foldername(name))[2]
      and i.owner_user_id::text = (storage.foldername(name))[1]
      and app_private.can_view_invitation(i.id)
  )
);

grant select on public.invitation_collaborators, public.collaborator_invites,
  public.subscription_plans, public.subscriptions, public.reseller_profiles,
  public.reseller_price_rules, public.reseller_clients, public.reseller_sales
to authenticated;
grant insert, update, delete on public.subscription_plans to authenticated;
grant select on public.subscription_events to authenticated;
grant execute on function public.invite_collaborator(uuid, text, text) to authenticated;
grant execute on function public.accept_collaborator_invite(uuid) to authenticated;
grant execute on function public.revoke_collaborator(uuid) to authenticated;
grant execute on function public.apply_reseller(text, text, text) to authenticated;
grant execute on function public.review_reseller_application(uuid, text, text) to authenticated;
grant execute on function public.admin_set_subscription(uuid, text, text, text, timestamptz, timestamptz, text, boolean) to authenticated;
grant execute on function public.sync_subscription_provider_event(text, text, uuid, text, text, text, timestamptz, timestamptz, text, jsonb) to service_role;
revoke all on function public.invite_collaborator(uuid, text, text) from public, anon;
revoke all on function public.accept_collaborator_invite(uuid) from public, anon;
revoke all on function public.revoke_collaborator(uuid) from public, anon;
revoke all on function public.apply_reseller(text, text, text) from public, anon;
revoke all on function public.review_reseller_application(uuid, text, text) from public, anon;
revoke all on function public.admin_set_subscription(uuid, text, text, text, timestamptz, timestamptz, text, boolean) from public, anon;
revoke all on function public.sync_subscription_provider_event(text, text, uuid, text, text, text, timestamptz, timestamptz, text, jsonb) from public, anon, authenticated;

revoke all on function app_private.collaborator_limit_for_invitation(uuid) from public, anon, authenticated;
revoke all on function app_private.can_view_invitation(uuid) from public, anon, authenticated;
revoke all on function app_private.can_edit_invitation(uuid) from public, anon, authenticated;
revoke all on function app_private.enforce_collaborator_limit() from public, anon, authenticated;
grant usage on schema app_private to authenticated;
grant execute on function app_private.can_view_invitation(uuid) to authenticated;
grant execute on function app_private.can_edit_invitation(uuid) to authenticated;

comment on table public.invitation_collaborators is 'Keanggotaan kolaborator undangan. Batas editor aktif ditegakkan secara transaksional.';
comment on table public.collaborator_invites is 'Undangan kolaborasi berbasis email; penerimaan harus cocok dengan email sesi terautentikasi.';
comment on table public.subscriptions is 'Status langganan Premium dari adapter provider atau administrasi; bukan bukti pembayaran yang dibuat browser.';
comment on table public.subscription_events is 'Event provider langganan dengan payload yang sudah direduksi dan kunci idempotensi.';
comment on table public.reseller_sales is 'Catatan harga jual reseller dan biaya wholesale. Margin adalah catatan, bukan payout.';
