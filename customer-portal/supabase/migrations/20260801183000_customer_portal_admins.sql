-- Move standalone customer portal admin authorization away from resort_admins.
-- The public function name is_resort_admin() is intentionally kept so current
-- RLS policies continue to work without changing application code.

create table if not exists public.customer_portal_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customer_portal_admins enable row level security;

do $$
begin
  if to_regclass('public.resort_admins') is not null then
    insert into public.customer_portal_admins (user_id, is_active, created_at, updated_at)
    select user_id, true, coalesce(created_at, now()), now()
    from public.resort_admins
    on conflict (user_id) do update
    set is_active = true,
        updated_at = now();
  end if;
end;
$$;

create or replace function public.set_customer_portal_admins_updated_at()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_customer_portal_admins_updated_at on public.customer_portal_admins;
create trigger set_customer_portal_admins_updated_at
before update on public.customer_portal_admins
for each row execute function public.set_customer_portal_admins_updated_at();

create or replace function public.is_resort_admin()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1
    from public.customer_portal_admins a
    where a.user_id = (select auth.uid())
      and a.is_active = true
  );
$$;

revoke all on function public.is_resort_admin() from public;
grant execute on function public.is_resort_admin() to authenticated;

drop policy if exists "admins read customer portal admins" on public.customer_portal_admins;
create policy "admins read customer portal admins"
on public.customer_portal_admins
for select
to authenticated
using (public.is_resort_admin());

drop policy if exists "admins insert customer portal admins" on public.customer_portal_admins;
create policy "admins insert customer portal admins"
on public.customer_portal_admins
for insert
to authenticated
with check (public.is_resort_admin());

drop policy if exists "admins update customer portal admins" on public.customer_portal_admins;
create policy "admins update customer portal admins"
on public.customer_portal_admins
for update
to authenticated
using (public.is_resort_admin())
with check (public.is_resort_admin());

drop policy if exists "admins delete customer portal admins" on public.customer_portal_admins;
create policy "admins delete customer portal admins"
on public.customer_portal_admins
for delete
to authenticated
using (public.is_resort_admin());

comment on table public.customer_portal_admins is
  'Standalone customer portal admins. This replaces resort_admins in the customer portal Supabase project.';
