-- Phase 7 security boundary: public RPCs are invoker wrappers; privileged implementations stay in app_private.

-- Cover the new foreign keys with indexes.
create index if not exists analytics_events_invitation_occurred_idx
  on public.analytics_events(invitation_id, occurred_at desc)
  where invitation_id is not null;
create index if not exists system_settings_updated_by_idx
  on public.system_settings(updated_by)
  where updated_by is not null;
create index if not exists templates_source_consent_id_idx
  on public.templates(source_consent_id)
  where source_consent_id is not null;
create index if not exists templates_source_invitation_id_idx
  on public.templates(source_invitation_id)
  where source_invitation_id is not null;
create index if not exists templates_moderated_by_idx
  on public.templates(moderated_by)
  where moderated_by is not null;

-- Consolidate permissive SELECT policies introduced in phase 7.
drop policy if exists consent_records_admin_select on public.consent_records;
drop policy if exists consent_records_owner_select on public.consent_records;
create policy consent_records_read on public.consent_records
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select app_private.has_permission('consent.read'))
  );

drop policy if exists locales_admin_select on public.locales;
drop policy if exists locales_read_active on public.locales;
create policy locales_read_active_anon on public.locales
  for select to anon using (is_active);
create policy locales_read_authenticated on public.locales
  for select to authenticated
  using (
    is_active
    or (select app_private.has_permission('locales.manage'))
  );

-- The timezone catalog is intentionally public; other system settings remain admin-only.
drop policy if exists system_settings_admin_select on public.system_settings;
create policy system_settings_read on public.system_settings
  for select to authenticated
  using (
    key = 'localization.timezones'
    or (select app_private.has_permission('settings.manage'))
  );
create policy system_settings_public_localization_read on public.system_settings
  for select to anon
  using (key = 'localization.timezones');
grant select (key, value) on public.system_settings to anon;

-- Public localization is read-only and can run as the caller under the narrow policy above.
create or replace function public.get_public_localization_config()
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'locales',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'code', code,
          'name', name,
          'native_name', native_name,
          'is_default', is_default
        )
        order by sort_order, code
      )
      from public.locales
      where is_active
    ), '[]'::jsonb),
    'timezones',
    coalesce((
      select value
      from public.system_settings
      where key = 'localization.timezones'
    ), '["Asia/Jakarta","Asia/Makassar","Asia/Jayapura","Asia/Singapore","UTC"]'::jsonb)
  );
$$;
revoke all on function public.get_public_localization_config() from public;
grant execute on function public.get_public_localization_config() to anon, authenticated;

-- Move privileged implementations out of the exposed API schema.
drop function if exists public.admin_create_template(text,text,text,uuid,uuid,bigint,jsonb,uuid);
alter function public.admin_create_template(text,text,text,uuid,uuid,bigint,jsonb,uuid,text) set schema app_private;
alter function public.admin_create_template_version(uuid,jsonb,text) set schema app_private;
alter function public.admin_get_analytics_summary(integer) set schema app_private;
alter function public.admin_link_template_consent(uuid,uuid,uuid) set schema app_private;
alter function public.admin_list_marketplace_consents() set schema app_private;
alter function public.admin_review_marketplace_consent(uuid,text,text) set schema app_private;
alter function public.admin_set_default_locale(text) set schema app_private;
alter function public.admin_set_locale_active(text,boolean) set schema app_private;
alter function public.admin_set_template_moderation(uuid,text,text) set schema app_private;
alter function public.admin_update_timezone_options(jsonb) set schema app_private;
alter function public.record_marketplace_consent(uuid,uuid,text) set schema app_private;
alter function public.track_analytics_event(text,uuid,jsonb) set schema app_private;
alter function public.update_invitation_localization(uuid,text,text) set schema app_private;
alter function public.withdraw_marketplace_consent(uuid) set schema app_private;

grant usage on schema app_private to authenticated;

revoke all on function app_private.admin_create_template(text,text,text,uuid,uuid,bigint,jsonb,uuid,text) from public, anon;
revoke all on function app_private.admin_create_template_version(uuid,jsonb,text) from public, anon;
revoke all on function app_private.admin_get_analytics_summary(integer) from public, anon;
revoke all on function app_private.admin_link_template_consent(uuid,uuid,uuid) from public, anon;
revoke all on function app_private.admin_list_marketplace_consents() from public, anon;
revoke all on function app_private.admin_review_marketplace_consent(uuid,text,text) from public, anon;
revoke all on function app_private.admin_set_default_locale(text) from public, anon;
revoke all on function app_private.admin_set_locale_active(text,boolean) from public, anon;
revoke all on function app_private.admin_set_template_moderation(uuid,text,text) from public, anon;
revoke all on function app_private.admin_update_timezone_options(jsonb) from public, anon;
revoke all on function app_private.record_marketplace_consent(uuid,uuid,text) from public, anon;
revoke all on function app_private.track_analytics_event(text,uuid,jsonb) from public, anon;
revoke all on function app_private.update_invitation_localization(uuid,text,text) from public, anon;
revoke all on function app_private.withdraw_marketplace_consent(uuid) from public, anon;

grant execute on function app_private.admin_create_template(text,text,text,uuid,uuid,bigint,jsonb,uuid,text) to authenticated;
grant execute on function app_private.admin_create_template_version(uuid,jsonb,text) to authenticated;
grant execute on function app_private.admin_get_analytics_summary(integer) to authenticated;
grant execute on function app_private.admin_link_template_consent(uuid,uuid,uuid) to authenticated;
grant execute on function app_private.admin_list_marketplace_consents() to authenticated;
grant execute on function app_private.admin_review_marketplace_consent(uuid,text,text) to authenticated;
grant execute on function app_private.admin_set_default_locale(text) to authenticated;
grant execute on function app_private.admin_set_locale_active(text,boolean) to authenticated;
grant execute on function app_private.admin_set_template_moderation(uuid,text,text) to authenticated;
grant execute on function app_private.admin_update_timezone_options(jsonb) to authenticated;
grant execute on function app_private.record_marketplace_consent(uuid,uuid,text) to authenticated;
grant execute on function app_private.track_analytics_event(text,uuid,jsonb) to authenticated;
grant execute on function app_private.update_invitation_localization(uuid,text,text) to authenticated;
grant execute on function app_private.withdraw_marketplace_consent(uuid) to authenticated;

-- Exposed RPC wrappers run as invoker; authorization remains inside the private implementation.
create function public.admin_create_template(
  p_slug text,
  p_title text,
  p_description text,
  p_category_id uuid,
  p_style_id uuid,
  p_base_price bigint,
  p_document jsonb,
  p_thumbnail_asset_id uuid,
  p_source_type text
)
returns uuid
language sql
security invoker
set search_path = public, app_private, pg_temp
as $$
  select app_private.admin_create_template(
    p_slug, p_title, p_description, p_category_id, p_style_id,
    p_base_price, p_document, p_thumbnail_asset_id, p_source_type
  );
$$;
revoke all on function public.admin_create_template(text,text,text,uuid,uuid,bigint,jsonb,uuid,text) from public, anon;
grant execute on function public.admin_create_template(text,text,text,uuid,uuid,bigint,jsonb,uuid,text) to authenticated;


create function public.admin_create_template(
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
language sql
security invoker
set search_path = public, app_private, pg_temp
as $
  select app_private.admin_create_template(
    p_slug, p_title, p_description, p_category_id, p_style_id,
    p_base_price, p_document, p_thumbnail_asset_id, 'first_party'
  );
$;
revoke all on function public.admin_create_template(text,text,text,uuid,uuid,bigint,jsonb,uuid) from public, anon;
grant execute on function public.admin_create_template(text,text,text,uuid,uuid,bigint,jsonb,uuid) to authenticated;

create function public.admin_create_template_version(
  p_template_id uuid,
  p_document jsonb,
  p_change_note text default null
)
returns uuid
language sql
security invoker
set search_path = public, app_private, pg_temp
as $$
  select app_private.admin_create_template_version(p_template_id, p_document, p_change_note);
$$;
revoke all on function public.admin_create_template_version(uuid,jsonb,text) from public, anon;
grant execute on function public.admin_create_template_version(uuid,jsonb,text) to authenticated;

create function public.admin_get_analytics_summary(p_days integer default 30)
returns jsonb
language sql
stable
security invoker
set search_path = public, app_private, pg_temp
as $$
  select app_private.admin_get_analytics_summary(p_days);
$$;
revoke all on function public.admin_get_analytics_summary(integer) from public, anon;
grant execute on function public.admin_get_analytics_summary(integer) to authenticated;

create function public.admin_link_template_consent(
  p_template_id uuid,
  p_invitation_id uuid,
  p_consent_id uuid
)
returns void
language sql
security invoker
set search_path = public, app_private, pg_temp
as $$
  select app_private.admin_link_template_consent(p_template_id, p_invitation_id, p_consent_id);
$$;
revoke all on function public.admin_link_template_consent(uuid,uuid,uuid) from public, anon;
grant execute on function public.admin_link_template_consent(uuid,uuid,uuid) to authenticated;

create function public.admin_list_marketplace_consents()
returns table (
  id uuid,
  user_id uuid,
  invitation_id uuid,
  order_id uuid,
  granted boolean,
  granted_at timestamptz,
  withdrawn_at timestamptz,
  consent_text_version text,
  metadata jsonb
)
language sql
stable
security invoker
set search_path = public, app_private, pg_temp
as $$
  select * from app_private.admin_list_marketplace_consents();
$$;
revoke all on function public.admin_list_marketplace_consents() from public, anon;
grant execute on function public.admin_list_marketplace_consents() to authenticated;

create function public.admin_review_marketplace_consent(
  p_consent_id uuid,
  p_decision text,
  p_note text default null
)
returns void
language sql
security invoker
set search_path = public, app_private, pg_temp
as $$
  select app_private.admin_review_marketplace_consent(p_consent_id, p_decision, p_note);
$$;
revoke all on function public.admin_review_marketplace_consent(uuid,text,text) from public, anon;
grant execute on function public.admin_review_marketplace_consent(uuid,text,text) to authenticated;

create function public.admin_set_default_locale(p_code text)
returns void
language sql
security invoker
set search_path = public, app_private, pg_temp
as $$
  select app_private.admin_set_default_locale(p_code);
$$;
revoke all on function public.admin_set_default_locale(text) from public, anon;
grant execute on function public.admin_set_default_locale(text) to authenticated;

create function public.admin_set_locale_active(p_code text, p_is_active boolean)
returns void
language sql
security invoker
set search_path = public, app_private, pg_temp
as $$
  select app_private.admin_set_locale_active(p_code, p_is_active);
$$;
revoke all on function public.admin_set_locale_active(text,boolean) from public, anon;
grant execute on function public.admin_set_locale_active(text,boolean) to authenticated;

create function public.admin_set_template_moderation(
  p_template_id uuid,
  p_status text,
  p_note text default null
)
returns void
language sql
security invoker
set search_path = public, app_private, pg_temp
as $$
  select app_private.admin_set_template_moderation(p_template_id, p_status, p_note);
$$;
revoke all on function public.admin_set_template_moderation(uuid,text,text) from public, anon;
grant execute on function public.admin_set_template_moderation(uuid,text,text) to authenticated;

create function public.admin_update_timezone_options(p_timezones jsonb)
returns void
language sql
security invoker
set search_path = public, app_private, pg_temp
as $$
  select app_private.admin_update_timezone_options(p_timezones);
$$;
revoke all on function public.admin_update_timezone_options(jsonb) from public, anon;
grant execute on function public.admin_update_timezone_options(jsonb) to authenticated;

create function public.record_marketplace_consent(
  p_invitation_id uuid,
  p_order_id uuid,
  p_consent_text_version text
)
returns uuid
language sql
security invoker
set search_path = public, app_private, pg_temp
as $$
  select app_private.record_marketplace_consent(p_invitation_id, p_order_id, p_consent_text_version);
$$;
revoke all on function public.record_marketplace_consent(uuid,uuid,text) from public, anon;
grant execute on function public.record_marketplace_consent(uuid,uuid,text) to authenticated;

create function public.track_analytics_event(
  p_event_name text,
  p_invitation_id uuid default null,
  p_properties jsonb default '{}'::jsonb
)
returns uuid
language sql
security invoker
set search_path = public, app_private, pg_temp
as $$
  select app_private.track_analytics_event(p_event_name, p_invitation_id, p_properties);
$$;
revoke all on function public.track_analytics_event(text,uuid,jsonb) from public, anon;
grant execute on function public.track_analytics_event(text,uuid,jsonb) to authenticated;

create function public.update_invitation_localization(
  p_invitation_id uuid,
  p_locale text,
  p_timezone text
)
returns timestamptz
language sql
security invoker
set search_path = public, app_private, pg_temp
as $$
  select app_private.update_invitation_localization(p_invitation_id, p_locale, p_timezone);
$$;
revoke all on function public.update_invitation_localization(uuid,text,text) from public, anon;
grant execute on function public.update_invitation_localization(uuid,text,text) to authenticated;

create function public.withdraw_marketplace_consent(p_consent_id uuid)
returns void
language sql
security invoker
set search_path = public, app_private, pg_temp
as $$
  select app_private.withdraw_marketplace_consent(p_consent_id);
$$;
revoke all on function public.withdraw_marketplace_consent(uuid) from public, anon;
grant execute on function public.withdraw_marketplace_consent(uuid) to authenticated;

comment on function public.admin_create_template(text,text,text,uuid,uuid,bigint,jsonb,uuid,text)
  is 'Invoker RPC; delegates to an app_private SECURITY DEFINER helper that requires templates.manage.';
comment on function public.admin_get_analytics_summary(integer)
  is 'Invoker RPC; delegates to an app_private SECURITY DEFINER helper that requires analytics.read.';
comment on function public.admin_list_marketplace_consents()
  is 'Invoker RPC; delegates to an app_private SECURITY DEFINER helper that requires consent.read.';
comment on function public.record_marketplace_consent(uuid,uuid,text)
  is 'Invoker RPC; private helper validates auth.uid(), order ownership, invitation ownership, and consent scope.';
comment on function public.withdraw_marketplace_consent(uuid)
  is 'Invoker RPC; private helper only permits the consent owner to withdraw their own consent.';
comment on function public.track_analytics_event(text,uuid,jsonb)
  is 'Invoker RPC; private helper validates auth.uid(), event allowlist, and normalized route metadata.';
