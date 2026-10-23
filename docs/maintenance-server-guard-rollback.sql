-- REVIEW ARTIFACT ONLY. Matches the repository's original authenticated grants.
-- Inspect and record actual ACLs before any approved production change.
-- Does not modify any app_state data or historical financial entry.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';
LOCK TABLE public.app_state IN ACCESS EXCLUSIVE MODE;
GRANT SELECT, INSERT, UPDATE ON public.app_state TO authenticated;
DROP FUNCTION public.adwaa_cas_write_app_state_v1(timestamptz,jsonb);
NOTIFY pgrst, 'reload schema';
COMMIT;
