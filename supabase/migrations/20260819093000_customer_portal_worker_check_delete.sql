-- Allow authenticated resort admins to delete worker-check rows.
-- Apply to the dedicated customer-portal project (ztqqdjryvecscidxxbfe).

grant delete on public.customer_portal_worker_checks to authenticated;

drop policy if exists "admins delete worker checks" on public.customer_portal_worker_checks;
create policy "admins delete worker checks"
on public.customer_portal_worker_checks
for delete
to authenticated
using (public.is_resort_admin());
