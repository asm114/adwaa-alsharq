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

def token(email):
    encode=lambda x:base64.urlsafe_b64encode(x).rstrip(b'=')
    payload={'sub':'00000000-0000-4000-8000-000000000001','role':'authenticated','email':email,'exp':int(time.time())+300}
    signing=encode(b'{"alg":"HS256","typ":"JWT"}')+b'.'+encode(json.dumps(payload).encode())
    return (signing+b'.'+encode(hmac.new(secret.encode(),signing,hashlib.sha256).digest())).decode()


def http(method,path,email=None,payload=None):
    body=b'' if payload is None else json.dumps(payload).encode()
    headers=[method+' '+path+' HTTP/1.0','Host: localhost','Connection: close','Accept: application/json','Prefer: return=representation','Content-Type: application/json','Content-Length: '+str(len(body))]
    if email:headers.append('Authorization: Bearer '+token(email))
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
    sql((root/'docs/maintenance-server-guard-proposal.sql').read_text())
    # Verify the effective grants, not just HTTP PATCH behavior.
    acl=subprocess.run(docker+['exec','-i',args.container,'psql','-X','-v','ON_ERROR_STOP=1','-qAt','-U','postgres'],input="select string_agg(privilege_type,',' order by privilege_type) from information_schema.role_table_grants where table_schema='public' and table_name='app_state' and grantee='authenticated';",text=True,capture_output=True,env=env,check=True).stdout.strip()
    assert acl=='SELECT', f'Unexpected browser role privileges after guard: {acl!r}'
    assert http('DELETE','/app_state?id=eq.main',manager)[0]==403
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
    _,current=http('GET','/app_state?select=data,updated_at',manager)
    _,written=http('POST',rpc,manager,{'p_expected_updated_at':current[0]['updated_at'],'p_data':current[0]['data']})
    assert len(written)==1
    assert http('POST',rpc,manager,{'p_expected_updated_at':current[0]['updated_at'],'p_data':current[0]['data']})==(200,[])
    _,guarded=http('GET','/app_state?select=data',manager)
    assert guarded[0]['data']==current[0]['data']
    sql((root/'docs/maintenance-server-guard-rollback.sql').read_text())
    restored_acl=subprocess.run(docker+['exec','-i',args.container,'psql','-X','-v','ON_ERROR_STOP=1','-qAt','-U','postgres'],input="select string_agg(privilege_type,',' order by privilege_type) from information_schema.role_table_grants where table_schema='public' and table_name='app_state' and grantee='authenticated';",text=True,capture_output=True,env=env,check=True).stdout.strip()
    assert restored_acl=='INSERT,SELECT,UPDATE', f'Rollback changed original browser privileges: {restored_acl!r}'
    assert http('DELETE','/app_state?id=eq.main',manager)[0]==403
    restored_write=http('PATCH','/app_state?id=eq.main',manager,{'data':guarded[0]['data']})
    assert restored_write[0]==200, f'Rollback failed to restore direct PATCH: {restored_write!r}'
    print(json.dumps({'legacy_client_gate':'server enforcement or complete client cutover still required','server_guard_proposal':'PASS: denies legacy direct writes, authorizes CAS RPC, rejects stale RPC, reversible without data change','result':'PASS','checks':['real PostgREST HTTP PATCH: one CAS winner','locally signed JWT policies','anon denied','other identity cannot read/write','delete denied','payments and sequence invariant'],'production_access':False}))
finally:
    subprocess.run(docker+['rm','-f',rest],env=env,capture_output=True)
