-- READ-ONLY staging inventory.
-- Run only in a dedicated Supabase staging project before applying
-- supabase-security-review.sql. The result contains schema/security metadata,
-- not application rows or customer data.

select
  current_database() as database_name,
  current_setting('server_version') as postgresql_version,
  now() as inspected_at;

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'app_state';

select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'app_state'
order by ordinal_position;

select
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_catalog.pg_policies
where schemaname = 'public'
  and tablename = 'app_state'
order by policyname;

select
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'app_state'
order by grantee, privilege_type;

select
  p.proname as function_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,
  p.proconfig as function_settings,
  pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE') as public_execute,
  pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('cleaner_get_task', 'cleaner_update_task')
order by p.proname;

select
  id,
  owner_id is not null as owner_is_assigned,
  octet_length(data::text) as state_size_bytes,
  updated_at
from public.app_state
where id = 'main';

