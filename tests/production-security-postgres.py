"""Synthetic-only rehearsal of the approval-only production security proposal.
Run after persistence-postgres.py and persistence-postgrest.py in a fresh isolated container.
"""
import argparse,json,os,subprocess
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--container',required=True);args=parser.parse_args()
assert args.container.startswith('adwaa-maintenance-db-')
env={k:v for k,v in os.environ.items() if k not in ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH']}
docker=['docker','--host=unix:///var/run/docker.sock']
assert subprocess.check_output(docker+['inspect','--format','{{.HostConfig.NetworkMode}}',args.container],text=True,env=env).strip()=='none'
def sql(text,allowed=True,database='postgres'):
    p=subprocess.run(docker+['exec','-i',args.container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',database],input=text,text=True,capture_output=True,env=env,timeout=20)
    if allowed:assert p.returncode==0,p.stderr
    else:assert p.returncode!=0 and 'permission denied' in p.stderr,p.stderr
    return p.stdout.strip()
root=Path(__file__).resolve().parents[1]
# Minimal equivalent catalog shape; all rows are invented, never exported from production.
sql("""
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated;
CREATE TABLE public.reservations(id integer PRIMARY KEY,reservation_number text,customer_id integer,reservation_date date,reservation_type text,total_amount numeric(10,2),manager_commission numeric(10,2));
CREATE TABLE public.payments(id integer PRIMARY KEY,reservation_id integer REFERENCES reservations(id),amount numeric(10,2));
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY manager_reservations ON public.reservations FOR ALL TO authenticated USING (auth.jwt()->>'email'='asm114@hotmail.com') WITH CHECK (auth.jwt()->>'email'='asm114@hotmail.com');
CREATE POLICY manager_payments_select ON public.payments FOR SELECT TO authenticated USING (auth.jwt()->>'email'='asm114@hotmail.com');
CREATE POLICY manager_payments_insert ON public.payments FOR INSERT TO authenticated WITH CHECK (auth.jwt()->>'email'='asm114@hotmail.com');
INSERT INTO public.reservations VALUES(1,'SYNTHETIC-1',1,'2027-01-01','daily',1200,100),(2,'SYNTHETIC-2',2,'2027-01-02','daily',900,80);
INSERT INTO public.payments VALUES(1,1,500),(2,2,900);
CREATE VIEW public.reservation_financials AS SELECT r.id AS reservation_id,r.reservation_number,r.customer_id,r.reservation_date,r.reservation_type,r.total_amount,COALESCE(sum(p.amount),0::numeric)::numeric(10,2) AS paid_amount,GREATEST(r.total_amount-COALESCE(sum(p.amount),0::numeric),0::numeric)::numeric(10,2) AS remaining_amount,CASE WHEN COALESCE(sum(p.amount),0::numeric)>=r.total_amount THEN r.manager_commission ELSE 0::numeric END::numeric(10,2) AS earned_manager_commission,(r.total_amount-CASE WHEN COALESCE(sum(p.amount),0::numeric)>=r.total_amount THEN r.manager_commission ELSE 0::numeric END)::numeric(10,2) AS resort_net_income FROM public.reservations r LEFT JOIN public.payments p ON p.reservation_id=r.id GROUP BY r.id;
GRANT ALL ON public.reservations,public.payments,public.reservation_financials TO anon,authenticated;
REVOKE UPDATE,DELETE ON public.payments FROM authenticated;
REVOKE DELETE ON public.reservations FROM authenticated;
GRANT ALL ON public.app_state TO authenticated;
""")
manager="SET ROLE authenticated; SET request.jwt.claims='{\"email\":\"asm114@hotmail.com\"}';"
other="SET ROLE authenticated; SET request.jwt.claims='{\"email\":\"other@isolated.test\"}';"
assert sql('SET ROLE anon; SELECT count(*) FROM public.reservation_financials;')=='2', 'Expected synthetic reproduction of owner-view RLS bypass'
assert sql(other+'SELECT count(*) FROM public.reservation_financials;')=='2'
view_query='SELECT jsonb_agg(to_jsonb(v) ORDER BY reservation_id) FROM public.reservation_financials v;'
before=sql(manager+view_query)
snapshot_query="SELECT jsonb_build_object('state',(SELECT jsonb_agg(to_jsonb(t)) FROM public.app_state t),'reservations',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.reservations t),'payments',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.payments t))::text;"
snapshot=lambda:sql(snapshot_query)
original=snapshot();definition=sql("SELECT pg_get_viewdef('public.reservation_financials'::regclass,true);")
proposal=(root/'docs/maintenance-production-security-proposal.sql').read_text()
# An inherited bypass must abort the entire security change, preserving prior state.
sql('CREATE ROLE inherited_unsafe; GRANT TRUNCATE ON public.payments TO inherited_unsafe; GRANT inherited_unsafe TO authenticated;')
try:sql(proposal)
except AssertionError as error:assert 'inherited privilege remains' in str(error)
else:raise AssertionError('Inherited privilege was accepted')
assert sql("SELECT coalesce(reloptions::text,'none') FROM pg_class WHERE oid='public.reservation_financials'::regclass;")=='none'
assert snapshot()==original
sql('REVOKE inherited_unsafe FROM authenticated; REVOKE ALL ON public.payments FROM inherited_unsafe; DROP ROLE inherited_unsafe;')
sql(proposal)
assert snapshot()==original
assert sql("SELECT pg_get_viewdef('public.reservation_financials'::regclass,true);")==definition
assert sql(manager+view_query)==before,'Manager financial totals changed'
assert sql(other+'SELECT count(*) FROM public.reservation_financials;')=='0'
sql('SET ROLE anon; SELECT * FROM public.reservation_financials;',False)
for role in ['anon','authenticated']:
    for table in ['app_state','reservations','payments']:
        sql(f'SET ROLE {role}; TRUNCATE public.{table};',False)
assert sql("SELECT has_table_privilege('authenticated','public.payments','UPDATE');")=='f'
# Rehearse the same approved RPC transition and safe rollback after normalization.
import runpy
stages=runpy.run_path(str(root/'tools/prepare-maintenance-rollout.py'))['build']()
for name in ['01-prepare.sql','02-enforce.sql','03-rollback.sql']:
    sql(stages[name])
    if name!='03-rollback.sql':
        assert sql("SELECT has_function_privilege('anon','public.adwaa_cas_write_app_state_v1(timestamptz,jsonb)','EXECUTE');")=='f'
        assert sql("SELECT has_function_privilege('authenticated','public.adwaa_cas_write_app_state_v1(timestamptz,jsonb)','EXECUTE');")=='t'
assert snapshot()==original
assert sql(manager+view_query)==before
assert sql(other+'SELECT count(*) FROM public.reservation_financials;')=='0'
assert sql("SELECT has_table_privilege('authenticated','public.app_state','UPDATE');")=='t'
sql('SET ROLE authenticated; TRUNCATE public.app_state;',False)
# Rehearse a full logical database restore AFTER financial tables and policies exist.
restored_database='adwaa_security_restore_test'
dump=subprocess.run(docker+['exec',args.container,'pg_dump','-U','postgres','-Fc','postgres'],capture_output=True,env=env,check=True).stdout
assert dump.startswith(b'PGDMP')
subprocess.run(docker+['exec',args.container,'createdb','-U','postgres',restored_database],capture_output=True,env=env,check=True)
try:
    subprocess.run(docker+['exec','-i',args.container,'pg_restore','-U','postgres','--exit-on-error','--no-owner','-d',restored_database],input=dump,capture_output=True,env=env,check=True)
    assert sql(snapshot_query,database=restored_database)==original
    assert sql(manager+view_query,database=restored_database)==before
    for query in ["SELECT reloptions::text FROM pg_class WHERE oid='public.reservation_financials'::regclass;", "SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname)::text,'[]') FROM pg_policies p WHERE schemaname='public';", "SELECT coalesce(jsonb_agg(defaclacl::text ORDER BY defaclobjtype)::text,'[]') FROM pg_default_acl;"]:
        assert sql(query,database=restored_database)==sql(query)
    assert sql(other+'SELECT count(*) FROM public.reservation_financials;',database=restored_database)=='0'
    sql('SET ROLE anon; SELECT * FROM public.reservation_financials;',False,restored_database)
    sql('SET ROLE authenticated; TRUNCATE public.reservations;',False,restored_database)
finally:
    subprocess.run(docker+['exec',args.container,'dropdb','-U','postgres',restored_database],capture_output=True,env=env,check=True)
print(json.dumps({'result':'PASS','production_access':False,'checks':['synthetic definer-view bypass reproduced','invoker blocks anon and other identity','manager financial results and base rows unchanged','inherited grants abort transaction','TRUNCATE denied on all three tables','payments UPDATE not expanded','RPC rollout and safe rollback preserve state and view protection','platform-like default function grants removed','full financial DB restore preserves data, totals, policies, defaults and invoker protection']}))
