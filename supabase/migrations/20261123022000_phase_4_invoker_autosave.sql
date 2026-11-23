-- Pertahankan kontrak fase 3: autosave berjalan dengan hak pemanggil dan RLS.
revoke update on public.invitations, public.invitation_versions from authenticated;
grant update (title, updated_at, draft_version_id) on public.invitations to authenticated;
grant update (document) on public.invitation_versions to authenticated;

drop policy if exists invitations_owner_update on public.invitations;
drop policy if exists invitations_owner_update_editor on public.invitations;
create policy invitations_owner_update on public.invitations
  for update to authenticated
  using (
    owner_user_id = (select auth.uid())
    and deleted_at is null
    and (
      (status = 'draft' and published_version_id is null)
      or (status in ('active', 'expired') and published_version_id is not null)
    )
  )
  with check (
    owner_user_id = (select auth.uid())
    and deleted_at is null
    and (
      (status = 'draft' and published_version_id is null)
      or (status in ('active', 'expired') and published_version_id is not null)
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

revoke all on function public.save_invitation_draft(uuid,timestamptz,text,jsonb) from public, anon;
grant execute on function public.save_invitation_draft(uuid,timestamptz,text,jsonb) to authenticated;
