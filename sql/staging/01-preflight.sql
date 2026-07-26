-- READ ONLY. Same inventory gate as supabase-staging-preflight.sql.
select current_database(),current_setting('server_version'),now();
select c.relname,c.relrowsecurity,c.relforcerowsecurity
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='app_state';
select policyname,permissive,roles,cmd,qual,with_check
from pg_catalog.pg_policies
where schemaname='public' and tablename='app_state'
order by policyname;
select grantee,privilege_type
from information_schema.role_table_grants
where table_schema='public' and table_name='app_state'
order by grantee,privilege_type;

