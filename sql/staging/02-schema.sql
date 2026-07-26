-- STAGING ONLY. Does not enable RLS or change policies.
begin;
alter table public.app_state
  add column if not exists owner_id uuid references auth.users(id);
commit;

