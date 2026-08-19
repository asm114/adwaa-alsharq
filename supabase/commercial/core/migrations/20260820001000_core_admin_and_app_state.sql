-- Commercial Core foundation — fresh customer installations only.
-- This migration intentionally contains no customer email, brand identity, or production data.
-- The first manager is provisioned after migrations through a secure installer using service-role credentials.

create table if not exists public.commercial_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.commercial_admins is
  'Customer-owned manager membership for the commercial Core application. Provisioned securely; never seeded with a developer identity.';

alter table public.commercial_admins enable row level security;
revoke all privileges on table public.commercial_admins from anon, authenticated;
grant select, insert, update, delete on table public.commercial_admins to service_role;

create or replace function public.is_commercial_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.commercial_admins a
    where a.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_commercial_admin() from public;
grant execute on function public.is_commercial_admin() to authenticated;

create table if not exists public.app_state (
  id text not null primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

revoke all privileges on table public.app_state from anon;
revoke delete, truncate, references, trigger on table public.app_state from authenticated;
grant select, insert, update on table public.app_state to authenticated;

drop policy if exists manager_select_app_state on public.app_state;
create policy manager_select_app_state
on public.app_state
for select
to authenticated
using (public.is_commercial_admin());

drop policy if exists manager_insert_app_state on public.app_state;
create policy manager_insert_app_state
on public.app_state
for insert
to authenticated
with check (public.is_commercial_admin());

drop policy if exists manager_update_app_state on public.app_state;
create policy manager_update_app_state
on public.app_state
for update
to authenticated
using (public.is_commercial_admin())
with check (public.is_commercial_admin());

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'app_state'
  ) then
    alter publication supabase_realtime add table public.app_state;
  end if;
end
$$;
