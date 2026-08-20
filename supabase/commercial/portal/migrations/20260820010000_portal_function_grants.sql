-- Commercial Portal function-grant hardening.
-- Supabase may include direct default EXECUTE grants for API roles, so revoke anon explicitly
-- from manager-only RPCs while preserving intentionally public token-bounded RPCs.

revoke execute on function public.is_resort_admin() from public, anon;
grant execute on function public.is_resort_admin() to authenticated;

revoke execute on function public.create_customer_portal_worker_check(text,text,date,text,text) from public, anon;
grant execute on function public.create_customer_portal_worker_check(text,text,date,text,text) to authenticated;
