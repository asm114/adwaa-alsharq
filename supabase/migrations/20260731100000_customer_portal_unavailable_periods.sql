-- Customer Portal admin phase 1 task 4: unavailable periods only.
-- Prepared for review and Staging application. Do not apply to Production without approval.

create table if not exists public.customer_portal_unavailable_periods (
  id uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint customer_portal_unavailable_periods_date_order check (start_date <= end_date),
  constraint customer_portal_unavailable_periods_no_overlap exclude using gist (
    daterange(start_date, end_date, '[]') with &&
  )
);

comment on table public.customer_portal_unavailable_periods is
  'Public-safe unavailable date ranges for the Customer Portal. Does not store bookings, customers, prices, reasons, or internal notes.';
comment on column public.customer_portal_unavailable_periods.start_date is
  'First unavailable Gregorian date, inclusive.';
comment on column public.customer_portal_unavailable_periods.end_date is
  'Last unavailable Gregorian date, inclusive.';

create index if not exists customer_portal_unavailable_periods_start_idx
  on public.customer_portal_unavailable_periods (start_date, end_date);

create or replace function public.set_customer_portal_unavailable_periods_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

drop trigger if exists customer_portal_unavailable_periods_set_updated_at
  on public.customer_portal_unavailable_periods;
create trigger customer_portal_unavailable_periods_set_updated_at
before update on public.customer_portal_unavailable_periods
for each row execute function public.set_customer_portal_unavailable_periods_updated_at();

alter table public.customer_portal_unavailable_periods enable row level security;

revoke all on table public.customer_portal_unavailable_periods from anon, authenticated;
grant select on table public.customer_portal_unavailable_periods to anon, authenticated;
grant insert, update, delete on table public.customer_portal_unavailable_periods to authenticated;

drop policy if exists "public reads customer portal unavailable periods"
  on public.customer_portal_unavailable_periods;
create policy "public reads customer portal unavailable periods"
on public.customer_portal_unavailable_periods
for select
to anon, authenticated
using (true);

drop policy if exists "admins insert customer portal unavailable periods"
  on public.customer_portal_unavailable_periods;
create policy "admins insert customer portal unavailable periods"
on public.customer_portal_unavailable_periods
for insert
to authenticated
with check (public.is_resort_admin());

drop policy if exists "admins update customer portal unavailable periods"
  on public.customer_portal_unavailable_periods;
create policy "admins update customer portal unavailable periods"
on public.customer_portal_unavailable_periods
for update
to authenticated
using (public.is_resort_admin())
with check (public.is_resort_admin());

drop policy if exists "admins delete customer portal unavailable periods"
  on public.customer_portal_unavailable_periods;
create policy "admins delete customer portal unavailable periods"
on public.customer_portal_unavailable_periods
for delete
to authenticated
using (public.is_resort_admin());
