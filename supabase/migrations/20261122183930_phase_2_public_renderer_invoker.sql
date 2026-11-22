-- Fase 2: batasi akses publik melalui RLS dan RPC SECURITY INVOKER.
grant select (slug, title, locale, timezone, status, active_from, active_until, deleted_at, published_version_id)
  on public.invitations to anon;
grant select (id, document, state)
  on public.invitation_versions to anon;

create policy invitations_public_active_read on public.invitations
  for select to anon
  using (
    status = 'active'
    and active_from <= now()
    and active_until > now()
    and deleted_at is null
    and published_version_id is not null
  );

create policy invitation_versions_public_published_read on public.invitation_versions
  for select to anon
  using (
    state = 'published'
    and exists (
      select 1 from public.invitations i
      where i.published_version_id = invitation_versions.id
        and i.status = 'active'
        and i.active_from <= now()
        and i.active_until > now()
        and i.deleted_at is null
    )
  );

create or replace function public.get_public_invitation(p_slug text)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public, pg_temp
as $fn$
  select jsonb_build_object(
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
    and i.deleted_at is null
    and v.state = 'published'
  limit 1;
$fn$;
revoke all on function public.get_public_invitation(text) from public, anon, authenticated;
grant execute on function public.get_public_invitation(text) to anon, authenticated;
