-- Fase 3: penyimpanan draft optimistis dan metadata unggahan milik pengguna.
drop policy media_assets_admin_insert on public.media_assets;
create policy media_assets_owner_insert on public.media_assets
  for insert to authenticated
  with check (
    owner_user_id = (select auth.uid())
    and (
      (
        storage_bucket = 'user-uploads-private'
        and split_part(object_path, '/', 1) = (select auth.uid())::text
        and visibility = 'private'
        and processing_status in ('uploaded', 'ready')
      )
      or app_private.has_permission('templates.manage')
    )
  );

create or replace function public.save_invitation_draft(
  p_invitation_id uuid,
  p_expected_updated_at timestamptz,
  p_title text,
  p_document jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, app_private, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  current_invitation public.invitations%rowtype;
  current_version public.invitation_versions%rowtype;
  saved_at timestamptz := clock_timestamp();
begin
  if current_user_id is null then
    raise exception 'Autentikasi diperlukan' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_title, ''))) not between 1 and 160 then
    raise exception 'Judul undangan wajib diisi (maksimal 160 karakter)' using errcode = '22023';
  end if;
  if jsonb_typeof(p_document) <> 'object'
     or coalesce((p_document ->> 'schemaVersion')::integer, 0) <> 1
     or coalesce(jsonb_typeof(p_document -> 'pages'), '') <> 'array'
     or octet_length(p_document::text) > 1048576 then
    raise exception 'Dokumen tidak valid atau melebihi batas 1 MB' using errcode = '22023';
  end if;

  select * into current_invitation
  from public.invitations
  where id = p_invitation_id and owner_user_id = current_user_id
  for update;

  if not found then
    raise exception 'Draft tidak ditemukan atau bukan milik akun ini' using errcode = 'P0002';
  end if;
  if current_invitation.status <> 'draft' or current_invitation.published_version_id is not null then
    raise exception 'Hanya draft yang belum diterbitkan yang dapat disunting' using errcode = '55000';
  end if;
  if current_invitation.updated_at is distinct from p_expected_updated_at then
    raise exception 'Konflik penyuntingan: draft telah berubah di perangkat lain' using errcode = '40001';
  end if;
  if current_invitation.draft_version_id is null then
    raise exception 'Versi draft tidak ditemukan' using errcode = 'P0002';
  end if;

  select * into current_version
  from public.invitation_versions
  where id = current_invitation.draft_version_id
    and invitation_id = p_invitation_id
    and state = 'draft'
  for update;

  if not found then
    raise exception 'Versi draft tidak tersedia' using errcode = 'P0002';
  end if;

  update public.invitation_versions
  set document = p_document
  where id = current_version.id;

  update public.invitations
  set title = trim(p_title), updated_at = saved_at
  where id = p_invitation_id
  returning * into current_invitation;

  return jsonb_build_object(
    'invitation_id', current_invitation.id,
    'draft_version_id', current_version.id,
    'version_no', current_version.version_no,
    'updated_at', current_invitation.updated_at
  );
end;
$$;

revoke all on function public.save_invitation_draft(uuid, timestamptz, text, jsonb) from public, anon;
grant execute on function public.save_invitation_draft(uuid, timestamptz, text, jsonb) to authenticated;
