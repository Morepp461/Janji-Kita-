-- Fase 2: pastikan RLS versi template membandingkan kolom dari tabel yang benar.
drop policy template_versions_read_public on public.template_versions;
create policy template_versions_read_public on public.template_versions
  for select to anon
  using (exists (
    select 1 from public.templates t
    where t.id = template_versions.template_id
      and t.status = 'published'
      and t.current_version_id = template_versions.id
  ));

drop policy template_versions_read_authenticated on public.template_versions;
create policy template_versions_read_authenticated on public.template_versions
  for select to authenticated
  using (
    exists (
      select 1 from public.templates t
      where t.id = template_versions.template_id
        and t.status = 'published'
        and t.current_version_id = template_versions.id
    ) or app_private.has_permission('templates.manage')
  );
