-- REVIEW ONLY. Requires approved production backup/restore gate and explicit DB approval.
-- No data updates, migration, or automatic execution. PostgreSQL 17+.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';
DO $preflight$
BEGIN
  IF current_setting('server_version_num')::integer < 170000 THEN
    RAISE EXCEPTION 'Review MAINTAIN privilege compatibility before execution';
  END IF;
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN ('app_state','reservations','payments')
        AND c.relkind='r' AND c.relrowsecurity)=3
     AND EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.reservation_financials') AND relkind='v') THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Unexpected relations or disabled RLS; stop for review';
  END IF;
END;
$preflight$;
-- Preserve existing authenticated SELECT/INSERT/UPDATE grants and all RLS predicates.
-- Do not grant UPDATE on payments where it was not already allowed.
REVOKE ALL ON public.app_state, public.reservations, public.payments FROM PUBLIC, anon;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.app_state, public.reservations, public.payments FROM authenticated;
-- Change only the privilege context. Keep the view query and financial formulas intact.
ALTER VIEW public.reservation_financials SET (security_invoker=true);
DO $verify$
DECLARE relation_name text; permission_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['app_state','reservations','payments'] LOOP
    FOREACH permission_name IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] LOOP
      IF has_table_privilege('anon','public.'||relation_name,permission_name) THEN
        RAISE EXCEPTION 'Anonymous inherited privilege remains; stop for review';
      END IF;
      IF permission_name NOT IN ('SELECT','INSERT','UPDATE')
        AND has_table_privilege('authenticated','public.'||relation_name,permission_name) THEN
        RAISE EXCEPTION 'Authenticated inherited privilege remains; stop for review';
      END IF;
    END LOOP;
  END LOOP;
END;
$verify$;
NOTIFY pgrst, 'reload schema';
COMMIT;
-- Never roll back by restoring unsafe grants or disabling security_invoker.
-- An approved compatibility rollback restores application code and safe CAS grants only.
