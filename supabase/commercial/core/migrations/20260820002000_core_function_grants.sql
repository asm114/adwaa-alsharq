-- Commercial Core function-grant hardening.
-- Supabase may include direct default EXECUTE grants for API roles, so revoke anon explicitly.

revoke execute on function public.is_commercial_admin() from public, anon;
grant execute on function public.is_commercial_admin() to authenticated;
