drop policy if exists manager_select_app_state on public.app_state;
create policy manager_select_app_state
on public.app_state
for select
to authenticated
using (
  lower(coalesce((select auth.jwt()) ->> 'email', '')) =
  lower('asm114@hotmail.com')
);

drop policy if exists manager_insert_app_state on public.app_state;
create policy manager_insert_app_state
on public.app_state
for insert
to authenticated
with check (
  lower(coalesce((select auth.jwt()) ->> 'email', '')) =
  lower('asm114@hotmail.com')
);

drop policy if exists manager_update_app_state on public.app_state;
create policy manager_update_app_state
on public.app_state
for update
to authenticated
using (
  lower(coalesce((select auth.jwt()) ->> 'email', '')) =
  lower('asm114@hotmail.com')
)
with check (
  lower(coalesce((select auth.jwt()) ->> 'email', '')) =
  lower('asm114@hotmail.com')
);
