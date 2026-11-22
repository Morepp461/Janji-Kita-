-- Fase 1 hardening: fungsi internal tidak diekspos sebagai RPC publik.
create or replace function app_private.has_permission(permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public, app_private, pg_temp
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and (
        ur.role = 'super_admin'
        or exists (
          select 1 from public.role_permissions rp
          where rp.role = ur.role and rp.permission_key = $1
        )
      )
  );
$$;

grant usage on schema app_private to anon, authenticated;
revoke all on function app_private.has_permission(text) from public;
grant execute on function app_private.has_permission(text) to anon, authenticated;

create or replace function app_private.admin_set_user_role(
  p_user_id uuid,
  p_role text,
  p_action text
)
returns void
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
begin
  if not app_private.has_permission('roles.manage') then
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
    delete from public.user_roles where user_id = p_user_id and role = p_role;
  end if;
end;
$$;
revoke all on function app_private.admin_set_user_role(uuid, text, text) from public, anon;
grant execute on function app_private.admin_set_user_role(uuid, text, text) to authenticated;

create or replace function public.admin_set_user_role(p_user_id uuid, p_role text, p_action text)
returns void
language sql
security invoker
set search_path = public, app_private, pg_temp
as $$
  select app_private.admin_set_user_role(p_user_id, p_role, p_action);
$$;
revoke all on function public.admin_set_user_role(uuid, text, text) from public, anon;
grant execute on function public.admin_set_user_role(uuid, text, text) to authenticated;

revoke all on function public.has_permission(text) from public, anon, authenticated;
drop function public.has_permission(text);
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
revoke all on function public.write_admin_audit_log() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;

create index if not exists user_roles_granted_by_idx on public.user_roles(granted_by);
create index if not exists feature_flags_updated_by_idx on public.feature_flags(updated_by);

drop policy if exists profiles_read_self on public.profiles;
drop policy if exists profiles_read_admin on public.profiles;
create policy profiles_read on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or app_private.has_permission('profiles.read'));

drop policy if exists user_roles_read_self on public.user_roles;
drop policy if exists user_roles_read_admin on public.user_roles;
create policy user_roles_read on public.user_roles
  for select to authenticated
  using (user_id = (select auth.uid()) or app_private.has_permission('roles.manage'));

drop policy if exists role_permissions_read_admin on public.role_permissions;
create policy role_permissions_read_admin on public.role_permissions
  for select to authenticated
  using (app_private.has_permission('roles.manage'));

drop policy if exists categories_read_active on public.categories;
drop policy if exists categories_admin_manage on public.categories;
create policy categories_read_active on public.categories
  for select to anon, authenticated
  using (is_active or app_private.has_permission('categories.manage'));
create policy categories_admin_insert on public.categories
  for insert to authenticated
  with check (app_private.has_permission('categories.manage'));
create policy categories_admin_update on public.categories
  for update to authenticated
  using (app_private.has_permission('categories.manage'))
  with check (app_private.has_permission('categories.manage'));
create policy categories_admin_delete on public.categories
  for delete to authenticated
  using (app_private.has_permission('categories.manage'));

drop policy if exists design_styles_read_active on public.design_styles;
drop policy if exists design_styles_admin_manage on public.design_styles;
create policy design_styles_read_active on public.design_styles
  for select to anon, authenticated
  using (is_active or app_private.has_permission('styles.manage'));
create policy design_styles_admin_insert on public.design_styles
  for insert to authenticated
  with check (app_private.has_permission('styles.manage'));
create policy design_styles_admin_update on public.design_styles
  for update to authenticated
  using (app_private.has_permission('styles.manage'))
  with check (app_private.has_permission('styles.manage'));
create policy design_styles_admin_delete on public.design_styles
  for delete to authenticated
  using (app_private.has_permission('styles.manage'));

drop policy if exists feature_flags_read_public on public.feature_flags;
drop policy if exists feature_flags_admin_manage on public.feature_flags;
create policy feature_flags_read_public on public.feature_flags
  for select to anon, authenticated
  using (is_public or app_private.has_permission('feature_flags.manage'));
create policy feature_flags_admin_insert on public.feature_flags
  for insert to authenticated
  with check (app_private.has_permission('feature_flags.manage'));
create policy feature_flags_admin_update on public.feature_flags
  for update to authenticated
  using (app_private.has_permission('feature_flags.manage'))
  with check (app_private.has_permission('feature_flags.manage'));
create policy feature_flags_admin_delete on public.feature_flags
  for delete to authenticated
  using (app_private.has_permission('feature_flags.manage'));

create or replace function public.set_feature_flag_actor()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.set_feature_flag_actor() from public, anon, authenticated;
drop trigger if exists feature_flags_set_actor on public.feature_flags;
create trigger feature_flags_set_actor
  before insert or update on public.feature_flags
  for each row execute function public.set_feature_flag_actor();
