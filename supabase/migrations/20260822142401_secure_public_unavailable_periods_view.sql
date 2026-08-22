-- Staging-only security migration.
-- Historical baseline dependencies already present in Staging and intentionally
-- not replayed here: customer_portal_admins and public.is_resort_admin().

do $$
begin
  if to_regprocedure('public.is_resort_admin()') is null then
    raise exception 'required staging baseline function public.is_resort_admin() is missing';
  end if;

  if to_regclass('public.customer_portal_unavailable_periods') is null then
    raise exception 'required staging baseline table public.customer_portal_unavailable_periods is missing';
  end if;
end
$$;

create or replace view public.customer_portal_unavailable_periods_public
with (
  security_invoker = true,
  security_barrier = true
)
as
select
  start_date,
  end_date
from public.customer_portal_unavailable_periods;

comment on view public.customer_portal_unavailable_periods_public is
  'Public customer-portal calendar surface. Internal ownership and booking identifiers are intentionally excluded.';

revoke all
on public.customer_portal_unavailable_periods_public
from public, anon, authenticated;

grant select
on public.customer_portal_unavailable_periods_public
to anon, authenticated, service_role;

revoke select
on public.customer_portal_unavailable_periods
from anon, authenticated;

grant select (start_date, end_date)
on public.customer_portal_unavailable_periods
to anon;

-- Administrative clients keep table-level SELECT, but RLS now limits it to
-- active resort administrators through the historical baseline helper.
grant select
on public.customer_portal_unavailable_periods
to authenticated;

drop policy if exists "public reads customer portal unavailable periods"
  on public.customer_portal_unavailable_periods;

drop policy if exists "anonymous reads public unavailable dates"
  on public.customer_portal_unavailable_periods;

create policy "anonymous reads public unavailable dates"
on public.customer_portal_unavailable_periods
for select
to anon
using (true);

drop policy if exists "admins read unavailable period internals"
  on public.customer_portal_unavailable_periods;

create policy "admins read unavailable period internals"
on public.customer_portal_unavailable_periods
for select
to authenticated
using ((select public.is_resort_admin()));
