"""Read-only Supabase Storage source and streaming encrypted object archive.
Only GET requests, fixed HTTPS origin, no redirects, no source mutation methods.
Object names and metadata belong inside authenticated encrypted verification only.
"""
import base64,hashlib,io,json,os,tarfile
from urllib.parse import quote
import requests
from targets import PROJECT,identity_confirmed

class StorageError(Exception):pass

def require(value,message):
    if not value:raise StorageError(message)

def inventory(conn):
    require(conn.execute("SELECT to_regclass('storage.buckets') IS NOT NULL AND to_regclass('storage.objects') IS NOT NULL").fetchone()==(True,),'Storage metadata schema missing')
    buckets=conn.execute('SELECT to_jsonb(b) FROM storage.buckets b ORDER BY id').fetchall()
    objects=conn.execute("SELECT to_jsonb(o)-'last_accessed_at' FROM storage.objects o ORDER BY bucket_id,name").fetchall()
    result={'buckets':[r[0] for r in buckets],'objects':[r[0] for r in objects]}
    require(len(result['objects'])<=int(os.environ.get('BACKUP_MAX_STORAGE_OBJECTS','100000')),'Storage object count exceeds budget')
    ids=[b['id'] for b in result['buckets']]
    require(len(set(ids))==len(ids),'duplicate Storage bucket')
    seen=set()
    for obj in result['objects']:
        pair=(obj['bucket_id'],obj['name'])
        require(pair not in seen and obj['bucket_id'] in ids,'invalid Storage object inventory')
        seen.add(pair)
        for value in pair:
            require(isinstance(value,str) and value and not value.startswith('/') and all(x not in ('.','..','') for x in value.split('/')) and '\x00' not in value,'unsupported Storage path')
        require(obj.get('version') and obj.get('updated_at'),'Storage object version/mtime required')
        size=obj.get('metadata',{}).get('size')
        require(type(size) is int and size>=0,'Storage object size missing')
    return result

class Source:
    def __init__(self):
        require(identity_confirmed(),'project identity confirmation required')
        token=os.environ.get('BACKUP_STORAGE_API_KEY','')
        require(token and not token.startswith('sb_publishable_'),'backend Storage read credential required')
        if token.count('.')==2:
            try:
                claims=json.loads(base64.urlsafe_b64decode(token.split('.')[1]+'==='))
                require(claims.get('role') not in ('anon','authenticated',None),'public Storage credential prohibited')
                require(claims.get('ref',PROJECT)==PROJECT,'Storage credential project mismatch')
            except StorageError:raise
            except Exception:raise StorageError('invalid Storage credential') from None
        else:require(token.startswith('sb_secret_'),'unrecognized backend Storage credential')
        self.session=requests.Session()
        self.session.verify=os.environ.get('SSL_CERT_FILE') or True
        self.session.headers.update({'apikey':token,'Accept-Encoding':'identity'})
        if token.count('.')==2:self.session.headers['Authorization']='Bearer '+token
        self.base='https://'+PROJECT+'.supabase.co/storage/v1/'
    def close(self):self.session.close()
    def get(self,path,stream=False):
        response=self.session.get(self.base+path,stream=stream,allow_redirects=False,timeout=(15,120))
        if response.status_code!=200:
            response.close();raise StorageError('Storage read failed; details suppressed')
        return response
    def check_buckets(self,expected):
        with self.get('bucket',True) as response:
            payload=response.raw.read(4*1024*1024+1)
            require(len(payload)<=4*1024*1024,'Storage bucket response exceeds budget')
            actual=json.loads(payload)
        fields=('id','name','public','file_size_limit','allowed_mime_types')
        canonical=lambda rows:sorted([{k:b.get(k) for k in fields} for b in rows],key=lambda b:b['id'])
        require(isinstance(actual,list) and canonical(actual)==canonical(expected),'Storage API bucket inventory differs from SQL')
    def object(self,bucket,name):
        return self.get('object/authenticated/'+quote(bucket,safe='')+'/'+quote(name,safe='/'),True)

class HashedReader:
    def __init__(self,stream):self.stream=stream;self.h=hashlib.sha256();self.size=0
    def read(self,size=-1):
        value=self.stream.read(size)
        self.h.update(value);self.size+=len(value);return value

def capture(engine,conn,destination,secret,aad,source=None):
    before=inventory(conn)
    own=source is None;source=source or Source()
    limit=int(os.environ.get('BACKUP_MAX_STORAGE_BYTES','1073741824'))
    require(limit>0 and sum(o['metadata']['size'] for o in before['objects'])<=limit,'Storage exceeds approved capacity')
    files=[]
    try:
        source.check_buckets(before['buckets'])
        with engine.SealedWriter(destination,secret,aad) as encrypted:
            with tarfile.open(fileobj=encrypted,mode='w|',format=tarfile.USTAR_FORMAT) as archive:
                for i,obj in enumerate(before['objects']):
                    member=f'object-{i:08d}'
                    with source.object(obj['bucket_id'],obj['name']) as response:
                        expected=obj['metadata']['size']
                        length=response.headers.get('Content-Length')
                        require(length is not None and int(length)==expected,'Storage content length differs from inventory')
                        response.raw.decode_content=False
                        reader=HashedReader(response.raw)
                        info=tarfile.TarInfo(member);info.size=expected;info.mode=0o600;info.mtime=0
                        archive.addfile(info,reader)
                        require(reader.size==expected and reader.read(1)==b'','Storage object truncated or oversized')
                        files.append({'member':member,'bucket':obj['bucket_id'],'name':obj['name'],'bytes':expected,'sha256':reader.h.hexdigest()})
        source.check_buckets(before['buckets'])
        with engine.source_connection() as current:
            require(inventory(current)==before,'Storage changed during backup; no complete backup certified')
        return {'inventory':before,'files':files,'consistency':'SQL snapshot plus unchanged final inventory; not a cross-project atomic snapshot'}
    finally:
        if own:source.close()

def restore(engine,container,verification):
    """Rebuild object bytes in isolated tmpfs, not a production upload/API call."""
    index=verification['files'];objects=verification['inventory']['objects']
    require(len(index)==len(objects),'Storage index count differs')
    expected={f'object-{i:08d}':(obj,item) for i,(obj,item) in enumerate(zip(objects,index))}
    for member,(obj,item) in expected.items():
        require(item['member']==member and item['bucket']==obj['bucket_id'] and item['name']==obj['name'] and item['bytes']==obj['metadata']['size'],'Storage index identity differs')
        require(type(item['bytes']) is int and item['bytes']>=0,'Storage size invalid')
    engine.docker(['exec',container,'mkdir','-m','700','/tmp/restored-storage'])
    import subprocess
    process=subprocess.Popen(['docker','--host=unix:///var/run/docker.sock','exec',container,'cat','/tmp/storage'],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
    seen=set()
    try:
        with tarfile.open(fileobj=process.stdout,mode='r|') as archive:
            for member in archive:
                require(member.name in expected and member.name not in seen and member.isfile() and not member.pax_headers,'invalid Storage archive member')
                seen.add(member.name);obj,item=expected[member.name]
                require(member.size==item['bytes'],'Storage archive member size differs')
                source=HashedReader(archive.extractfile(member))
                target='/tmp/restored-storage/'+member.name
                def produce(sink):
                    while chunk:=source.read(1024*1024):sink.write(chunk)
                engine.stage_file(container,target,item['bytes'],produce)
                require(source.size==item['bytes'] and source.h.hexdigest()==item['sha256'],'restored Storage bytes differ')
                actual=engine.docker(['exec',container,'sha256sum',target]).stdout.decode().split()[0]
                require(actual==item['sha256'],'persisted Storage hash differs')
        # Drain TAR padding so the Docker reader cannot block on a full stdout pipe.
        while process.stdout.read(1024*1024):pass
        require(process.wait(timeout=120)==0 and seen==set(expected),'Storage archive incomplete')
    finally:
        process.stdout.close()
        if process.poll() is None:process.kill();process.wait()
    return {'storage_files_verified':True,'storage_objects_verified':len(index),'storage_buckets_verified':len(verification['inventory']['buckets']),'storage_service_restore_verified':False}
