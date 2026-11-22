-- Perbaikan Fase 3: satukan kebijakan INSERT aset agar hanya ada satu kebijakan permisif.
drop policy if exists media_assets_admin_insert on public.media_assets;
drop policy if exists media_assets_owner_insert on public.media_assets;

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
