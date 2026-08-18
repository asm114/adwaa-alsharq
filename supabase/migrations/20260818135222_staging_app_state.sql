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
using (
  lower(coalesce(auth.jwt() ->> 'email', '')) = lower('asm114@hotmail.com')
);

drop policy if exists manager_insert_app_state on public.app_state;
create policy manager_insert_app_state
on public.app_state
for insert
to authenticated
with check (
  lower(coalesce(auth.jwt() ->> 'email', '')) = lower('asm114@hotmail.com')
);

drop policy if exists manager_update_app_state on public.app_state;
create policy manager_update_app_state
on public.app_state
for update
to authenticated
using (
  lower(coalesce(auth.jwt() ->> 'email', '')) = lower('asm114@hotmail.com')
)
with check (
  lower(coalesce(auth.jwt() ->> 'email', '')) = lower('asm114@hotmail.com')
);

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
