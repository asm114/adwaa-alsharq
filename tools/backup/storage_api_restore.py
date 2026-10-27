"""Official HTTPS Storage API re-upload test, exclusively to an approved EMPTY sandbox.

No SQL, source credentials, deletion, overwrite, public buckets or redirects.
Plaintext is authenticated and fully inventoried in sealed RAM before any writes.
API re-upload generates new object IDs/timestamps/versions: this is a separate
service recovery test, not a claim of byte-identical storage.objects metadata.
"""
import base64
from contextlib import contextmanager
import fcntl
import hashlib
import io
import json
import os
import re
import tarfile
from urllib.parse import quote
import requests
from targets import TARGETS

class ApiRestoreError(Exception):
    def __init__(self,code):self.code=code;super().__init__(code)

def need(condition,code):
    if not condition:raise ApiRestoreError(code)

def path(value):
    need(isinstance(value,str) and value and not value.startswith('/') and
         '\x00' not in value and all(p not in ('','.','..') for p in value.split('/')),
         'API_RESTORE_INVALID_PATH')
    return quote(value,safe='/')

class Sandbox:
    def __init__(self,ref,confirmed,token,approved,session=None):
        need(bool(re.fullmatch('[a-z]{20}',ref or '')) and ref==confirmed,
             'API_RESTORE_TARGET_UNCONFIRMED')
        need(ref not in TARGETS.values(),'API_RESTORE_PRODUCTION_TARGET_PROHIBITED')
        need(approved=='true','API_RESTORE_APPROVAL_REQUIRED')
        need(bool(token) and not token.startswith('sb_publishable_'),'API_RESTORE_BACKEND_KEY_REQUIRED')
        if token.count('.')==2:
            try:claims=json.loads(base64.urlsafe_b64decode(token.split('.')[1]+'==='))
            except Exception:raise ApiRestoreError('API_RESTORE_KEY_INVALID') from None
            need(claims.get('ref')==ref and claims.get('role')=='service_role','API_RESTORE_KEY_PROJECT_MISMATCH')
        else:need(token.startswith('sb_secret_'),'API_RESTORE_KEY_INVALID')
        self.session=session or requests.Session()
        self.session.verify=os.environ.get('SSL_CERT_FILE') or True
        self.session.headers.update({'apikey':token,'Accept-Encoding':'identity'})
        if token.count('.')==2:self.session.headers['Authorization']='Bearer '+token
        self.base='https://'+ref+'.supabase.co/storage/v1/'

    def request(self,method,suffix,**kwargs):
        need(method in ('GET','POST'),'API_RESTORE_METHOD_PROHIBITED')
        try:response=self.session.request(method,self.base+suffix,allow_redirects=False,timeout=(15,120),**kwargs)
        except requests.RequestException:raise ApiRestoreError('API_RESTORE_TRANSPORT_FAILED') from None
        if response.status_code not in (200,201):
            status=response.status_code;response.close()
            code='API_RESTORE_CONFLICT_NO_RETRY' if status==409 else 'API_RESTORE_AUTH_REJECTED' if status in (401,403) else 'API_RESTORE_HTTP_FAILED'
            raise ApiRestoreError(code)
        return response

    def json(self,method,suffix,**kwargs):
        with self.request(method,suffix,stream=True,**kwargs) as response:
            raw=response.raw.read(4*1024*1024+1)
            need(len(raw)<=4*1024*1024,'API_RESTORE_RESPONSE_TOO_LARGE')
            try:return json.loads(raw)
            except ValueError:raise ApiRestoreError('API_RESTORE_RESPONSE_INVALID') from None

    def buckets(self):
        rows=self.json('GET','bucket')
        need(isinstance(rows,list) and all(isinstance(row,dict) for row in rows),'API_RESTORE_RESPONSE_INVALID')
        return rows

    def close(self):self.session.close()

@contextmanager
def authenticated_archive(engine,directory,manifest):
    """Authenticate GCM before yielding plaintext; never write plaintext to disk."""
    from pathlib import Path
    secret=engine.key();aad=manifest['project']+'/'+manifest['backup_id']+'/'
    for part in engine.archive_parts(manifest):
        need(engine.digest(Path(directory)/(part+'.enc'))==manifest['files'][part],'API_RESTORE_CIPHERTEXT_MISMATCH')
    metadata=io.BytesIO();engine.unseal(Path(directory)/'verification.enc',metadata,secret,aad+'verification')
    verification=json.loads(metadata.getvalue())
    need(verification['project']==manifest['project'] and verification['backup_id']==manifest['backup_id'] and
         verification.get('storage_files_included') is True,'API_RESTORE_ARCHIVE_IDENTITY_MISMATCH')
    need(hasattr(os,'memfd_create'),'API_RESTORE_RAM_UNAVAILABLE')
    fd=os.memfd_create('adwaa-storage-api-restore',os.MFD_CLOEXEC|os.MFD_ALLOW_SEALING)
    with os.fdopen(fd,'w+b') as stream:
        engine.unseal(Path(directory)/'storage.enc',stream,secret,aad+'storage')
        stream.flush();fcntl.fcntl(fd,getattr(fcntl,'F_ADD_SEALS',1033),0x0001|0x0002|0x0004|0x0008)
        stream.seek(0)
        yield stream,verification['storage']

def validate_archive(stream,verification):
    files=verification['files'];inventory=verification['inventory'];objects=inventory['objects'];buckets=inventory['buckets']
    need(len(files)==len(objects)<=100000,'API_RESTORE_INVENTORY_INVALID')
    ids=[b['id'] for b in buckets]
    need(len(ids)==len(set(ids)),'API_RESTORE_INVENTORY_INVALID')
    expected={};pairs=set();total=0
    for i,(item,obj) in enumerate(zip(files,objects)):
        name='object-'+str(i).zfill(8);pair=(item['bucket'],item['name'])
        path(pair[0]);path(pair[1])
        need(pair not in pairs and pair[0] in ids and item['member']==name and
             pair==(obj['bucket_id'],obj['name']) and type(item['bytes']) is int and
             item['bytes']>=0 and item['bytes']==obj['metadata']['size'] and
             bool(re.fullmatch('[a-f0-9]{64}',item['sha256'])),'API_RESTORE_INVENTORY_INVALID')
        mime=obj.get('metadata',{}).get('mimetype') or 'application/octet-stream'
        need(isinstance(mime,str) and '\r' not in mime and '\n' not in mime,'API_RESTORE_MIME_INVALID')
        pairs.add(pair);expected[name]=(item,obj);total+=item['bytes']
    need(total<=int(os.environ.get('BACKUP_STORAGE_RESTORE_MAX_BYTES','134217728')),'API_RESTORE_SIZE_LIMIT')
    seen=set();entries=[];stream.seek(0)
    with tarfile.open(fileobj=stream,mode='r:') as archive:
        for member in archive:
            need(member.name in expected and member.name not in seen and member.isfile() and
                 not member.pax_headers,'API_RESTORE_TAR_INVALID')
            item,obj=expected[member.name];seen.add(member.name)
            need(member.size==item['bytes'],'API_RESTORE_TAR_INVALID')
            digest=hashlib.sha256();size=0
            with archive.extractfile(member) as source:
                while chunk:=source.read(1024*1024):digest.update(chunk);size+=len(chunk)
            need(size==item['bytes'] and digest.hexdigest()==item['sha256'],'API_RESTORE_PLAINTEXT_MISMATCH')
            entries.append((item,obj,member.offset_data))
    need(seen==set(expected),'API_RESTORE_TAR_INCOMPLETE')
    return buckets,entries

class BoundedReader:
    def __init__(self,stream,offset,size):self.stream=stream;stream.seek(offset);self.remaining=size;self.size=size
    def __len__(self):return self.size
    def read(self,size=-1):
        value=self.stream.read(self.remaining if size<0 else min(size,self.remaining))
        self.remaining-=len(value);return value


def restore(sandbox,stream,verification,report):
    buckets,entries=validate_archive(stream,verification) # ALL hashes before remote writes.
    need(sandbox.buckets()==[],'API_RESTORE_TARGET_NOT_EMPTY')
    report.update(remote_writes_started=False,buckets_created=0,objects_uploaded=0,objects_verified=0)
    for bucket in buckets:
        report['remote_writes_started']=True
        # Real customer objects must NEVER be made publicly accessible in a test.
        payload={'id':bucket['id'],'name':bucket['id'],'public':False,
                 'file_size_limit':bucket.get('file_size_limit'),
                 'allowed_mime_types':bucket.get('allowed_mime_types')}
        sandbox.json('POST','bucket',json=payload);report['buckets_created']+=1
    observed=sandbox.buckets()
    need({b['id'] for b in observed}=={b['id'] for b in buckets} and
         all(b.get('public') is False for b in observed),'API_RESTORE_PRIVATE_BUCKET_CHECK_FAILED')
    for item,obj,offset in entries:
        mime=obj.get('metadata',{}).get('mimetype') or 'application/octet-stream'
        need(isinstance(mime,str) and '\r' not in mime and '\n' not in mime,'API_RESTORE_MIME_INVALID')
        body=BoundedReader(stream,offset,item['bytes'])
        suffix=quote(item['bucket'],safe='')+'/'+path(item['name'])
        with sandbox.request('POST','object/'+suffix,data=body,
            headers={'x-upsert':'false','Content-Type':mime,'Content-Length':str(item['bytes'])}) as response:
            need(body.remaining==0,'API_RESTORE_UPLOAD_INCOMPLETE')
        report['objects_uploaded']+=1
        with sandbox.request('GET','object/authenticated/'+suffix,stream=True) as response:
            digest=hashlib.sha256();size=0
            for chunk in response.iter_content(1024*1024):
                size+=len(chunk);need(size<=item['bytes'],'API_RESTORE_READBACK_MISMATCH');digest.update(chunk)
            need(size==item['bytes'] and digest.hexdigest()==item['sha256'],'API_RESTORE_READBACK_MISMATCH')
        report['objects_verified']+=1
    # Recursively list via the official API to detect any missing/extra objects.
    seen=set()
    for bucket in buckets:
        pending=[''];prefixes=set()
        while pending:
            prefix=pending.pop();need(prefix not in prefixes,'API_RESTORE_LIST_INVALID');prefixes.add(prefix);offset=0
            while True:
                rows=sandbox.json('POST','object/list/'+quote(bucket['id'],safe=''),
                    json={'prefix':prefix,'limit':100,'offset':offset,'sortBy':{'column':'name','order':'asc'}})
                need(isinstance(rows,list) and len(rows)<=100,'API_RESTORE_LIST_INVALID')
                for row in rows:
                    name=prefix+row['name'];path(name)
                    if row.get('id') is None:pending.append(name+'/')
                    else:
                        pair=(bucket['id'],name);need(pair not in seen,'API_RESTORE_LIST_INVALID');seen.add(pair)
                need(len(seen)<=len(entries) and len(prefixes)+len(pending)<=100001,'API_RESTORE_LIST_INVALID')
                if len(rows)<100:break
                offset+=100;need(offset<=100000,'API_RESTORE_LIST_INVALID')
    need(seen=={(item['bucket'],item['name']) for item,_,_ in entries},'API_RESTORE_FINAL_INVENTORY_MISMATCH')
    report.update(code='STORAGE_API_RESTORE_VERIFIED',storage_service_restore_verified=True,
                  bytes_verified=sum(item['bytes'] for item,_,_ in entries),
                  source_production_modified=False,original_sql_metadata_preserved_in_backup=True,
                  reupload_metadata_identical=False,test_buckets_private=True,deletion_enabled=False)
    return report
