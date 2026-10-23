-- REVIEW ARTIFACT ONLY. Restore only the original grants from the checked-in migration.
-- Inspect and record actual ACLs before any approved production change.
-- Does not modify any app_state data or historical financial entry.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';
LOCK TABLE public.app_state IN ACCESS EXCLUSIVE MODE;
-- Emergency rollback: restore only the original SELECT/INSERT/UPDATE browser grants.
-- Never grant DELETE/TRUNCATE/REFERENCES/TRIGGER; the original migration explicitly revoked them.
-- Re-check actual production ACLs and reconcile any authorized deviations before execution.
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.app_state FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.app_state TO authenticated;
DROP FUNCTION public.adwaa_cas_write_app_state_v1(timestamptz,jsonb);
NOTIFY pgrst, 'reload schema';
COMMIT;
