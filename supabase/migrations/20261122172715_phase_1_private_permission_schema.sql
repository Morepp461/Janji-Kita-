-- Fase 1: helper otorisasi berada di schema privat, bukan RPC SECURITY DEFINER publik.
revoke all on schema app_private from public, anon, authenticated;
grant usage on schema app_private to authenticated;

revoke all on function app_private.has_permission(text) from public, anon, authenticated;
grant execute on function app_private.has_permission(text) to authenticated;

revoke all on function app_private.admin_set_user_role(uuid, text, text) from public, anon, authenticated;
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

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or app_private.has_permission('profiles.read'));

drop policy if exists user_roles_read on public.user_roles;
create policy user_roles_read on public.user_roles
  for select to authenticated
  using (user_id = (select auth.uid()) or app_private.has_permission('roles.manage'));

drop policy if exists audit_logs_read_admin on public.audit_logs;
create policy audit_logs_read_admin on public.audit_logs
  for select to authenticated
  using (app_private.has_permission('audit.read'));

drop policy if exists role_permissions_read_admin on public.role_permissions;
create policy role_permissions_read_admin on public.role_permissions
  for select to authenticated
  using (app_private.has_permission('roles.manage'));

drop policy if exists categories_read_active on public.categories;
drop policy if exists categories_read_public on public.categories;
drop policy if exists categories_read_authenticated on public.categories;
create policy categories_read_public on public.categories
  for select to anon
  using (is_active);
create policy categories_read_authenticated on public.categories
  for select to authenticated
  using (is_active or app_private.has_permission('categories.manage'));

drop policy if exists design_styles_read_active on public.design_styles;
drop policy if exists design_styles_read_public on public.design_styles;
drop policy if exists design_styles_read_authenticated on public.design_styles;
create policy design_styles_read_public on public.design_styles
  for select to anon
  using (is_active);
create policy design_styles_read_authenticated on public.design_styles
  for select to authenticated
  using (is_active or app_private.has_permission('styles.manage'));

drop policy if exists feature_flags_read_public on public.feature_flags;
drop policy if exists feature_flags_read_anon on public.feature_flags;
drop policy if exists feature_flags_read_authenticated on public.feature_flags;
create policy feature_flags_read_anon on public.feature_flags
  for select to anon
  using (is_public);
create policy feature_flags_read_authenticated on public.feature_flags
  for select to authenticated
  using (is_public or app_private.has_permission('feature_flags.manage'));

drop policy if exists categories_admin_insert on public.categories;
create policy categories_admin_insert on public.categories
  for insert to authenticated
  with check (app_private.has_permission('categories.manage'));
drop policy if exists categories_admin_update on public.categories;
create policy categories_admin_update on public.categories
  for update to authenticated
  using (app_private.has_permission('categories.manage'))
  with check (app_private.has_permission('categories.manage'));
drop policy if exists categories_admin_delete on public.categories;
create policy categories_admin_delete on public.categories
  for delete to authenticated
  using (app_private.has_permission('categories.manage'));

drop policy if exists design_styles_admin_insert on public.design_styles;
create policy design_styles_admin_insert on public.design_styles
  for insert to authenticated
  with check (app_private.has_permission('styles.manage'));
drop policy if exists design_styles_admin_update on public.design_styles;
create policy design_styles_admin_update on public.design_styles
  for update to authenticated
  using (app_private.has_permission('styles.manage'))
  with check (app_private.has_permission('styles.manage'));
drop policy if exists design_styles_admin_delete on public.design_styles;
create policy design_styles_admin_delete on public.design_styles
  for delete to authenticated
  using (app_private.has_permission('styles.manage'));

drop policy if exists feature_flags_admin_insert on public.feature_flags;
create policy feature_flags_admin_insert on public.feature_flags
  for insert to authenticated
  with check (app_private.has_permission('feature_flags.manage'));
drop policy if exists feature_flags_admin_update on public.feature_flags;
create policy feature_flags_admin_update on public.feature_flags
  for update to authenticated
  using (app_private.has_permission('feature_flags.manage'))
  with check (app_private.has_permission('feature_flags.manage'));
drop policy if exists feature_flags_admin_delete on public.feature_flags;
create policy feature_flags_admin_delete on public.feature_flags
  for delete to authenticated
  using (app_private.has_permission('feature_flags.manage'));

revoke all on function public.has_permission(text) from public, anon, authenticated;
drop function public.has_permission(text);
