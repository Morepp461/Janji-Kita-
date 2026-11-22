-- Janji Kita Phase 0 foundation.
-- Business tables and their explicit policies are introduced in later vertical slices.

create schema if not exists app_private;

revoke all on schema app_private from public;
revoke all on schema app_private from anon;
revoke all on schema app_private from authenticated;

-- Public-facing tables must opt in to access explicitly through later migrations.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

alter default privileges in schema public
  revoke all on tables from anon, authenticated;

alter default privileges in schema public
  revoke all on sequences from anon, authenticated;

comment on schema app_private is
  'Private application schema. Never expose directly through the Supabase Data API.';
