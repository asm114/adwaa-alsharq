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
PROGRESS=None

def progress(stage):
    if PROGRESS is not None:PROGRESS(stage)

def archive_parts(manifest):
    require(manifest.get('format') in (1,2),'unsupported archive format')
    parts=FULL_PARTS if manifest['format']==2 else PARTS
    require(set(manifest.get('files',{}))==set(parts),'archive parts incomplete or unexpected')
    return parts

def identity_query():
    return 'SELECT '+ ' AND '.join("to_regclass('public."+name+"') IS NOT NULL" for name in REQUIRED_TABLES)
from source_diagnostics import GateError, SourceError, need as source_need, validate_config, probe_tcp, verify_client_tls, classify as source_code

class RestoreError(GateError):
    def __init__(self,code):
        self.code=code if code in {'RESTORE_GRANT_CHAIN_UNRESOLVED','RESTORE_METADATA_PERMISSION_DENIED','RESTORE_METADATA_REPLAY_FAILED','RESTORE_ACL_PARSE_FAILED','RESTORE_EXTENSION_METADATA_FAILED','RESTORE_ROLES_FAILED','RESTORE_DATABASE_FAILED','RESTORE_SUPERUSER_VERIFIER_UNAVAILABLE','RESTORE_STAGING_PROCESS_FAILED','RESTORE_STAGING_TIMEOUT','RESTORE_STAGING_TRANSPORT_FAILED','RESTORE_SCHEMA_MISMATCH','RESTORE_CATALOG_MISMATCH','RESTORE_POLICIES_MISMATCH','RESTORE_ROLES_MISMATCH','RESTORE_MEMBERSHIPS_MISMATCH','RESTORE_INSPECTION_ROLE_INVALID','RESTORE_METADATA_QUERY_FAILED'} else 'RESTORE_FAILED'
        super().__init__(self.code)

def require(condition,message):
    if not condition:raise GateError(message)

def env(name):
    value=os.environ.get(name,'')
    require(bool(value),'missing configuration: '+name)
    return value

class EncryptionKeyError(GateError):
    def __init__(self,code):
        self.code=code
        super().__init__(code)

def key():
    raw=os.environ.get('BACKUP_ENCRYPTION_KEY','')
    if not raw:raise EncryptionKeyError('ENCRYPTION_KEY_MISSING')
    try:value=base64.b64decode(raw,validate=True)
    except (ValueError,TypeError):raise EncryptionKeyError('ENCRYPTION_KEY_INVALID_BASE64') from None
    if len(value)!=32:raise EncryptionKeyError('ENCRYPTION_KEY_INVALID_LENGTH')
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
    return SimpleNamespace(SealedWriter=SealedWriter,source_connection=source_connection,docker=docker,stage_file=stage_file)

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
      'defaults',(SELECT jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(d.defaclrole),'schema',n.nspname,'type',defaclobjtype,'acl',defaclacl::text) ORDER BY n.nspname,defaclobjtype,pg_get_userbyid(d.defaclrole)) FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace WHERE n.nspname IS NULL OR n.nspname<>'information_schema'),
      'extensions',(SELECT jsonb_agg(jsonb_build_object('name',extname,'version',extversion) ORDER BY extname) FROM pg_extension),
      'constraints',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'name',a.conname,'definition',pg_get_constraintdef(a.oid),'valid',a.convalidated) ORDER BY n.nspname,c.relname,a.conname) FROM pg_constraint a JOIN pg_class c ON c.oid=a.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'),
      'routines',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'args',pg_get_function_identity_arguments(p.oid),'definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text) ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND p.prokind IN ('f','p','w')),
      'views',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'definition',pg_get_viewdef(c.oid,true)) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('v','m') AND n.nspname !~ '^pg_' AND n.nspname<>'information_schema'),
      'triggers',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid)) ORDER BY n.nspname,c.relname,t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname !~ '^pg_' AND n.nspname<>'information_schema')
    )::text"""

def application_schema_metadata(value):
    data=json.loads(value) if isinstance(value,str) else value
    data=dict(data)
    # Older verifications inadvertently included standard information_schema
    # objects that pg_dump does not export. Keep EVERY application entry,
    # including application views referring to information_schema in their SQL.
    for field in ('defaults','constraints','views','triggers'):
        if isinstance(data.get(field),list):
            data[field]=[row for row in data[field] if row.get('schema')!='information_schema']
    return data

# Diagnostics are deliberately one-way: never return object names, SQL text,
# ACL values, owner names, or arbitrary JSON keys from an archive.
_SCHEMA_KEYS={
    'schemas':('name',), 'defaults':('schema','owner','type'),
    'extensions':('name',), 'constraints':('schema','table','name'),
    'routines':('schema','name','args'), 'views':('schema','name'),
    'triggers':('schema','table','name'),
}
_SCHEMA_ATTRIBUTES=frozenset(('name','schema','table','owner','acl','type','version',
    'definition','valid','args','enabled'))

def schema_differences(expected,actual,keys=None,attributes=None):
    """Bounded structural differences; does NOT change comparison acceptance."""
    result={}
    def encoded(value):return json.dumps(value,sort_keys=True,separators=(',',':'))
    keys=_SCHEMA_KEYS if keys is None else keys
    attributes=_SCHEMA_ATTRIBUTES if attributes is None else attributes
    for section,identity in keys.items():
        left=expected.get(section);right=actual.get(section)
        if left==right:continue
        if not isinstance(left,list) or not isinstance(right,list):
            result[section]={'source_type':type(left).__name__,'restored_type':type(right).__name__}
            continue
        from collections import Counter
        a=Counter(encoded(row) for row in left);b=Counter(encoded(row) for row in right)
        summary={'source_objects':len(left),'restored_objects':len(right),
                 'identical_objects':sum((a&b).values()),'list_order_only':a==b}
        def index(rows):
            indexed={}
            for ordinal,row in enumerate(rows):
                key=encoded([row.get(k) for k in identity])
                indexed.setdefault(key,[]).append((ordinal,row))
            return indexed
        x=index(left);y=index(right)
        summary.update(source_only_identities=len(x.keys()-y.keys()),
                       restored_only_identities=len(y.keys()-x.keys()),
                       duplicate_source_identities=sum(len(v)-1 for v in x.values()),
                       duplicate_restored_identities=sum(len(v)-1 for v in y.values()))
        changed=Counter();samples=[]
        for key in sorted(x.keys()&y.keys()):
            if len(x[key])!=1 or len(y[key])!=1:continue
            ordinal,before=x[key][0];after=y[key][0][1]
            fields=sorted(k for k in attributes if (k in before)!=(k in after) or before.get(k)!=after.get(k))
            if any(before.get(k)!=after.get(k) for k in (before.keys()|after.keys())-attributes):fields.append('unrecognized_attribute')
            if fields:
                changed.update(fields)
                if len(samples)<20:samples.append({'source_ordinal':ordinal,'changed_attributes':fields})
        summary['changed_attributes']=dict(sorted(changed.items()))
        summary['changed_object_samples']=samples
        result[section]=summary
    return result

_METADATA_KEYS={'catalog':('schema','name'),
    'policies':('schemaname','tablename','policyname'),
    'roles':('name',),'memberships':('role','member','grantor')}
_METADATA_ATTRIBUTES=_SCHEMA_ATTRIBUTES|frozenset(('rls','force_rls','options',
    'schemaname','tablename','policyname','permissive','roles','cmd','qual','with_check',
    'superuser','inherit','login','bypassrls','create_role','create_db',
    'role','member','grantor','admin','set'))

def metadata_differences(field,expected,actual):
    if field=='schema':return schema_differences(expected,actual)
    left=json.loads(expected) if isinstance(expected,str) else expected
    right=json.loads(actual) if isinstance(actual,str) else actual
    return schema_differences({field:left},{field:right},
        {field:_METADATA_KEYS[field]},_METADATA_ATTRIBUTES)

CANONICAL="SET timezone='UTC';SET datestyle='ISO,YMD';SET extra_float_digits=3;"

def source_connection():
    host=validate_config(PROJECT,identity_confirmed)
    probe_tcp(host)
    connection=None
    try:
        connection=psycopg.connect(host=host,port=5432,user=env('PGUSER'),password=env('PGPASSWORD'),dbname='postgres',sslmode='verify-full',sslrootcert=env('PGSSLROOTCERT'),connect_timeout=20,options='-c default_transaction_read_only=on -c statement_timeout=1800000')
        verify_client_tls(connection,host,env('PGSSLROOTCERT'))
        connection.read_only=True;connection.isolation_level=psycopg.IsolationLevel.REPEATABLE_READ
        connection.execute(CANONICAL)
        size=connection.execute('SELECT pg_database_size(current_database())').fetchone()[0]
        source_need(size<=int(os.environ.get('BACKUP_MAX_DATABASE_BYTES','1073741824')),'PG_DATABASE_TOO_LARGE')
        source_need(connection.execute('SHOW server_version_num').fetchone()[0].startswith('17'),'PG_VERSION_UNSUPPORTED')
        source_need(connection.execute("SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user").fetchone()==(True,),'PG_RLS_BYPASS_REQUIRED')
        return connection
    except Exception as error:
        if connection is not None:
            try:connection.close()
            except Exception:pass
        raise SourceError(source_code(error)) from None

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
    progress('source_snapshot')
    secret=key();backup_id=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex
    started=datetime.now(timezone.utc).isoformat()
    with source_connection() as conn:
        snapshot_id=conn.execute('SELECT pg_export_snapshot()').fetchone()[0]
        verification=snapshot(conn)
        for part,command in [('database',['pg_dump','--format=custom','--snapshot='+snapshot_id,'--no-password','--lock-wait-timeout=30s']),('roles',['pg_dumpall','--roles-only','--no-role-passwords','--no-password'])]:
            progress('export_'+part)
            export(command,Path(directory)/(part+'.enc'),secret,PROJECT+'/'+backup_id+'/'+part)
        from storage_source import capture
        progress('storage_capture')
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
        progress('drive_upload_'+part)
        s3.upload_file(str(Path(directory)/(part+'.enc')),bucket,root+part+'.enc',ExtraArgs={'ExpectedBucketOwner':owner,'ContentType':'application/octet-stream'})
        head=s3.head_object(Bucket=bucket,Key=root+part+'.enc',ExpectedBucketOwner=owner)
        require(head['ContentLength']==manifest['files'][part]['bytes'],'uploaded length not confirmed')
    # Commit marker last. The next restore downloads, hashes and authenticates all parts.
    progress('drive_commit_marker')
    s3.put_object(Bucket=bucket,Key=root+'complete.json',Body=json.dumps(manifest).encode(),ExpectedBucketOwner=owner,ContentType='application/json')
    return manifest

def docker(command,**kwargs):
    return subprocess.run(['docker','--host=unix:///var/run/docker.sock']+command,check=True,capture_output=True,timeout=1800,**kwargs)

def stage_file(container,target,size,producer):
    # Decrypt/validate into an anonymous RAM file, not a host disk or an exec
    # stdin pipe. A finite read-only FD provides reliable EOF to Docker's client.
    require(bool(re.fullmatch(r'adwaa-backup-restore-[a-f0-9]{12}',container)),'isolated target required')
    require(bool(re.fullmatch(r'/tmp/(?:roles|database|storage|extension-metadata|restored-storage/object-[0-9]{8})',target)),'invalid isolated staging path')
    require(type(size) is int and 0<=size<=2147483648,'invalid isolated staging size')
    require(hasattr(os,'memfd_create'),'anonymous RAM staging unsupported')
    import fcntl
    fd=os.memfd_create('adwaa-isolated-stage',os.MFD_CLOEXEC|os.MFD_ALLOW_SEALING)
    with os.fdopen(fd,'w+b') as stream:
        class SizedWriter:
            count=0
            def write(self,data):
                require(self.count+len(data)<=size,'isolated staging overflow')
                stream.write(data);self.count+=len(data)
                return len(data)
        writer=SizedWriter();producer(writer)
        require(writer.count==size,'isolated staging truncated')
        stream.flush();stream.seek(0)
        # Linux UAPI constants are absent from some Python fcntl builds.
        fcntl.fcntl(fd,getattr(fcntl,'F_ADD_SEALS',1033),0x0f)
        import docker as docker_sdk
        api=docker_sdk.APIClient(base_url='unix:///var/run/docker.sock',version='1.47',timeout=120)
        channel=None
        try:
            command=['sh','-c','umask 077; head -c '+str(size)+' > '+target]
            exec_id=api.exec_create(container,command,stdin=True,stdout=False,stderr=False)['Id']
            channel=api.exec_start(exec_id,socket=True)
            channel._sock.settimeout(120)
            while chunk:=stream.read(1024*1024):channel._sock.sendall(chunk)
            deadline=time.monotonic()+120
            while time.monotonic()<deadline:
                state=api.exec_inspect(exec_id)
                if not state['Running'] and type(state.get('ExitCode')) is int:
                    if state['ExitCode']!=0:raise RestoreError('RESTORE_STAGING_PROCESS_FAILED')
                    break
                time.sleep(.1)
            else:raise RestoreError('RESTORE_STAGING_TIMEOUT')
        except GateError:raise
        except Exception:raise RestoreError('RESTORE_STAGING_TRANSPORT_FAILED') from None
        finally:
            if channel is not None:channel.close()
            api.close()

def isolated_restore(directory,manifest):
    require(manifest.get('project')==PROJECT and manifest.get('format') in (1,2),'wrong archive project/format')
    backup_id=manifest['backup_id'];require(bool(re.fullmatch(r'\d{8}T\d{6}Z-[a-f0-9]{32}',backup_id)),'invalid backup id')
    secret=key()
    for part in archive_parts(manifest):require(digest(Path(directory)/(part+'.enc'))==manifest['files'][part],'ciphertext SHA-256 or size mismatch')
    data=io.BytesIO();unseal(Path(directory)/'verification.enc',data,secret,PROJECT+'/'+backup_id+'/verification')
    verification=json.loads(data.getvalue());require(verification['project']==PROJECT and verification['backup_id']==backup_id,'verification identity mismatch')
    image=env('BACKUP_RESTORE_IMAGE');require(bool(re.fullmatch(r'(?:[a-zA-Z0-9./:_-]+@)?sha256:[a-f0-9]{64}',image)),'restore image must be approved and digest pinned')
    roles=json.loads(verification['roles'])
    eligible={r['name'] for r in roles if r['superuser'] and r['login']}
    reader_user=next((n for n in ['postgres','supabase_admin'] if n in eligible),None)
    if reader_user is None:raise RestoreError('RESTORE_SUPERUSER_VERIFIER_UNAVAILABLE')
    name='adwaa-backup-restore-'+uuid.uuid4().hex[:12]
    docker(['run','--rm','-d','--network','none','--memory','4g','--cpus','2','--pids-limit','256','--tmpfs','/var/lib/postgresql/data:rw,noexec,nosuid,size=4g','--tmpfs','/tmp:rw,noexec,nosuid,size=4g','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_USER='+reader_user,'-e','POSTGRES_DB=postgres','--name',name,image])
    try:
        for _ in range(120):
            ready=subprocess.run(['docker','--host=unix:///var/run/docker.sock','exec',name,'pg_isready','-h','127.0.0.1','-U',reader_user],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0
            if ready:break
            time.sleep(.5)
        require(ready,'restore server not ready')
        sql_prefix=CANONICAL
        def sql(query):return docker(['exec',name,'psql','-h','127.0.0.1','-X','-qAt','-v','ON_ERROR_STOP=1','-U',reader_user,'-d','postgres','-c',sql_prefix+query]).stdout.decode().strip()
        for part in (['roles','database','storage'] if manifest['format']==2 else ['roles','database']):
            target='/tmp/'+part
            # GCM framing is 8-byte magic + 12-byte nonce + 16-byte tag.
            plain_size=int(manifest['files'][part]['bytes'])-36
            stage_file(name,target,plain_size,lambda sink:unseal(Path(directory)/(part+'.enc'),sink,secret,PROJECT+'/'+backup_id+'/'+part))
        # Supabase's postgres may be NOSUPERUSER. Bootstrap as a source superuser
        # instead of trying to remove SUPERUSER from PostgreSQL's protected OID 10.
        roles_script="set -e; sed 's/^CREATE ROLE "+reader_user+";$/-- initdb already created bootstrap role/' /tmp/roles > /tmp/roles-restore; psql -h 127.0.0.1 -X -v ON_ERROR_STOP=1 -U "+reader_user+" -d postgres -f /tmp/roles-restore"
        try:docker(['exec',name,'sh','-c',roles_script])
        except subprocess.CalledProcessError:raise RestoreError('RESTORE_ROLES_FAILED') from None
        try:docker(['exec',name,'pg_restore','-h','127.0.0.1','-U',reader_user,'--exit-on-error','-d','postgres','/tmp/database'])
        except subprocess.CalledProcessError:raise RestoreError('RESTORE_DATABASE_FAILED') from None
        from restore_metadata import restore_extension_metadata,normalized_metadata,MetadataRestoreError
        try:extension_metadata=restore_extension_metadata(__import__('types').SimpleNamespace(application_schema_metadata=application_schema_metadata,quote=quote,stage_file=stage_file,docker=docker),name,verification,sql,reader_user)
        except MetadataRestoreError as error:
            failure=RestoreError(error.code);failure.replayed_metadata={'planned_schema_acl_diagnostics':error.diagnostics}
            raise failure from None
        except Exception:raise RestoreError('RESTORE_EXTENSION_METADATA_FAILED') from None
        bootstrap_user=reader_user
        declared=os.environ.get('BACKUP_INSPECTION_ROLE') or os.environ.get('PGUSER','')
        if declared:
            declared=declared.removesuffix('.'+PROJECT)
            eligible_readers={r['name'] for r in roles if r['login'] and (r['superuser'] or r['bypassrls'])}
            if declared not in eligible_readers:raise RestoreError('RESTORE_INSPECTION_ROLE_INVALID')
            reader_user=declared
        metadata_queries=[('schema',schema_query()),('catalog',catalog_query()),('policies',policies_query()),('roles',role_query()),('memberships',membership_query())]
        # Deparser qualification depends on session search_path. All metadata
        # must match in ONE consistent context; no ACL/data differences waived.
        contexts=[('ROLE_DEFAULT',''),('SUPABASE_PATH','SET search_path TO "$user", public, extensions;'),('PUBLIC_EXTENSIONS','SET search_path TO public, extensions;'),('CATALOG_ONLY','SET search_path TO pg_catalog;')]
        last_error=None
        comparison_diagnostics=[];metadata_diagnostics=[];best_failure=None
        for render_context,setting in contexts:
            sql_prefix=CANONICAL+setting
            failures=[];context_differences={}
            for field,query in metadata_queries:
                progress('restore_verify_'+field)
                try:actual=sql(query)
                except subprocess.CalledProcessError:raise RestoreError('RESTORE_METADATA_QUERY_FAILED') from None
                expected=verification[field]
                if field=='schema':actual=application_schema_metadata(actual);expected=application_schema_metadata(expected)
                if field in ('schema','catalog'):
                    try:
                        actual=normalized_metadata(actual,field,sql)
                        expected=normalized_metadata(expected,field,sql)
                    except Exception:raise RestoreError('RESTORE_ACL_PARSE_FAILED') from None
                if actual!=expected:
                    failure=RestoreError('RESTORE_'+field.upper()+'_MISMATCH')
                    differences=metadata_differences(field,expected,actual)
                    context_differences.update(differences)
                    if field=='schema':
                        failure.fields=[k for k in _SCHEMA_KEYS if actual.get(k)!=expected.get(k)]
                        comparison_diagnostics.append({'render_context':render_context,'sections':differences})
                    failures.append(failure)
            metadata_diagnostics.append({'render_context':render_context,'differences':context_differences})
            if not failures:
                last_error=None;break
            # Prefer the context with the fewest failing metadata categories.
            # Never mask a later genuine mismatch with a deparser mismatch from
            # CATALOG_ONLY, and never combine passing fields across contexts.
            if best_failure is None or len(failures)<best_failure[0]:
                best_failure=(len(failures),failures[0])
            last_error=best_failure[1]
        if last_error is not None:
            last_error.diagnostics=comparison_diagnostics
            last_error.metadata_diagnostics=metadata_diagnostics
            last_error.replayed_metadata=extension_metadata
            # pg_restore header is inspected in memory only; never emit the
            # table-of-contents body (it can contain sensitive identifiers).
            header=docker(['exec',name,'pg_restore','--list','/tmp/database']).stdout.decode()
            versions={}
            for version_key,label in [('source','Dumped from database version'),('dump_client','Dumped by pg_dump version')]:
                match=re.search(re.escape(label)+r': (17\.[0-9]+)',header)
                versions[version_key]=match.group(1) if match else 'UNKNOWN'
            version=sql('SHOW server_version_num')
            versions['restored']=version if re.fullmatch(r'17[0-9]{4}',version) else 'UNKNOWN'
            last_error.versions=versions
            raise last_error
        reader_user=bootstrap_user;sql_prefix=CANONICAL
        for table in verification['tables']:
            query=table_copy(table['schema'],table['name'])
            # Stream plaintext only inside the isolated target; no data in logs.
            process=subprocess.Popen(['docker','--host=unix:///var/run/docker.sock','exec',name,'psql','-h','127.0.0.1','-X','-qAt','-v','ON_ERROR_STOP=1','-U',reader_user,'-d','postgres','-c',CANONICAL+query],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
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
        return {'restore_verified':True,'backup_id':backup_id,'project':PROJECT,'tables_verified':len(verification['tables']),'rows_verified':sum(t['rows'] for t in verification['tables']),'sequences_verified':len(verification['sequences']),'large_objects_verified':len(verification['large_objects']),'metadata_render_context':render_context,'acl_comparison':'postgresql_effective_grants',**extension_metadata,**storage_result}
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
    maximum_age=int(os.environ.get('BACKUP_HEALTH_MAX_AGE_HOURS','30'))
    require(0<maximum_age<=48,'invalid health freshness limit')
    created=datetime.strptime(manifest['backup_id'][:16],'%Y%m%dT%H%M%SZ').replace(tzinfo=timezone.utc)
    require(0<=(datetime.now(timezone.utc)-created).total_seconds()<=maximum_age*3600,'BACKUP_HEALTH_STALE')
    response=s3.get_object(Bucket=bucket,Key=PREFIX+manifest['backup_id']+'/restore-ok.json',ExpectedBucketOwner=owner)
    evidence=json.loads(response['Body'].read(65537))
    require(evidence.get('project')==PROJECT and evidence.get('backup_id')==manifest['backup_id'] and evidence.get('restore_verified') is True,'latest backup has no matching successful restore evidence')
    require(type(evidence.get('tables_verified')) is int and evidence['tables_verified']>0,'restore evidence has no verified tables')
    for part in archive_parts(manifest):
        head=s3.head_object(Bucket=bucket,Key=PREFIX+manifest['backup_id']+'/'+part+'.enc',ExpectedBucketOwner=owner)
        require(head['ContentLength']==manifest['files'][part]['bytes'],'backup part missing or size differs')
        if getattr(s3,'remote_checksum',False):require(head.get('SHA256')==manifest['files'][part]['sha256'],'BACKUP_HEALTH_CHECKSUM_MISMATCH')
    require(manifest['format']==2 and evidence.get('storage_files_verified') is True,'latest backup is not database plus Storage verified')
    return {'recent_restored_backup':True,'maximum_age_hours':maximum_age,'storage_files_verified':True,'storage_service_restore_verified':False}

def latest(s3,bucket,owner,directory):
    return fetch_committed(s3,bucket,owner,committed_manifest(s3,bucket,owner),directory)

def main():
    os.umask(0o077)
    require(len(sys.argv)==2 and sys.argv[1] in ['preflight','backup','restore','init-drive','inspect-drive','retention-plan','health'],'invalid mode')
    require(os.environ.get('GITHUB_REF','').startswith('refs/heads/'),'branch ref required')
    mode=sys.argv[1]
    require(os.environ.get('BACKUP_DRIVE_RETENTION_APPROVED')!='true','retention is disabled for comprehensive backups')
    if os.environ.get('GITHUB_EVENT_NAME')=='schedule':
        require(os.environ.get('GITHUB_REF')=='refs/heads/main','scheduled execution is main-only')
        require(os.environ.get('BACKUP_SCHEDULE_APPROVED')=='true' and os.environ.get('BACKUP_PRODUCTION_RESTORE_VERIFIED')=='true','scheduled execution awaits production restore and owner approval')
    if mode=='inspect-drive':
        require(env('BACKUP_COST_APPROVED')=='true','Drive inspection cost not approved')
        from drive_store import authenticate,inspection_report
        print(json.dumps(inspection_report(authenticate(),env('BACKUP_DRIVE_ACCOUNT'))));return
    if mode=='init-drive':
        require(env('BACKUP_COST_APPROVED')=='true' and env('BACKUP_DRIVE_SETUP_APPROVED')=='true','Drive setup not approved')
        from drive_store import authenticate,initialize_folder
        print('New dedicated PostgreSQL folder ID: '+initialize_folder(authenticate(),env('BACKUP_DRIVE_ACCOUNT')));return
    progress('drive_preflight')
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
            progress('drive_readback')
            fetch_committed(s3,bucket,owner,manifest,directory)
        progress('isolated_restore')
        result=isolated_restore(directory,manifest)
        progress('restore_evidence_upload')
        s3.put_object(Bucket=bucket,Key=PREFIX+manifest['backup_id']+'/restore-ok.json',Body=json.dumps(result).encode(),ExpectedBucketOwner=owner,ContentType='application/json')
        if result.get('storage_files_verified'):
            print('Database and Storage byte restore verified in isolation; Supabase service reattachment remains unverified.')
        else:
            print('Legacy database-only restore verified; Storage was not included. No comprehensive success is certified.')
        result['encrypted_files'] = manifest['files']
        return result
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
