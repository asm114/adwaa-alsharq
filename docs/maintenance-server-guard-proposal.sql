-- REVIEW ARTIFACT ONLY. Not a migration, and NEVER applied to production by this task.
-- Requires explicit database approval and a coordinated client cutover.
-- The existing frontend must first be prepared with the accompanying RPC patch.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';
LOCK TABLE public.app_state IN ACCESS EXCLUSIVE MODE;

CREATE FUNCTION public.adwaa_cas_write_app_state_v1(
  p_expected_updated_at timestamptz,
  p_data jsonb
) RETURNS TABLE(id text, updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE field_name text;
BEGIN
  -- Definer is deliberate: the caller loses direct UPDATE permission below.
  -- Authorization is still explicit, matching the existing signed-JWT manager policy.
  IF auth.uid() IS NULL OR lower(coalesce(auth.jwt()->>'email','')) <> lower('asm114@hotmail.com') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_expected_updated_at IS NULL OR jsonb_typeof(p_data) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_data->'bookings') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid state or expected revision' USING ERRCODE = '22023';
  END IF;
  FOREACH field_name IN ARRAY ARRAY['expenses','maintenanceJobs','installmentPurchases','subscriptions','subscriptionDrafts','customerCredits','accountingNotes','notifications','auditLog','backupHistory'] LOOP
    IF p_data ? field_name AND jsonb_typeof(p_data->field_name) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Invalid state collection' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  RETURN QUERY UPDATE public.app_state AS state
    SET data = p_data,
        updated_at = greatest(clock_timestamp(), state.updated_at + interval '1 millisecond')
    WHERE state.id = 'main' AND state.updated_at = p_expected_updated_at
    RETURNING state.id, state.updated_at;
END;
$$;
REVOKE ALL ON FUNCTION public.adwaa_cas_write_app_state_v1(timestamptz,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adwaa_cas_write_app_state_v1(timestamptz,jsonb) TO authenticated;
REVOKE INSERT, UPDATE ON public.app_state FROM PUBLIC, anon, authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
