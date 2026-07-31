-- Customer Portal admin phase 1 task 5: seasons only.
-- Prepared for review and Staging application. Do not apply to Production without approval.

create table if not exists public.customer_portal_seasons (
  id uuid primary key default gen_random_uuid(),
  season_name text not null,
  start_date date not null,
  end_date date not null,
  season_price numeric(10,2) not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint customer_portal_seasons_name_length check (char_length(season_name) between 1 and 120),
  constraint customer_portal_seasons_date_order check (start_date <= end_date),
  constraint customer_portal_seasons_price_nonnegative check (season_price >= 0),
  constraint customer_portal_seasons_no_overlap exclude using gist (
    daterange(start_date, end_date, '[]') with &&
  )
);

comment on table public.customer_portal_seasons is
  'Public-safe seasonal pricing for the Customer Portal. Does not create bookings or bind prices to calendar availability in phase 1 task 5.';

create index if not exists customer_portal_seasons_public_order_idx
  on public.customer_portal_seasons (is_active, start_date, end_date);

create or replace function public.set_customer_portal_seasons_updated_at()
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

drop trigger if exists customer_portal_seasons_set_updated_at
  on public.customer_portal_seasons;
create trigger customer_portal_seasons_set_updated_at
before update on public.customer_portal_seasons
for each row execute function public.set_customer_portal_seasons_updated_at();

alter table public.customer_portal_seasons enable row level security;

revoke all on table public.customer_portal_seasons from anon, authenticated;
grant select on table public.customer_portal_seasons to anon, authenticated;
grant insert, update, delete on table public.customer_portal_seasons to authenticated;

drop policy if exists "public reads active customer portal seasons"
  on public.customer_portal_seasons;
create policy "public reads active customer portal seasons"
on public.customer_portal_seasons
for select
to anon, authenticated
using (is_active = true);

drop policy if exists "admins read all customer portal seasons"
  on public.customer_portal_seasons;
create policy "admins read all customer portal seasons"
on public.customer_portal_seasons
for select
to authenticated
using (public.is_resort_admin());

drop policy if exists "admins insert customer portal seasons"
  on public.customer_portal_seasons;
create policy "admins insert customer portal seasons"
on public.customer_portal_seasons
for insert
to authenticated
with check (public.is_resort_admin());

drop policy if exists "admins update customer portal seasons"
  on public.customer_portal_seasons;
create policy "admins update customer portal seasons"
on public.customer_portal_seasons
for update
to authenticated
using (public.is_resort_admin())
with check (public.is_resort_admin());

drop policy if exists "admins delete customer portal seasons"
  on public.customer_portal_seasons;
create policy "admins delete customer portal seasons"
on public.customer_portal_seasons
for delete
to authenticated
using (public.is_resort_admin());
