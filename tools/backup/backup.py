"""Read-only PG17 export; authenticated encryption; private Drive or explicit S3. No scheduled trigger.
Only the isolated restore container ever executes SQL writes. Errors are redacted.
"""
import base64,hashlib,io,json,os,re,secrets,subprocess,sys,tempfile,time,uuid
from datetime import datetime,timezone
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import boto3,psycopg
from botocore.config import Config
from botocore.exceptions import ClientError
from cryptography.hazmat.primitives.ciphers import Cipher,algorithms,modes

from targets import PROJECT,REQUIRED_TABLES,identity_confirmed
PREFIX='adwaa/'+PROJECT+'/'
IMAGE='postgres:17-bookworm@sha256:858bb5e98eed02eb8cafbcdc007f9a65d1b613972028944a8ec2133ccaf80d27'
MAGIC=b'ADWABK01'
PARTS=('database','roles','verification')
FULL_PARTS=PARTS+('storage',)

def archive_parts(manifest):
    require(manifest.get('format') in (1,2),'unsupported archive format')
    parts=FULL_PARTS if manifest['format']==2 else PARTS
    require(set(manifest.get('files',{}))==set(parts),'archive parts incomplete or unexpected')
    return parts

def identity_query():
    return 'SELECT '+ ' AND '.join("to_regclass('public."+name+"') IS NOT NULL" for name in REQUIRED_TABLES)
class GateError(Exception):pass

def require(condition,message):
    if not condition:raise GateError(message)

def env(name):
    value=os.environ.get(name,'')
    require(bool(value),'missing configuration: '+name)
    return value

def key():
    value=base64.b64decode(env('BACKUP_ENCRYPTION_KEY'),validate=True)
    require(len(value)==32,'encryption key must encode exactly 32 random bytes')
    return value

class SealedWriter:
    def __init__(self,destination,secret,aad):
        nonce=secrets.token_bytes(12)
        self.cipher=Cipher(algorithms.AES(secret),modes.GCM(nonce)).encryptor()
        self.cipher.authenticate_additional_data(aad.encode())
        self.out=open(destination,'xb');os.chmod(destination,0o600);self.out.write(MAGIC+nonce)
    def __enter__(self):return self
    def write(self,value):self.out.write(self.cipher.update(value));return len(value)
    def __exit__(self,kind,*args):
        try:
            if kind is None:self.out.write(self.cipher.finalize());self.out.write(self.cipher.tag)
        finally:self.out.close()

def engine():
    from types import SimpleNamespace
    return SimpleNamespace(SealedWriter=SealedWriter,source_connection=source_connection,docker=docker)

def seal(source,destination,secret,aad):
    with SealedWriter(destination,secret,aad) as out:
        while chunk:=source.read(1024*1024):out.write(chunk)

def unseal(path,sink,secret,aad):
    with open(path,'rb') as source:
        require(source.read(8)==MAGIC,'invalid encrypted archive')
        nonce=source.read(12);source.seek(-16,2);tag=source.read(16);size=source.tell()-36
        require(size>=0,'truncated encrypted archive')
        cipher=Cipher(algorithms.AES(secret),modes.GCM(nonce,tag)).decryptor()
        cipher.authenticate_additional_data(aad.encode());source.seek(20)
        while size:
            chunk=source.read(min(size,1024*1024));require(bool(chunk),'truncated archive')
            sink.write(cipher.update(chunk));size-=len(chunk)
        sink.write(cipher.finalize()) # SQL is never executed until this authenticates.

def digest(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        while chunk:=f.read(1024*1024):h.update(chunk)
    return {'sha256':h.hexdigest(),'bytes':Path(path).stat().st_size}

def quote(value):return '"'+value.replace('"','""')+'"'
def relation(schema,name):return quote(schema)+'.'+quote(name)
def table_copy(schema,name):
    name=relation(schema,name)
    return f'COPY (SELECT row_to_json(t)::text FROM {name} t ORDER BY row_to_json(t)::text COLLATE "C") TO STDOUT'

def role_query():
    return "SELECT jsonb_agg(jsonb_build_object('name',rolname,'superuser',rolsuper,'inherit',rolinherit,'login',rolcanlogin,'bypassrls',rolbypassrls,'create_role',rolcreaterole,'create_db',rolcreatedb) ORDER BY rolname)::text FROM pg_roles WHERE rolname !~ '^pg_'"

def catalog_query():
    return "SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'acl',c.relacl::text,'options',c.reloptions) ORDER BY n.nspname,c.relname)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND c.relkind IN ('r','p','v','m','S')"

def policies_query():
    return "SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY schemaname,tablename,policyname)::text,'[]') FROM pg_policies p"

def membership_query():
    return "SELECT coalesce(jsonb_agg(jsonb_build_object('role',r.rolname,'member',m.rolname,'grantor',g.rolname,'admin',a.admin_option,'inherit',a.inherit_option,'set',a.set_option) ORDER BY r.rolname,m.rolname,g.rolname)::text,'[]') FROM pg_auth_members a JOIN pg_roles r ON r.oid=a.roleid JOIN pg_roles m ON m.oid=a.member JOIN pg_roles g ON g.oid=a.grantor WHERE r.rolname !~ '^pg_' OR m.rolname !~ '^pg_'"

def schema_query():
    return """SELECT jsonb_build_object(
      'schemas',(SELECT jsonb_agg(jsonb_build_object('name',nspname,'owner',pg_get_userbyid(nspowner),'acl',nspacl::text) ORDER BY nspname) FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname<>'information_schema'),
      'defaults',(SELECT jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(d.defaclrole),'schema',n.nspname,'type',defaclobjtype,'acl',defaclacl::text) ORDER BY n.nspname,defaclobjtype,pg_get_userbyid(d.defaclrole)) FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace),
      'extensions',(SELECT jsonb_agg(jsonb_build_object('name',extname,'version',extversion) ORDER BY extname) FROM pg_extension),
      'constraints',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'name',a.conname,'definition',pg_get_constraintdef(a.oid),'valid',a.convalidated) ORDER BY n.nspname,c.relname,a.conname) FROM pg_constraint a JOIN pg_class c ON c.oid=a.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_'),
      'routines',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'args',pg_get_function_identity_arguments(p.oid),'definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text) ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND p.prokind IN ('f','p','w')),
      'views',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'definition',pg_get_viewdef(c.oid,true)) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('v','m') AND n.nspname !~ '^pg_' AND n.nspname<>'information_schema'),
      'triggers',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid)) ORDER BY n.nspname,c.relname,t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname !~ '^pg_')
    )::text"""

CANONICAL="SET timezone='UTC';SET datestyle='ISO,YMD';SET extra_float_digits=3;"

def source_connection():
    require(os.environ.get('PGSSLMODE')=='verify-full','TLS verify-full is required')
    host=env('PGHOST');user=env('PGUSER');port=env('PGPORT')
    valid_direct=host=='db.'+PROJECT+'.supabase.co'
    valid_pool=bool(re.fullmatch(r'aws-[a-z0-9-]+\.pooler\.supabase\.com',host)) and user.endswith('.'+PROJECT)
    require((valid_direct or valid_pool) and port=='5432','wrong project, host, or transaction pooler')
    require(identity_confirmed(),'project identity confirmation required')
    env('PGPASSWORD');require(env('PGDATABASE')=='postgres','unexpected database');env('PGSSLROOTCERT')
    require(not any(os.environ.get(k) for k in ['PGSERVICE','PGSERVICEFILE','PGHOSTADDR']),'service overrides prohibited')
    connection=psycopg.connect(connect_timeout=20,options='-c default_transaction_read_only=on -c statement_timeout=1800000')
    connection.read_only=True;connection.isolation_level=psycopg.IsolationLevel.REPEATABLE_READ
    connection.execute(CANONICAL)
    size=connection.execute('SELECT pg_database_size(current_database())').fetchone()[0]
    require(size<=int(os.environ.get('BACKUP_MAX_DATABASE_BYTES','1073741824')),'database exceeds approved restore capacity budget')
    require(connection.execute('SHOW server_version_num').fetchone()[0].startswith('17'),'source must be PG17')
    require(connection.execute('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()').fetchone()==(True,),'TLS not active')
    require(connection.execute("SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user").fetchone()==(True,),'backup role cannot bypass RLS; no partial-row backup allowed')
    return connection

def pg_env():
    # Do not pass cloud/encryption credentials to export subprocesses.
    names=['PGHOST','PGPORT','PGUSER','PGDATABASE','PGPASSWORD','PGSSLMODE','PGSSLROOTCERT','PATH','HOME','SSL_CERT_FILE','DOCKER_CONFIG','HTTP_PROXY','HTTPS_PROXY','NO_PROXY']
    result={k:os.environ[k] for k in names if k in os.environ}
    result['PGOPTIONS']='-c default_transaction_read_only=on -c statement_timeout=1800000'
    result['PGCONNECT_TIMEOUT']='20'
    return result

def export(command,path,secret,aad):
    # Exact PG17 clients, no dependency on the runner's apt repositories.
    name='adwaa-backup-export-'+uuid.uuid4().hex[:12]
    command=['docker','--host=unix:///var/run/docker.sock','run','--rm','--name',name,'--mount','type=bind,src='+env('PGSSLROOTCERT')+',dst=/tmp/pg-ca.pem,readonly']+[item for name in ['PGHOST','PGPORT','PGUSER','PGDATABASE','PGPASSWORD','PGSSLMODE','PGOPTIONS','PGCONNECT_TIMEOUT'] for item in ['-e',name]]+['-e','PGSSLROOTCERT=/tmp/pg-ca.pem',IMAGE]+command
    process=subprocess.Popen(command,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,env=pg_env())
    try:
        seal(process.stdout,path,secret,aad)
        require(process.wait(timeout=1800)==0,'PostgreSQL export failed (details suppressed)')
    finally:
        process.stdout.close()
        if process.poll() is None:process.kill();process.wait()
        subprocess.run(['docker','--host=unix:///var/run/docker.sock','rm','-f',name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,env=pg_env(),timeout=30)

def check_storage(s3,bucket,owner):
    base={'Bucket':bucket,'ExpectedBucketOwner':owner}
    block=s3.get_public_access_block(**base)['PublicAccessBlockConfiguration']
    require(all(block.get(k) is True for k in ['BlockPublicAcls','IgnorePublicAcls','BlockPublicPolicy','RestrictPublicBuckets']),'S3 public access is not fully blocked')
    require(not s3.get_bucket_policy_status(**base)['PolicyStatus']['IsPublic'],'public bucket policy')
    require(s3.get_bucket_versioning(**base).get('Status')=='Enabled','S3 versioning must be enabled')
    rules=s3.get_bucket_lifecycle_configuration(**base)['Rules']
    require(any(r.get('Status')=='Enabled' and r.get('Filter',{}).get('Prefix')==PREFIX and r.get('Expiration',{}).get('Days')==30 and r.get('NoncurrentVersionExpiration',{}).get('NoncurrentDays')==1 for r in rules),'30-day current / 1-day noncurrent prefix lifecycle required')
    require(s3.get_bucket_encryption(**base)['ServerSideEncryptionConfiguration']['Rules'],'S3 server encryption missing')
    try:
        lock=s3.get_object_lock_configuration(**base).get('ObjectLockConfiguration',{})
        require(lock.get('ObjectLockEnabled')!='Enabled','Object Lock requires a separate retention/cost plan')
    except ClientError as error:
        require(error.response.get('Error',{}).get('Code')=='ObjectLockConfigurationNotFoundError','Object Lock status not verified')
    ownership=s3.get_bucket_ownership_controls(**base)['OwnershipControls']['Rules']
    require(any(r.get('ObjectOwnership')=='BucketOwnerEnforced' for r in ownership),'bucket owner enforcement required')

def storage():
    require(env('BACKUP_COST_APPROVED')=='true','storage and runner costs not approved')
    require(env('BACKUP_EXECUTION_APPROVED')=='true','manual execution not approved')
    provider=os.environ.get('BACKUP_STORAGE_PROVIDER','drive')
    if provider=='drive':
        from drive_store import DriveStore,authenticate
        drive=DriveStore(authenticate(),env('BACKUP_DRIVE_FOLDER_ID'),env('BACKUP_DRIVE_ACCOUNT'),env('BACKUP_DRIVE_ESTIMATED_DAILY_BYTES'))
        drive.preflight();return drive,drive.folder,drive.email
    require(provider=='s3','unsupported backup storage provider')
    s3=boto3.client('s3',config=Config(connect_timeout=15,read_timeout=120,retries={'mode':'standard','max_attempts':4}));bucket=env('BACKUP_BUCKET');owner=env('BACKUP_BUCKET_OWNER')
    require(bool(re.fullmatch(r'\d{12}',owner)),'invalid expected bucket owner')
    check_storage(s3,bucket,owner)
    return s3,bucket,owner

def snapshot(conn):
    require(conn.execute(identity_query()).fetchone()==(True,),'target identity tables missing')
    require(conn.execute("SELECT count(*) FROM pg_foreign_table").fetchone()==(0,),'foreign tables require separate coverage')
    require(conn.execute("SELECT count(*) FROM pg_tablespace WHERE spcname NOT IN ('pg_default','pg_global')").fetchone()==(0,),'custom tablespaces require a separate restore plan')
    tables=conn.execute("SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','m') AND n.nspname !~ '^pg_' AND n.nspname<>'information_schema' ORDER BY 1,2").fetchall()
    result={'tables':[],'schema':conn.execute(schema_query()).fetchone()[0],'catalog':conn.execute(catalog_query()).fetchone()[0],'policies':conn.execute(policies_query()).fetchone()[0],'roles':conn.execute(role_query()).fetchone()[0],'memberships':conn.execute(membership_query()).fetchone()[0],'sequences':[]}
    for schema,name in tables:
        h=hashlib.sha256()
        with conn.cursor().copy(table_copy(schema,name)) as copy:
            for chunk in copy:h.update(chunk)
        count=conn.execute('SELECT count(*) FROM '+relation(schema,name)).fetchone()[0]
        result['tables'].append({'schema':schema,'name':name,'rows':count,'sha256':h.hexdigest()})
    # Include identity sequences too (information_schema.sequences omits them).
    sequences=conn.execute("SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='S' AND n.nspname !~ '^pg_' ORDER BY 1,2").fetchall()
    for schema,name in sequences:
        value=conn.execute('SELECT last_value,is_called FROM '+relation(schema,name)).fetchone()
        result['sequences'].append({'schema':schema,'name':name,'value':list(value)})
    result['large_objects']=[]
    for (oid,) in conn.execute('SELECT oid FROM pg_largeobject_metadata ORDER BY oid').fetchall():
        h=hashlib.sha256();offset=0
        while True:
            chunk=conn.execute('SELECT lo_get(%s,%s,1048576)',(oid,offset)).fetchone()[0]
            if not chunk:break
            h.update(chunk);offset+=len(chunk)
        result['large_objects'].append({'oid':oid,'bytes':offset,'sha256':h.hexdigest()})
    return result

def backup(s3,bucket,owner,directory):
    secret=key();backup_id=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex
    started=datetime.now(timezone.utc).isoformat()
    with source_connection() as conn:
        snapshot_id=conn.execute('SELECT pg_export_snapshot()').fetchone()[0]
        verification=snapshot(conn)
        for part,command in [('database',['pg_dump','--format=custom','--snapshot='+snapshot_id,'--no-password','--lock-wait-timeout=30s']),('roles',['pg_dumpall','--roles-only','--no-role-passwords','--no-password'])]:
            export(command,Path(directory)/(part+'.enc'),secret,PROJECT+'/'+backup_id+'/'+part)
        from storage_source import capture
        storage_verification=capture(engine(),conn,Path(directory)/'storage.enc',secret,PROJECT+'/'+backup_id+'/storage')
        # Sequences are not MVCC: fail rather than certify a moving allocation.
        current=[]
        for seq in verification['sequences']:
            current.append(list(conn.execute('SELECT last_value,is_called FROM '+relation(seq['schema'],seq['name'])).fetchone()))
        require(current==[s['value'] for s in verification['sequences']],'sequences changed during export; retry in an approved quiet window')
        with source_connection() as current:
            require(current.execute(role_query()).fetchone()[0]==verification['roles'] and current.execute(membership_query()).fetchone()[0]==verification['memberships'],'roles changed during export')
    verification.update(project=PROJECT,backup_id=backup_id,storage_files_included=True,storage=storage_verification,capture_started=started,capture_finished=datetime.now(timezone.utc).isoformat())
    seal(io.BytesIO(json.dumps(verification).encode()),Path(directory)/'verification.enc',secret,PROJECT+'/'+backup_id+'/verification')
    manifest={'format':2,'project':PROJECT,'backup_id':backup_id,'files':{p:digest(Path(directory)/(p+'.enc')) for p in FULL_PARTS}}
    if hasattr(s3,'ensure_capacity'):s3.ensure_capacity(sum(x['bytes'] for x in manifest['files'].values())+16384)
    root=PREFIX+backup_id+'/'
    for part in FULL_PARTS:
        s3.upload_file(str(Path(directory)/(part+'.enc')),bucket,root+part+'.enc',ExtraArgs={'ExpectedBucketOwner':owner,'ContentType':'application/octet-stream'})
        head=s3.head_object(Bucket=bucket,Key=root+part+'.enc',ExpectedBucketOwner=owner)
        require(head['ContentLength']==manifest['files'][part]['bytes'],'uploaded length not confirmed')
    # Commit marker last. The next restore downloads, hashes and authenticates all parts.
    s3.put_object(Bucket=bucket,Key=root+'complete.json',Body=json.dumps(manifest).encode(),ExpectedBucketOwner=owner,ContentType='application/json')
    return manifest

def docker(command,**kwargs):
    return subprocess.run(['docker','--host=unix:///var/run/docker.sock']+command,check=True,capture_output=True,timeout=1800,**kwargs)

def isolated_restore(directory,manifest):
    require(manifest.get('project')==PROJECT and manifest.get('format') in (1,2),'wrong archive project/format')
    backup_id=manifest['backup_id'];require(bool(re.fullmatch(r'\d{8}T\d{6}Z-[a-f0-9]{32}',backup_id)),'invalid backup id')
    secret=key()
    for part in archive_parts(manifest):require(digest(Path(directory)/(part+'.enc'))==manifest['files'][part],'ciphertext SHA-256 or size mismatch')
    data=io.BytesIO();unseal(Path(directory)/'verification.enc',data,secret,PROJECT+'/'+backup_id+'/verification')
    verification=json.loads(data.getvalue());require(verification['project']==PROJECT and verification['backup_id']==backup_id,'verification identity mismatch')
    image=env('BACKUP_RESTORE_IMAGE');require(bool(re.fullmatch(r'[a-zA-Z0-9./:_-]+@sha256:[a-f0-9]{64}',image)),'restore image must be approved and digest pinned')
    name='adwaa-backup-restore-'+uuid.uuid4().hex[:12]
    docker(['run','--rm','-d','--network','none','--memory','4g','--cpus','2','--pids-limit','256','--tmpfs','/var/lib/postgresql/data:rw,noexec,nosuid,size=4g','--tmpfs','/tmp:rw,noexec,nosuid,size=4g','-e','POSTGRES_HOST_AUTH_METHOD=trust','--name',name,image])
    try:
        for _ in range(120):
            ready=subprocess.run(['docker','--host=unix:///var/run/docker.sock','exec',name,'pg_isready','-h','127.0.0.1','-U','postgres'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0
            if ready:break
            time.sleep(.5)
        require(ready,'restore server not ready')
        def sql(query):return docker(['exec','-i',name,'psql','-h','127.0.0.1','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],input=(CANONICAL+query).encode()).stdout.decode().strip()
        for part in (['roles','database','storage'] if manifest['format']==2 else ['roles','database']):
            target='/tmp/'+part
            process=subprocess.Popen(['docker','--host=unix:///var/run/docker.sock','exec','-i',name,'sh','-c','umask 077; cat > '+target],stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            try:unseal(Path(directory)/(part+'.enc'),process.stdin,secret,PROJECT+'/'+backup_id+'/'+part)
            finally:process.stdin.close();code=process.wait(timeout=60)
            require(code==0,'restore staging failed')
        # The only rewrite is the existing initdb bootstrap CREATE, never grants.
        docker(['exec',name,'sh','-c',"sed 's/^CREATE ROLE postgres;$/-- initdb already created postgres/' /tmp/roles > /tmp/roles-restore; psql -h 127.0.0.1 -X -v ON_ERROR_STOP=1 -U postgres -d postgres -f /tmp/roles-restore"])
        docker(['exec',name,'pg_restore','-h','127.0.0.1','-U','postgres','--exit-on-error','-d','postgres','/tmp/database'])
        for field,query in [('schema',schema_query()),('catalog',catalog_query()),('policies',policies_query()),('roles',role_query()),('memberships',membership_query())]:require(sql(query)==verification[field],'restored '+field+' mismatch')
        for table in verification['tables']:
            query=table_copy(table['schema'],table['name'])
            # Stream plaintext only inside the isolated target; no data in logs.
            process=subprocess.Popen(['docker','--host=unix:///var/run/docker.sock','exec',name,'psql','-h','127.0.0.1','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-c',CANONICAL+query],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
            h=hashlib.sha256()
            while chunk:=process.stdout.read(1024*1024):h.update(chunk)
            require(process.wait(timeout=1800)==0 and h.hexdigest()==table['sha256'],'restored table fingerprint mismatch')
            require(int(sql('SELECT count(*) FROM '+relation(table['schema'],table['name'])))==table['rows'],'restored row count mismatch')
        for seq in verification['sequences']:
            value=sql('SELECT last_value,is_called FROM '+relation(seq['schema'],seq['name'])).split('|')
            require([int(value[0]),value[1]=='t']==seq['value'],'restored sequence mismatch')
        for obj in verification['large_objects']:
            h=hashlib.sha256();offset=0
            while True:
                chunk=bytes.fromhex(sql(f"SELECT encode(lo_get({int(obj['oid'])},{offset},1048576),'hex')"))
                if not chunk:break
                h.update(chunk);offset+=len(chunk)
            require(offset==obj['bytes'] and h.hexdigest()==obj['sha256'],'large object mismatch')
        storage_result={'storage_files_verified':False,'storage_service_restore_verified':False}
        if manifest['format']==2:
            from storage_source import restore
            require(verification.get('storage_files_included') is True,'Storage verification absent')
            storage_result=restore(engine(),name,verification['storage'])
        return {'restore_verified':True,'backup_id':backup_id,'project':PROJECT,'tables_verified':len(verification['tables']),**storage_result}
    finally:docker(['rm','-f',name])

def fetch_committed(s3,bucket,owner,manifest,directory):
    backup_id=manifest.get('backup_id','')
    require(bool(re.fullmatch(r'\d{8}T\d{6}Z-[a-f0-9]{32}',backup_id)),'invalid remote backup id')
    require(manifest.get('project')==PROJECT and manifest.get('format') in (1,2),'invalid remote manifest')
    root=PREFIX+backup_id+'/'
    response=s3.get_object(Bucket=bucket,Key=root+'complete.json',ExpectedBucketOwner=owner)
    require(json.loads(response['Body'].read(65537))==manifest,'remote commit marker differs')
    for part in archive_parts(manifest):
        head=s3.head_object(Bucket=bucket,Key=root+part+'.enc',ExpectedBucketOwner=owner)
        require(head['ContentLength']==manifest['files'][part]['bytes'] and head['ContentLength']<=2147483648,'remote encrypted size exceeds budget or manifest')
        s3.download_file(bucket,root+part+'.enc',str(Path(directory)/(part+'.enc')),ExtraArgs={'ExpectedBucketOwner':owner})
    return manifest

def committed_manifest(s3,bucket,owner):
    candidates=[]
    for page in s3.get_paginator('list_objects_v2').paginate(Bucket=bucket,Prefix=PREFIX,ExpectedBucketOwner=owner):
        candidates.extend(x for x in page.get('Contents',[]) if x['Key'].endswith('/complete.json'))
    require(bool(candidates),'no completed backup found')
    newest=max(candidates,key=lambda x:x['LastModified'])
    age=(datetime.now(timezone.utc)-newest['LastModified']).total_seconds()
    require(0<=age<172800,'latest backup timestamp is future or older than 48 hours')
    response=s3.get_object(Bucket=bucket,Key=newest['Key'],ExpectedBucketOwner=owner)
    manifest=json.loads(response['Body'].read(65537))
    backup_id=manifest.get('backup_id','')
    require(bool(re.fullmatch(r'\d{8}T\d{6}Z-[a-f0-9]{32}',backup_id)),'invalid remote backup id')
    require(manifest.get('project')==PROJECT and manifest.get('format') in (1,2),'invalid remote manifest')
    require(newest['Key']==PREFIX+backup_id+'/complete.json','manifest location mismatch')
    logical=datetime.strptime(backup_id[:16],'%Y%m%dT%H%M%SZ').replace(tzinfo=timezone.utc)
    require(0<=(datetime.now(timezone.utc)-logical).total_seconds()<172800,'backup identity timestamp is future or stale')
    return manifest

def health(s3,bucket,owner):
    # Metadata-only liveness check; never decrypts or writes storage or PostgreSQL.
    manifest=committed_manifest(s3,bucket,owner)
    response=s3.get_object(Bucket=bucket,Key=PREFIX+manifest['backup_id']+'/restore-ok.json',ExpectedBucketOwner=owner)
    evidence=json.loads(response['Body'].read(65537))
    require(evidence.get('project')==PROJECT and evidence.get('backup_id')==manifest['backup_id'] and evidence.get('restore_verified') is True,'latest backup has no matching successful restore evidence')
    require(type(evidence.get('tables_verified')) is int and evidence['tables_verified']>0,'restore evidence has no verified tables')
    for part in archive_parts(manifest):
        require(s3.head_object(Bucket=bucket,Key=PREFIX+manifest['backup_id']+'/'+part+'.enc',ExpectedBucketOwner=owner)['ContentLength']==manifest['files'][part]['bytes'],'backup part missing or size differs')
    require(manifest['format']==2 and evidence.get('storage_files_verified') is True,'latest backup is not database plus Storage verified')
    return {'recent_restored_backup':True,'maximum_age_hours':48,'storage_files_verified':True,'storage_service_restore_verified':False}

def latest(s3,bucket,owner,directory):
    return fetch_committed(s3,bucket,owner,committed_manifest(s3,bucket,owner),directory)

def main():
    os.umask(0o077)
    require(len(sys.argv)==2 and sys.argv[1] in ['preflight','backup','restore','init-drive','retention-plan','health'],'invalid mode')
    require(os.environ.get('GITHUB_REF','').startswith('refs/heads/'),'branch ref required')
    mode=sys.argv[1]
    require(os.environ.get('BACKUP_DRIVE_RETENTION_APPROVED')!='true','retention is disabled for comprehensive backups')
    if os.environ.get('GITHUB_EVENT_NAME')=='schedule':
        require(os.environ.get('BACKUP_SCHEDULE_APPROVED')=='true' and os.environ.get('BACKUP_PRODUCTION_RESTORE_VERIFIED')=='true','scheduled execution awaits production restore and owner approval')
        if os.environ.get('BACKUP_STORAGE_PROVIDER','drive')=='drive':require(os.environ.get('BACKUP_DRIVE_RETENTION_APPROVED')=='true','Drive retention activation not approved')
    if mode=='init-drive':
        require(env('BACKUP_COST_APPROVED')=='true' and env('BACKUP_DRIVE_SETUP_APPROVED')=='true','Drive setup not approved')
        from drive_store import authenticate,initialize_folder
        print('New dedicated PostgreSQL folder ID: '+initialize_folder(authenticate(),env('BACKUP_DRIVE_ACCOUNT')));return
    s3,bucket,owner=storage()
    if mode=='health':
        print(json.dumps(health(s3,bucket,owner)));return
    if mode=='retention-plan':
        require(hasattr(s3,'retention_plan'),'retention plan requires Drive')
        print(json.dumps(s3.retention_plan()));return
    if mode=='preflight':
        with source_connection() as conn:require(conn.execute(identity_query()).fetchone()==(True,),'target identity tables missing')
        from storage_source import Source,inventory
        source=Source()
        try:
            with source_connection() as conn:source.check_buckets(inventory(conn)['buckets'])
        finally:source.close()
        key();print('Read-only target identity, TLS, Storage inventory and private destination verified; no backup created.');return
    require(env('BACKUP_RESTORE_APPROVED')=='true','restore target/capacity not approved')
    # Only encrypted artifacts in runner temp, never repository or Actions artifacts.
    temp_root=Path(env('RUNNER_TEMP')).resolve()
    require(not temp_root.is_relative_to(Path(__file__).resolve().parents[2]),'temporary storage must be outside the repository')
    with tempfile.TemporaryDirectory(prefix='adwaa-encrypted-',dir=temp_root) as directory:
        manifest=backup(s3,bucket,owner,directory) if mode=='backup' else latest(s3,bucket,owner,directory)
        if mode=='backup':
            for part in archive_parts(manifest):(Path(directory)/(part+'.enc')).unlink()
            fetch_committed(s3,bucket,owner,manifest,directory)
        result=isolated_restore(directory,manifest)
        s3.put_object(Bucket=bucket,Key=PREFIX+manifest['backup_id']+'/restore-ok.json',Body=json.dumps(result).encode(),ExpectedBucketOwner=owner,ContentType='application/json')
        if result.get('storage_files_verified'):
            print('Database and Storage byte restore verified in isolation; Supabase service reattachment remains unverified.')
        else:
            print('Legacy database-only restore verified; Storage was not included. No comprehensive success is certified.')
if __name__=='__main__':
    try:main()
    except GateError as error:
        print('Backup safety gate: '+str(error),file=sys.stderr);sys.exit(1)
    except Exception as error:
        if os.environ.get('BACKUP_STORAGE_PROVIDER','drive')=='drive':
            from drive_store import DriveError,safe_diagnostic
            if isinstance(error,DriveError):
                print('Drive diagnostic code: '+safe_diagnostic(error),file=sys.stderr);sys.exit(1)
        print('Backup operation failed. No secrets or database diagnostics are logged. Check approved connectivity, scope, capacity, credentials and provider status.',file=sys.stderr)
        sys.exit(1)
