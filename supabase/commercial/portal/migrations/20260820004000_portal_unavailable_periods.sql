-- Commercial Customer Portal unavailable periods — fresh customer installations only.
-- Customer-neutral schema. No booking/customer data is seeded.

create table if not exists public.customer_portal_unavailable_periods (
  id uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date date not null,
  source_type text not null default 'manual',
  booking_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_portal_unavailable_periods_date_order
    check (start_date <= end_date),
  constraint customer_portal_unavailable_periods_source_type_check
    check (source_type in ('legacy','manual','booking')),
  constraint customer_portal_unavailable_periods_booking_owner_check
    check (
      (source_type = 'booking' and nullif(btrim(booking_id), '') is not null)
      or
      (source_type in ('legacy','manual') and booking_id is null)
    ),
  constraint customer_portal_unavailable_periods_no_overlap
    exclude using gist (daterange(start_date, end_date, '[]') with &&)
);

comment on table public.customer_portal_unavailable_periods is
  'Public-safe unavailable date ranges for the Customer Portal. Stores closure ownership only; no customer identity, price, reason, or internal note.';
comment on column public.customer_portal_unavailable_periods.source_type is
  'Closure ownership: manual admin closure, booking-generated closure, or legacy for controlled imports from an older installation.';
comment on column public.customer_portal_unavailable_periods.booking_id is
  'Admin booking identifier only when source_type=booking. Booking/customer state remains in the separate Core backend.';

create index if not exists customer_portal_unavailable_periods_start_idx
  on public.customer_portal_unavailable_periods (start_date, end_date);
create index if not exists customer_portal_unavailable_periods_booking_idx
  on public.customer_portal_unavailable_periods (booking_id, start_date, end_date)
  where source_type = 'booking';

create or replace function public.set_customer_portal_unavailable_periods_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
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
