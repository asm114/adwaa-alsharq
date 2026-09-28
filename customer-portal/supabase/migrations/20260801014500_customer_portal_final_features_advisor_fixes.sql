-- Advisor fixes for internal trigger execution and activity-log lookups.

revoke all on function public.log_customer_portal_admin_change() from public, anon, authenticated;

create index if not exists customer_portal_activity_log_admin_idx
on public.customer_portal_activity_log(admin_id);

drop policy if exists "admins create customer portal activity log"
on public.customer_portal_activity_log;

create policy "admins create customer portal activity log"
on public.customer_portal_activity_log for insert to authenticated
with check (
  public.is_resort_admin()
  and admin_id = (select auth.uid())
);
