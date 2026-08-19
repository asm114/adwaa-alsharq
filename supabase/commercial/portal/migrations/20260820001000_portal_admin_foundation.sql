-- Commercial Customer Portal foundation — fresh customer installations only.
-- No developer/customer email is hardcoded. The installer creates the Auth user and registers its UUID securely after migrations.

create table if not exists public.customer_portal_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.customer_portal_admins is
  'Customer-owned administrators for the Customer Portal backend. Membership is provisioned securely and is not public data.';

alter table public.customer_portal_admins enable row level security;
revoke all privileges on table public.customer_portal_admins from anon, authenticated;
grant select, insert, update, delete on table public.customer_portal_admins to service_role;

create or replace function public.is_resort_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.customer_portal_admins a
    where a.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_resort_admin() from public;
grant execute on function public.is_resort_admin() to authenticated;
