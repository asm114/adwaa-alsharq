-- Customer Portal admin phase 1 task 5: base pricing only.
-- Prepared for review and Staging application. Do not apply to Production without approval.

create table if not exists public.customer_portal_pricing (
  id text primary key default 'main',
  weekday_price numeric(10,2) not null default 0,
  weekend_price numeric(10,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint customer_portal_pricing_singleton check (id = 'main'),
  constraint customer_portal_pricing_weekday_nonnegative check (weekday_price >= 0),
  constraint customer_portal_pricing_weekend_nonnegative check (weekend_price >= 0)
);

comment on table public.customer_portal_pricing is
  'Public-safe base pricing for the Customer Portal. Does not create bookings or calculate calendar availability.';

insert into public.customer_portal_pricing (
  id,
  weekday_price,
  weekend_price
) values (
  'main',
  0,
  0
)
on conflict (id) do nothing;

create or replace function public.set_customer_portal_pricing_updated_at()
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

drop trigger if exists customer_portal_pricing_set_updated_at
  on public.customer_portal_pricing;
create trigger customer_portal_pricing_set_updated_at
before update on public.customer_portal_pricing
for each row execute function public.set_customer_portal_pricing_updated_at();

alter table public.customer_portal_pricing enable row level security;

revoke all on table public.customer_portal_pricing from anon, authenticated;
grant select on table public.customer_portal_pricing to anon, authenticated;
grant insert, update on table public.customer_portal_pricing to authenticated;

drop policy if exists "public reads customer portal pricing"
  on public.customer_portal_pricing;
create policy "public reads customer portal pricing"
on public.customer_portal_pricing
for select
to anon, authenticated
using (id = 'main');

drop policy if exists "admins insert customer portal pricing"
  on public.customer_portal_pricing;
create policy "admins insert customer portal pricing"
on public.customer_portal_pricing
for insert
to authenticated
with check (public.is_resort_admin() and id = 'main');

drop policy if exists "admins update customer portal pricing"
  on public.customer_portal_pricing;
create policy "admins update customer portal pricing"
on public.customer_portal_pricing
for update
to authenticated
using (public.is_resort_admin())
with check (public.is_resort_admin() and id = 'main');
