-- STAGING ONLY. Aborts before changing RLS/policies unless owner is valid.
begin;
do $guard$
declare v_owner uuid;
begin
  if to_regclass('public.app_state') is null then
    raise exception using errcode='55000',message='preflight_failed_app_state_missing';
  end if;
  select owner_id into v_owner from public.app_state where id='main';
  if not found then raise exception using errcode='55000',message='preflight_failed_main_missing'; end if;
  if v_owner is null then raise exception using errcode='55000',message='preflight_failed_owner_missing'; end if;
  if not exists(select 1 from auth.users where id=v_owner) then
    raise exception using errcode='55000',message='preflight_failed_owner_invalid';
  end if;
end
$guard$;

alter table public.app_state enable row level security;
drop policy if exists "Public app_state access" on public.app_state;
drop policy if exists "anon app_state access" on public.app_state;
drop policy if exists "Allow public read" on public.app_state;
drop policy if exists "Allow public write" on public.app_state;
drop policy if exists "Authenticated app_state access" on public.app_state;
drop policy if exists "Owner selects app_state" on public.app_state;
drop policy if exists "Owner inserts app_state" on public.app_state;
drop policy if exists "Owner updates app_state" on public.app_state;
drop policy if exists "Owner deletes app_state" on public.app_state;
create policy "Owner selects app_state" on public.app_state for select to authenticated
using(id='main' and owner_id=auth.uid());
create policy "Owner inserts app_state" on public.app_state for insert to authenticated
with check(id='main' and owner_id=auth.uid());
create policy "Owner updates app_state" on public.app_state for update to authenticated
using(id='main' and owner_id=auth.uid()) with check(id='main' and owner_id=auth.uid());
create policy "Owner deletes app_state" on public.app_state for delete to authenticated
using(id='main' and owner_id=auth.uid());
revoke all on table public.app_state from anon;
grant select,insert,update,delete on table public.app_state to authenticated;
commit;

