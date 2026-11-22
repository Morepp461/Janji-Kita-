-- Fase 2: marketplace, dokumen undangan, renderer publik, dan penyimpanan aset.
create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references public.profiles(id) on delete set null,
  storage_bucket text not null,
  object_path text not null unique,
  media_type text not null check (media_type in ('image', 'video', 'audio', 'font', 'illustration', 'other')),
  mime_type text not null,
  byte_size bigint not null check (byte_size >= 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  duration_ms bigint check (duration_ms is null or duration_ms >= 0),
  checksum text,
  license_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(license_metadata) = 'object'),
  visibility text not null default 'private' check (visibility in ('private', 'invitation', 'template', 'public')),
  processing_status text not null default 'ready' check (processing_status in ('uploaded', 'processing', 'ready', 'failed', 'quarantined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (length(trim(title)) between 1 and 120),
  category_id uuid not null references public.categories(id) on delete restrict,
  style_id uuid not null references public.design_styles(id) on delete restrict,
  description text not null default '',
  thumbnail_asset_id uuid references public.media_assets(id) on delete set null,
  base_price bigint not null default 0 check (base_price >= 0),
  currency char(3) not null default 'IDR',
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  current_version_id uuid,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.templates(id) on delete cascade,
  version_no integer not null check (version_no > 0),
  schema_version integer not null check (schema_version > 0),
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  asset_manifest jsonb not null default '{}'::jsonb check (jsonb_typeof(asset_manifest) = 'object'),
  change_note text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (template_id, version_no)
);

alter table public.templates
  add constraint templates_current_version_fk
  foreign key (current_version_id) references public.template_versions(id) on delete set null;

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  reseller_user_id uuid references public.profiles(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  template_id uuid references public.templates(id) on delete set null,
  slug text unique,
  title text not null check (length(trim(title)) between 1 and 160),
  event_category_id uuid not null references public.categories(id) on delete restrict,
  status text not null default 'draft'
    check (status in ('draft', 'pending_payment', 'active', 'expired', 'suspended', 'archived')),
  active_from timestamptz,
  active_until timestamptz,
  published_version_id uuid,
  draft_version_id uuid,
  timezone text not null default 'Asia/Jakarta',
  locale text not null default 'id-ID',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'active' or (active_from is not null and active_until > active_from and published_version_id is not null))
);

create table public.invitation_versions (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.invitations(id) on delete cascade,
  version_no integer not null check (version_no > 0),
  schema_version integer not null check (schema_version > 0),
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  asset_manifest jsonb not null default '{}'::jsonb check (jsonb_typeof(asset_manifest) = 'object'),
  state text not null default 'draft' check (state in ('draft', 'published', 'archived')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (invitation_id, version_no)
);

alter table public.invitations
  add constraint invitations_published_version_fk
  foreign key (published_version_id) references public.invitation_versions(id) on delete set null,
  add constraint invitations_draft_version_fk
  foreign key (draft_version_id) references public.invitation_versions(id) on delete set null;

create index templates_marketplace_idx on public.templates(status, category_id, style_id, created_at desc);
create index template_versions_template_idx on public.template_versions(template_id, version_no desc);
create index media_assets_owner_idx on public.media_assets(owner_user_id, created_at desc);
create index invitations_owner_status_idx on public.invitations(owner_user_id, status, updated_at desc);
create index invitations_active_slug_idx on public.invitations(slug, active_until) where status = 'active';
create index invitation_versions_invitation_idx on public.invitation_versions(invitation_id, version_no desc);

create trigger templates_set_updated_at before update on public.templates
  for each row execute function public.set_updated_at();
create trigger media_assets_set_updated_at before update on public.media_assets
  for each row execute function public.set_updated_at();
create trigger invitations_set_updated_at before update on public.invitations
  for each row execute function public.set_updated_at();

alter table public.media_assets enable row level security;
alter table public.templates enable row level security;
alter table public.template_versions enable row level security;
alter table public.invitations enable row level security;
alter table public.invitation_versions enable row level security;

insert into public.role_permissions (role, permission_key) values
  ('admin', 'templates.manage'),
  ('super_admin', 'templates.manage')
on conflict (role, permission_key) do nothing;

grant select on public.templates, public.template_versions to anon, authenticated;
grant insert, update, select on public.templates, public.template_versions to authenticated;
grant select, insert, update on public.media_assets to authenticated;
grant select, insert, update on public.invitations, public.invitation_versions to authenticated;

create policy templates_read_public on public.templates
  for select to anon using (status = 'published');
create policy templates_read_authenticated on public.templates
  for select to authenticated
  using (status = 'published' or app_private.has_permission('templates.manage'));
create policy templates_admin_insert on public.templates
  for insert to authenticated with check (app_private.has_permission('templates.manage'));
create policy templates_admin_update on public.templates
  for update to authenticated
  using (app_private.has_permission('templates.manage'))
  with check (app_private.has_permission('templates.manage'));

create policy template_versions_read_public on public.template_versions
  for select to anon
  using (exists (
    select 1 from public.templates t
    where t.id = template_id and t.status = 'published' and t.current_version_id = id
  ));
create policy template_versions_read_authenticated on public.template_versions
  for select to authenticated
  using (
    exists (
      select 1 from public.templates t
      where t.id = template_id and t.status = 'published' and t.current_version_id = id
    ) or app_private.has_permission('templates.manage')
  );
create policy template_versions_admin_insert on public.template_versions
  for insert to authenticated with check (app_private.has_permission('templates.manage'));

create policy media_assets_read on public.media_assets
  for select to anon, authenticated
  using (visibility in ('template', 'public') or owner_user_id = (select auth.uid()) or app_private.has_permission('templates.manage'));
create policy media_assets_admin_insert on public.media_assets
  for insert to authenticated with check (
    owner_user_id = (select auth.uid())
    and app_private.has_permission('templates.manage')
  );
create policy media_assets_admin_update on public.media_assets
  for update to authenticated
  using (app_private.has_permission('templates.manage'))
  with check (app_private.has_permission('templates.manage'));

create policy invitations_owner_read on public.invitations
  for select to authenticated using (owner_user_id = (select auth.uid()));
create policy invitations_owner_insert on public.invitations
  for insert to authenticated
  with check (
    owner_user_id = (select auth.uid())
    and created_by = (select auth.uid())
    and status = 'draft'
    and published_version_id is null
  );
create policy invitations_owner_update on public.invitations
  for update to authenticated
  using (owner_user_id = (select auth.uid()) and status = 'draft')
  with check (owner_user_id = (select auth.uid()) and status = 'draft' and published_version_id is null);

create policy invitation_versions_owner_read on public.invitation_versions
  for select to authenticated
  using (exists (
    select 1 from public.invitations i
    where i.id = invitation_id and i.owner_user_id = (select auth.uid())
  ));
create policy invitation_versions_owner_insert on public.invitation_versions
  for insert to authenticated
  with check (exists (
    select 1 from public.invitations i
    where i.id = invitation_id and i.owner_user_id = (select auth.uid())
  ));
create policy invitation_versions_owner_update on public.invitation_versions
  for update to authenticated
  using (
    state = 'draft' and exists (
      select 1 from public.invitations i
      where i.id = invitation_id and i.owner_user_id = (select auth.uid())
    )
  )
  with check (
    state = 'draft' and exists (
      select 1 from public.invitations i
      where i.id = invitation_id and i.owner_user_id = (select auth.uid())
    )
  );

create or replace function app_private.prevent_published_version_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.state = 'published' then
    raise exception 'Versi yang sudah dipublikasikan bersifat permanen' using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function app_private.prevent_published_version_mutation() from public, anon, authenticated;

create trigger invitation_versions_immutable
  before update or delete on public.invitation_versions
  for each row execute function app_private.prevent_published_version_mutation();

create or replace function public.create_invitation_draft(
  p_title text,
  p_event_category_id uuid,
  p_template_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, app_private, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  new_invitation_id uuid;
  new_version_id uuid;
  selected_document jsonb;
  selected_manifest jsonb := '{}'::jsonb;
  selected_category_id uuid := p_event_category_id;
begin
  if current_user_id is null then
    raise exception 'Autentikasi diperlukan' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_title, ''))) not between 1 and 160 then
    raise exception 'Judul undangan wajib diisi (maksimal 160 karakter)' using errcode = '22023';
  end if;

  if p_template_id is not null then
    select tv.document, tv.asset_manifest, t.category_id
      into selected_document, selected_manifest, selected_category_id
    from public.templates t
    join public.template_versions tv on tv.id = t.current_version_id
    where t.id = p_template_id and t.status = 'published';
    if selected_document is null then
      raise exception 'Template tidak tersedia' using errcode = 'P0002';
    end if;
  else
    if selected_category_id is null then
      raise exception 'Kategori acara wajib dipilih untuk kanvas kosong' using errcode = '22023';
    end if;
    selected_document := jsonb_build_object(
      'schemaVersion', 1,
      'documentId', gen_random_uuid(),
      'locale', 'id-ID',
      'timezone', 'Asia/Jakarta',
      'themeTokens', jsonb_build_object(),
      'pages', jsonb_build_array(jsonb_build_object(
        'id', 'page-1',
        'sections', jsonb_build_array(jsonb_build_object(
          'id', 'section-1',
          'type', 'Section',
          'props', jsonb_build_object('background', '#fffaf6', 'padding', 32),
          'children', jsonb_build_array(jsonb_build_object(
            'id', 'heading-1',
            'type', 'Heading',
            'props', jsonb_build_object('text', trim(p_title), 'level', 1),
            'style', jsonb_build_object('textAlign', 'center')
          ), jsonb_build_object(
            'id', 'paragraph-1',
            'type', 'Paragraph',
            'props', jsonb_build_object('text', 'Lengkapi detail acara Anda di editor pada fase berikutnya.'),
            'style', jsonb_build_object('textAlign', 'center')
          ))
        ))
      )),
      'assets', jsonb_build_array(),
      'metadata', jsonb_build_object()
    );
  end if;

  insert into public.invitations (
    owner_user_id, created_by, template_id, title, event_category_id, status
  ) values (
    current_user_id, current_user_id, p_template_id, trim(p_title), selected_category_id, 'draft'
  ) returning id into new_invitation_id;

  insert into public.invitation_versions (
    invitation_id, version_no, schema_version, document, asset_manifest, state, created_by
  ) values (
    new_invitation_id, 1, 1, selected_document, selected_manifest, 'draft', current_user_id
  ) returning id into new_version_id;

  update public.invitations set draft_version_id = new_version_id
  where id = new_invitation_id and owner_user_id = current_user_id;

  return new_invitation_id;
end;
$$;
revoke all on function public.create_invitation_draft(text, uuid, uuid) from public, anon;
grant execute on function public.create_invitation_draft(text, uuid, uuid) to authenticated;

create or replace function public.admin_create_template(
  p_slug text,
  p_title text,
  p_description text,
  p_category_id uuid,
  p_style_id uuid,
  p_base_price bigint,
  p_document jsonb,
  p_thumbnail_asset_id uuid default null
)
returns uuid
language plpgsql
security invoker
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

  insert into public.templates (
    slug, title, description, category_id, style_id, base_price, status,
    thumbnail_asset_id, created_by
  ) values (
    p_slug, trim(p_title), coalesce(p_description, ''), p_category_id, p_style_id,
    greatest(coalesce(p_base_price, 0), 0), 'draft', p_thumbnail_asset_id, current_user_id
  ) returning id into new_template_id;

  insert into public.template_versions (
    template_id, version_no, schema_version, document, asset_manifest, change_note, created_by
  ) values (
    new_template_id, 1, 1, p_document, '{}'::jsonb, 'Versi awal', current_user_id
  ) returning id into new_version_id;

  update public.templates
  set current_version_id = new_version_id, status = 'published'
  where id = new_template_id;

  return new_template_id;
end;
$$;
revoke all on function public.admin_create_template(text, text, text, uuid, uuid, bigint, jsonb, uuid) from public, anon;
grant execute on function public.admin_create_template(text, text, text, uuid, uuid, bigint, jsonb, uuid) to authenticated;

create or replace function public.admin_create_template_version(
  p_template_id uuid,
  p_document jsonb,
  p_change_note text default null
)
returns uuid
language plpgsql
security invoker
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
    p_template_id, next_version, 1, p_document, '{}'::jsonb, left(p_change_note, 500), current_user_id
  ) returning id into new_version_id;

  update public.templates
  set current_version_id = new_version_id, status = 'published'
  where id = p_template_id;

  return new_version_id;
end;
$$;
revoke all on function public.admin_create_template_version(uuid, jsonb, text) from public, anon;
grant execute on function public.admin_create_template_version(uuid, jsonb, text) to authenticated;

create or replace function app_private.get_public_invitation(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', i.id,
    'slug', i.slug,
    'title', i.title,
    'locale', i.locale,
    'timezone', i.timezone,
    'document', v.document
  )
  from public.invitations i
  join public.invitation_versions v on v.id = i.published_version_id
  where i.slug = p_slug
    and i.status = 'active'
    and i.active_from <= now()
    and i.active_until > now()
    and v.state = 'published'
  limit 1;
$$;
revoke all on function app_private.get_public_invitation(text) from public, anon, authenticated;
grant usage on schema app_private to anon;
grant execute on function app_private.get_public_invitation(text) to anon, authenticated;

create or replace function public.get_public_invitation(p_slug text)
returns jsonb
language sql
stable
security invoker
set search_path = public, app_private, pg_temp
as $$
  select app_private.get_public_invitation(p_slug);
$$;
revoke all on function public.get_public_invitation(text) from public;
grant execute on function public.get_public_invitation(text) to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('template-assets', 'template-assets', true, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('user-uploads-private', 'user-uploads-private', false, 52428800, array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4', 'audio/mpeg', 'audio/mp4', 'audio/ogg'])
on conflict (id) do nothing;

create policy template_assets_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'template-assets' and app_private.has_permission('templates.manage'));
create policy template_assets_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'template-assets' and app_private.has_permission('templates.manage'))
  with check (bucket_id = 'template-assets' and app_private.has_permission('templates.manage'));
create policy template_assets_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'template-assets' and app_private.has_permission('templates.manage'));

create policy private_upload_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'user-uploads-private'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy private_upload_owner_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'user-uploads-private'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy private_upload_owner_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'user-uploads-private'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'user-uploads-private'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy private_upload_owner_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'user-uploads-private'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
