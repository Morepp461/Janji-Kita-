-- Keep moderation consent enforcement explicit without an unused row variable.
create or replace function app_private.admin_set_template_moderation(
  p_template_id uuid,
  p_status text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $phase7$
declare
  template_row public.templates%rowtype;
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
  if template_row.source_consent_id is not null and not exists (
    select 1 from public.consent_records
    where id = template_row.source_consent_id
      and invitation_id = template_row.source_invitation_id
      and granted and withdrawn_at is null
      and metadata ->> 'moderation_status' = 'approved'
  ) then
    raise exception 'Persetujuan pemilik belum disetujui atau sudah dicabut';
  end if;
  update public.templates
  set status = p_status,
      moderation_note = nullif(trim(p_note), ''),
      moderated_by = auth.uid(),
      moderated_at = now(),
      updated_at = now()
  where id = p_template_id;
end;
$phase7$;
