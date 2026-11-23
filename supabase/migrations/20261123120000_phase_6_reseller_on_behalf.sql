-- Fase 6: reseller dapat membuat dan mengelola undangan atas nama klien terdaftar.
-- Pemilik, pembuat, pembayar, dan reseller tetap disimpan sebagai identitas terpisah.

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
  ) or exists (
    select 1 from public.invitations i
    join public.reseller_profiles rp on rp.user_id = i.reseller_user_id and rp.status = 'approved'
    where i.id = p_invitation_id and i.reseller_user_id = (select auth.uid())
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
  if exists (
    select 1 from public.invitations i
    join public.reseller_profiles rp on rp.user_id = i.reseller_user_id and rp.status = 'approved'
    where i.id = p_invitation_id and i.reseller_user_id = (select auth.uid())
  ) then return true; end if;

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

create or replace function public.create_reseller_invitation_draft(
  p_client_id uuid,
  p_title text,
  p_event_category_id uuid,
  p_template_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  current_user_id uuid := auth.uid();
  client_row public.reseller_clients%rowtype;
  client_user_id uuid;
  invitation_id_value uuid;
begin
  if current_user_id is null then
    raise exception 'Autentikasi diperlukan' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.reseller_profiles rp
    where rp.user_id = current_user_id and rp.status = 'approved'
  ) then
    raise exception 'Hanya reseller yang disetujui dapat membuat undangan untuk klien' using errcode = '42501';
  end if;
  select * into client_row from public.reseller_clients
  where id = p_client_id and reseller_user_id = current_user_id and status = 'active'
  for update;
  if not found then raise exception 'Klien aktif tidak ditemukan' using errcode = 'P0002'; end if;

  select u.id into client_user_id from auth.users u
  where lower(u.email) = lower(client_row.email) and u.email_confirmed_at is not null;
  if client_user_id is null then
    raise exception 'Klien harus memiliki akun Janji Kita terverifikasi dengan email yang tercatat' using errcode = '22023';
  end if;

  update public.reseller_clients set client_user_id = client_user_id, updated_at = now()
  where id = p_client_id;

  invitation_id_value := public.create_invitation_draft(
    p_title, p_event_category_id, p_template_id
  );

  update public.invitations set
    owner_user_id = client_user_id,
    reseller_user_id = current_user_id,
    updated_at = now()
  where id = invitation_id_value and created_by = current_user_id;

  insert into public.audit_logs(actor_user_id, action, target_type, target_id, after_data)
  values (current_user_id, 'reseller.invitation_created_for_client', 'invitation', invitation_id_value,
    jsonb_build_object('owner_user_id', client_user_id, 'created_by', current_user_id,
      'reseller_user_id', current_user_id, 'reseller_client_id', p_client_id));
  return invitation_id_value;
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
begin
  if current_user_id is null then raise exception 'Autentikasi diperlukan' using errcode = '42501'; end if;
  select * into invitation_row from public.invitations
  where id = p_invitation_id
    and (owner_user_id = current_user_id or (reseller_user_id = current_user_id and exists (
      select 1 from public.reseller_profiles rp where rp.user_id = current_user_id and rp.status = 'approved'
    )))
    and deleted_at is null and status in ('draft', 'active', 'expired')
  for update;
  if not found then raise exception 'Undangan tidak ditemukan atau bukan milik akun ini' using errcode = 'P0002'; end if;
  if invitation_row.draft_version_id is null or invitation_row.draft_version_id <> p_expected_draft_version_id then
    raise exception 'Versi draft berubah. Muat ulang editor sebelum menerbitkan.' using errcode = '40001';
  end if;
  select * into entitlement_row from public.entitlements
  where user_id = invitation_row.owner_user_id and entitlement_key = 'invitation.publish'
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

grant execute on function public.create_reseller_invitation_draft(uuid, text, uuid, uuid) to authenticated;
revoke all on function public.create_reseller_invitation_draft(uuid, text, uuid, uuid) from public, anon;
