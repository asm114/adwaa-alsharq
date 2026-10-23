"""Real REST/JWT/RLS/CAS checks inside the local, network-disabled Docker namespace.
Run after persistence-postgres.py; accepts no remote database URL or credentials.
"""
import argparse
import base64
import concurrent.futures
import hashlib
import hmac
import json
import os
from pathlib import Path
import secrets
import runpy
import subprocess
import time
from urllib.parse import urlencode

parser=argparse.ArgumentParser()
parser.add_argument('--container',required=True)
args=parser.parse_args()
assert args.container.startswith('adwaa-maintenance-db-')
env={k:v for k,v in os.environ.items() if k not in ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH']}
docker=['docker','--host=unix:///var/run/docker.sock']
assert subprocess.check_output(docker+['inspect','--format','{{.HostConfig.NetworkMode}}',args.container],env=env,text=True).strip()=='none'
subprocess.run(docker+['exec','-i',args.container,'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres'],env=env,input='create role authenticator login noinherit; grant anon,authenticated to authenticator; grant usage on schema public to anon,authenticated;',text=True,check=True,capture_output=True)
secret=secrets.token_urlsafe(48)
rest=args.container.replace('adwaa-maintenance-db-','adwaa-maintenance-rest-')
image='postgrest/postgrest@sha256:1347d7552b88f17832912c06afbf7c43209af6eeeb60834b04aae12c9bd9d5cc'
server_env={**env,'PGRST_JWT_SECRET':secret}
subprocess.run(docker+['run','--rm','-d','--name',rest,'--network','container:'+args.container,'-e','PGRST_DB_URI=postgres://authenticator@127.0.0.1:5432/postgres','-e','PGRST_DB_SCHEMAS=public','-e','PGRST_DB_ANON_ROLE=anon','-e','PGRST_JWT_SECRET',image],env=server_env,text=True,check=True,capture_output=True)

def token(email,claims=None):
    encode=lambda x:base64.urlsafe_b64encode(x).rstrip(b'=')
    payload={'sub':'00000000-0000-4000-8000-000000000001','role':'authenticated','email':email,'exp':int(time.time())+300}
    payload.update(claims or {})
    signing=encode(b'{"alg":"HS256","typ":"JWT"}')+b'.'+encode(json.dumps(payload).encode())
    return (signing+b'.'+encode(hmac.new(secret.encode(),signing,hashlib.sha256).digest())).decode()


def http(method,path,email=None,payload=None,claims=None):
    body=b'' if payload is None else json.dumps(payload).encode()
    headers=[method+' '+path+' HTTP/1.0','Host: localhost','Connection: close','Accept: application/json','Prefer: return=representation','Content-Type: application/json','Content-Length: '+str(len(body))]
    if email:headers.append('Authorization: Bearer '+token(email,claims))
    wire=('\r\n'.join(headers)+'\r\n\r\n').encode()+body
    # Bash opens only loopback inside the isolated database namespace; no host ports.
    r=subprocess.run(docker+['exec','-i',args.container,'bash','-c','exec 3<>/dev/tcp/127.0.0.1/3000; cat >&3; cat <&3'],input=wire,capture_output=True,env=env,timeout=15)
    assert r.returncode==0,r.stderr.decode()
    head,body=r.stdout.split(b'\r\n\r\n',1)
    return int(head.splitlines()[0].split()[1]),json.loads(body) if body.strip() else None


try:
    for _ in range(30):
        try:http('GET','/app_state?select=id');break
        except (AssertionError,ValueError):time.sleep(.2)
    else:raise AssertionError('Local REST did not start')
    assert http('GET','/app_state?select=id')[0] in [401,403]
    assert http('GET','/app_state?select=id','unauthorized@isolated.test')==(200,[])
    manager='asm114@hotmail.com'
    code,rows=http('GET','/app_state?select=id,data,updated_at',manager)
    assert code==200 and len(rows)==1
    baseline=rows[0]
    path='/app_state?'+urlencode({'id':'eq.main','updated_at':'eq.'+baseline['updated_at'],'select':'id,updated_at'})
    def race(index):
        data={**baseline['data'],'restWinner':index}
        return http('PATCH',path,manager,{'data':data,'updated_at':'2099-01-01T00:00:00.001Z'})
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(race,[1,2]))
    assert [r[0] for r in results]==[200,200],results
    assert sorted(len(r[1]) for r in results)==[0,1],results
    assert http('PATCH','/app_state?id=eq.main','unauthorized@isolated.test',{'data':{}})==(200,[])
    assert http('POST','/app_state','unauthorized@isolated.test',{'id':'forbidden','data':{}})[0]==403
    assert http('DELETE','/app_state?id=eq.main',manager)[0]==403
    code,after=http('GET','/app_state?select=data',manager)
    assert after[0]['data']['bookings']==baseline['data']['bookings']
    assert after[0]['data']['seq']==baseline['data']['seq']
    # Evidence for the rollout gate: unchanged legacy clients still hold UPDATE permission.
    assert http('PATCH','/app_state?id=eq.main',manager,{'data':{**after[0]['data'],'legacyBypassProbe':True}})[0]==200
    # Validate the approval-only server guard in this isolated database, not in the app.
    def sql(text):
        subprocess.run(docker+['exec','-i',args.container,'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres'],input=text,text=True,capture_output=True,env=env,check=True)
    sql("create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;")
    root=Path(__file__).resolve().parents[1]
    guard_sql=(root/'docs/maintenance-server-guard-proposal.sql').read_text()
    # Reproduce the live-production ACL drift using only the disposable database.
    # A guard rollout must fail BEFORE touching grants or installing the RPC.
    sql('GRANT DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.app_state TO authenticated;')
    try:
        sql(guard_sql)
    except subprocess.CalledProcessError as exc:
        assert 'Unexpected app_state authenticated privileges' in (exc.stderr or ''), (exc.stderr or '')[-1500:]
    else:
        raise AssertionError('Guard accepted an unreviewed production-like ACL')
    acl_sql="select string_agg(privilege_type,',' order by privilege_type) from information_schema.role_table_grants where table_schema='public' and table_name='app_state' and grantee='authenticated';"
    def read_acl():
        return subprocess.run(docker+['exec','-i',args.container,'psql','-X','-v','ON_ERROR_STOP=1','-qAt','-U','postgres'],input=acl_sql,text=True,capture_output=True,env=env,check=True).stdout.strip()
    assert read_acl()=='DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE'
    sql("REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.app_state FROM authenticated;")
    assert read_acl()=='INSERT,SELECT,UPDATE'
    # Reject bypasses that a direct authenticated ACL list cannot reveal.
    for unsafe,cleanup in [
        ('GRANT TRUNCATE ON public.app_state TO anon;', 'REVOKE TRUNCATE ON public.app_state FROM anon;'),
        ('GRANT UPDATE ON public.app_state TO PUBLIC;', 'REVOKE UPDATE ON public.app_state FROM PUBLIC;'),
        ('CREATE ROLE legacy_writer; GRANT UPDATE ON public.app_state TO legacy_writer; GRANT legacy_writer TO authenticated;', 'REVOKE legacy_writer FROM authenticated; REVOKE ALL ON public.app_state FROM legacy_writer; DROP ROLE legacy_writer;')
    ]:
        sql(unsafe)
        try:sql(guard_sql)
        except subprocess.CalledProcessError as exc:
            assert 'Unexpected app_state' in (exc.stderr or ''), (exc.stderr or '')[-1500:]
        else:raise AssertionError('Guard accepted a public/anonymous/inherited mutation grant')
        assert read_acl()=='INSERT,SELECT,UPDATE', 'Rejected preflight changed authenticated ACL'
        sql(cleanup)
    sql(guard_sql)
    # Rehearse the prepared-RPC compatibility window, then enforce again.
    stages=runpy.run_path(str(root/'tools/prepare-maintenance-rollout.py'))['build']()
    rollback_sql=stages['03-rollback.sql']
    sql(rollback_sql)
    revoke='REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.app_state FROM PUBLIC, anon, authenticated;'
    assert guard_sql.count(revoke)==1
    sql(stages['01-prepare.sql'])
    # A modified prepared RPC must abort enforcement without revoking access.
    sql("ALTER FUNCTION public.adwaa_cas_write_app_state_v1(timestamptz,jsonb) SET search_path=public;")
    try:sql(stages['02-enforce.sql'])
    except subprocess.CalledProcessError as exc:
        assert 'Prepared CAS function differs' in (exc.stderr or '')
    else:raise AssertionError('Enforcement accepted an unreviewed RPC')
    assert read_acl()=='INSERT,SELECT,UPDATE'
    sql("ALTER FUNCTION public.adwaa_cas_write_app_state_v1(timestamptz,jsonb) SET search_path=pg_catalog;")
    assert read_acl()=='INSERT,SELECT,UPDATE'
    # Both transports coexist without an unconditional write fallback.
    # The same row version must allow exactly one winner across PATCH and RPC.
    for _ in range(30):
        code,_=http('POST','/rpc/adwaa_cas_write_app_state_v1',manager,{'p_expected_updated_at':None,'p_data':baseline['data']})
        if code!=404:break
        time.sleep(.2)
    assert code==400,code
    _,mixed_current=http('GET','/app_state?select=data,updated_at',manager)
    mixed=mixed_current[0]
    mixed_path='/app_state?'+urlencode({'id':'eq.main','updated_at':'eq.'+mixed['updated_at'],'select':'id,updated_at'})
    def mixed_write(use_rpc):
        if use_rpc:return http('POST','/rpc/adwaa_cas_write_app_state_v1',manager,{'p_expected_updated_at':mixed['updated_at'],'p_data':mixed['data']})
        return http('PATCH',mixed_path,manager,{'data':mixed['data'],'updated_at':'2099-01-01T00:00:00.002Z'})
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        mixed_results=list(pool.map(mixed_write,[False,True]))
    assert [r[0] for r in mixed_results]==[200,200],mixed_results
    assert sorted(len(r[1]) for r in mixed_results)==[0,1],mixed_results
    sql(stages['02-enforce.sql'])
    # Verify the effective grants, not just HTTP PATCH behavior.
    acl=read_acl()
    assert acl=='SELECT', f'Unexpected browser role privileges after guard: {acl!r}'
    assert http('DELETE','/app_state?id=eq.main',manager)[0]==403
    # RLS does not protect TRUNCATE; exercise the actual SQL privilege as the browser role.
    def assert_truncate_denied(stage):
        probe=subprocess.run(docker+['exec','-i',args.container,'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres'],
                             input='SET ROLE authenticated; TRUNCATE TABLE public.app_state;',
                             text=True,capture_output=True,env=env,timeout=15)
        assert probe.returncode!=0 and 'permission denied' in probe.stderr.lower(), (stage,probe.returncode,probe.stderr)
    assert_truncate_denied('guard')
    rpc='/rpc/adwaa_cas_write_app_state_v1'
    for _ in range(30):
        code,_=http('POST',rpc,manager,{'p_expected_updated_at':None,'p_data':baseline['data']})
        if code!=404:break
        time.sleep(.2)
    assert code==400,code
    denied_direct=http('PATCH','/app_state?id=eq.main',manager,{'data':{}})
    assert denied_direct[0]==403, f'Guard failed to deny direct PATCH: {denied_direct!r}'
    assert http('POST',rpc,'unauthorized@isolated.test',{'p_expected_updated_at':baseline['updated_at'],'p_data':baseline['data']})[0]==403
    assert http('POST',rpc,None,{'p_expected_updated_at':baseline['updated_at'],'p_data':baseline['data']})[0] in [401,403]
    params={'p_expected_updated_at':baseline['updated_at'],'p_data':baseline['data']}
    assert http('POST',rpc,manager,params,{'sub':None})[0]==403
    assert http('POST',rpc,'unauthorized@isolated.test',params,{'user_metadata':{'email':manager}})[0]==403
    assert http('POST',rpc,manager,params,{'exp':int(time.time())-60})[0]==401
    _,current=http('GET','/app_state?select=data,updated_at',manager)
    _,written=http('POST',rpc,manager,{'p_expected_updated_at':current[0]['updated_at'],'p_data':current[0]['data']})
    assert len(written)==1
    assert http('POST',rpc,manager,{'p_expected_updated_at':current[0]['updated_at'],'p_data':current[0]['data']})==(200,[])
    _,guarded=http('GET','/app_state?select=data',manager)
    assert guarded[0]['data']==current[0]['data']
    # Race two real authenticated RPC calls on one revision: exactly one may commit.
    _,race_base=http('GET','/app_state?select=data,updated_at',manager)
    assert len(race_base)==1
    def rpc_race(index):
        payload={**race_base[0]['data'],'rpcWinner':index}
        return http('POST',rpc,manager,{'p_expected_updated_at':race_base[0]['updated_at'],'p_data':payload})
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        race_results=list(pool.map(rpc_race,[1,2]))
    assert all(code==200 for code,_ in race_results),race_results
    assert sorted(len(rows) for _,rows in race_results)==[0,1],race_results
    _,race_after=http('GET','/app_state?select=data',manager)
    assert race_after[0]['data']['rpcWinner'] in [1,2]
    assert race_after[0]['data']['bookings']==race_base[0]['data']['bookings']
    assert race_after[0]['data']['seq']==race_base[0]['data']['seq']
    sql((root/'docs/maintenance-server-guard-rollback.sql').read_text())
    restored_acl=subprocess.run(docker+['exec','-i',args.container,'psql','-X','-v','ON_ERROR_STOP=1','-qAt','-U','postgres'],input="select string_agg(privilege_type,',' order by privilege_type) from information_schema.role_table_grants where table_schema='public' and table_name='app_state' and grantee='authenticated';",text=True,capture_output=True,env=env,check=True).stdout.strip()
    assert restored_acl=='INSERT,SELECT,UPDATE', f'Rollback changed original browser privileges: {restored_acl!r}'
    assert_truncate_denied('rollback')
    assert http('DELETE','/app_state?id=eq.main',manager)[0]==403
    restored_write=http('PATCH','/app_state?id=eq.main',manager,{'data':guarded[0]['data']})
    assert restored_write[0]==200, f'Rollback failed to restore direct PATCH: {restored_write!r}'
    # Full logical backup/restore rehearsal of this synthetic database only.
    dump=subprocess.run(docker+['exec',args.container,'pg_dump','-U','postgres','-Fc','postgres'],capture_output=True,env=env,check=True).stdout
    assert dump.startswith(b'PGDMP')
    subprocess.run(docker+['exec',args.container,'createdb','-U','postgres','adwaa_restore_test'],capture_output=True,env=env,check=True)
    try:
        subprocess.run(docker+['exec','-i',args.container,'pg_restore','-U','postgres','--exit-on-error','--no-owner','-d','adwaa_restore_test'],input=dump,capture_output=True,env=env,check=True)
        def restored_query(database,query):
            return subprocess.run(docker+['exec','-i',args.container,'psql','-X','-qAt','-U','postgres','-d',database],input=query,text=True,capture_output=True,env=env,check=True).stdout.strip()
        for query in ['select row_to_json(state)::text from public.app_state state order by id;',acl_sql]:
            assert restored_query('postgres',query)==restored_query('adwaa_restore_test',query),'Logical backup differs after restore'
    finally:
        subprocess.run(docker+['exec',args.container,'dropdb','-U','postgres','adwaa_restore_test'],capture_output=True,env=env,check=True)
    print(json.dumps({'legacy_client_gate' :'server enforcement or complete client cutover still required','server_guard_proposal':'PASS: denies legacy direct writes, authorizes CAS RPC, rejects stale RPC, reversible without data change','result':'PASS','checks':['real PostgREST HTTP PATCH: one CAS winner','locally signed JWT policies','anon denied','other identity cannot read/write','delete denied','payments and sequence invariant','effective PUBLIC/anon/inherited grants rejected','RPC/PATCH compatibility window: one winner','manager identity and expiry enforced','TRUNCATE denied','logical pg_dump/pg_restore data and ACL match'],'production_access':False}))
finally:
    subprocess.run(docker+['rm','-f',rest],env=env,capture_output=True)
