-- REVIEW BEFORE USE. STAGING ONLY.
-- Restoring the verified pre-change Snapshot/Dump is the preferred rollback.
begin;
drop function if exists public.cleaner_update_task(uuid,text,bigint,jsonb);
drop function if exists public.cleaner_update_task(uuid,text,jsonb);
drop function if exists public.cleaner_get_task(uuid,text);
drop function if exists public.cleaner_sanitize_photos(jsonb,boolean);
drop function if exists public.cleaner_sanitize_issues(jsonb,boolean);
drop policy if exists "Owner selects app_state" on public.app_state;
drop policy if exists "Owner inserts app_state" on public.app_state;
drop policy if exists "Owner updates app_state" on public.app_state;
drop policy if exists "Owner deletes app_state" on public.app_state;
-- Do not disable RLS or recreate old policies blindly. Restore the exact
-- preflight-recorded policies here after security review, or restore Snapshot.
rollback;

