-- READ ONLY verification after applying RLS/RPC/grants.
select id,owner_id is not null as owner_assigned,
  exists(select 1 from auth.users u where u.id=s.owner_id) as owner_exists
from public.app_state s where id='main';
select c.relrowsecurity as rls_enabled
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='app_state';
select policyname,roles,cmd,qual,with_check from pg_catalog.pg_policies
where schemaname='public' and tablename='app_state' order by policyname;
select p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid) arguments,
  p.prosecdef,p.proconfig,
  pg_catalog.has_function_privilege('public',p.oid,'EXECUTE') public_execute,
  pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,
  pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute
from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname like 'cleaner_%' order by p.proname;

