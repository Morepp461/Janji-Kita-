-- Restrict direct RPC execution of Supabase's RLS auto-enable event-trigger function.
-- The database event trigger remains active for trusted DDL operations.
DO $$
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated';
  END IF;
END
$$;
