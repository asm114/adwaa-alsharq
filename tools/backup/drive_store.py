"""Restricted Drive transport for the existing encrypted backup pipeline.
No browser tokens or legacy-folder discovery. Retention remains read-only unless
both production-restore evidence and a separate deletion approval are enabled.
"""
import hashlib,io,json,os,re,time
from datetime import datetime,timezone,timedelta
from pathlib import Path
from google.oauth2.credentials import Credentials
from google_auth_httplib2 import AuthorizedHttp,Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload,MediaIoBaseUpload,MediaIoBaseDownload
import httplib2
from google.auth.exceptions import RefreshError

SCOPE='https://www.googleapis.com/auth/drive.file'
from targets import PROJECT
PREFIX='adwaa/'+PROJECT+'/'
BID=r'\d{8}T\d{6}Z-[a-f0-9]{32}'
OBJECTS=('database.enc','roles.enc','verification.enc','storage.enc','complete.json','restore-ok.json')
FIELDS='id,name,mimeType,size,sha256Checksum,createdTime,appProperties,parents,shared,trashed,owners(emailAddress),permissions(type,role,deleted),driveId,capabilities(canAddChildren,canListChildren)'
SAFE_CODES=frozenset({
    'DRIVE_GATE_FAILED','DRIVE_CONFIG_MISSING','OAUTH_INVALID_GRANT','OAUTH_INVALID_CLIENT',
    'OAUTH_UNAUTHORIZED_CLIENT','OAUTH_ACCESS_DENIED','OAUTH_INVALID_SCOPE','OAUTH_REFRESH_FAILED','OAUTH_SCOPE_UNCONFIRMED',
    'OAUTH_SCOPE_REJECTED','DRIVE_CLIENT_INIT_FAILED','DRIVE_ACCOUNT_READ_FAILED',
    'DRIVE_ACCOUNT_MISMATCH','DRIVE_FOLDER_LOOKUP_FAILED','DRIVE_FOLDER_LOOKUP_AMBIGUOUS',
    'DRIVE_FOLDER_CREATE_UNCONFIRMED','DRIVE_NEW_FOLDER_VALIDATION_FAILED',
    'DRIVE_EXISTING_FOLDER_VALIDATION_FAILED','DRIVE_FOLDER_METADATA_INVALID',
    'DRIVE_QUOTA_UNCONFIRMED','DRIVE_SPACE_INSUFFICIENT','DRIVE_BUNDLE_LIMIT_EXCEEDED',
    'DRIVE_TARGET_NOT_PRIVATE','DRIVE_OWNER_MISMATCH','DRIVE_PERMISSION_METADATA_MISSING',
    'DRIVE_SHARING_NOT_OWNER_ONLY','DRIVE_FOLDER_NAMESPACE_MISMATCH','DRIVE_FOLDER_NOT_WRITABLE',
    'DRIVE_FILE_NAMESPACE_MISMATCH','DRIVE_DUPLICATE_OBJECT','DRIVE_EXISTING_OBJECT_CONFLICT',
    'DRIVE_UPLOAD_UNCONFIRMED','DRIVE_METADATA_READ_FAILED','DRIVE_AUDIT_FAILED',
    'DRIVE_AUDIT_METADATA_INVALID','DRIVE_PAGINATION_INVALID',
    'DRIVE_OBJECT_LOOKUP_UNCONFIRMED','DRIVE_OBJECT_KEY_MISMATCH',
    'DRIVE_UPLOAD_TIMEOUT','DRIVE_UPLOAD_REQUEST_REJECTED','DRIVE_UPLOAD_SERVER_ERROR',
    'DRIVE_API_QUOTA_REJECTED','DRIVE_RATE_LIMITED','DRIVE_WRITE_FORBIDDEN',
    'DRIVE_UPLOAD_SIZE_MISMATCH','DRIVE_UPLOAD_CHECKSUM_UNAVAILABLE',
    'DRIVE_UPLOAD_CHECKSUM_MISMATCH','DRIVE_UPLOAD_KEY_MISMATCH'})
class DriveError(Exception):
    def __init__(self,message,code='DRIVE_GATE_FAILED'):
        super().__init__(message)
        self.code=code if code in SAFE_CODES else 'DRIVE_GATE_FAILED'

def safe_diagnostic(error):
    # Never serialize exception text, HTTP bodies, request URLs or credentials.
    return error.code if type(error) is DriveError and error.code in SAFE_CODES else 'DRIVE_GATE_FAILED'


def require(value,message,code='DRIVE_GATE_FAILED'):
    if not value:raise DriveError(message,code)
def env(name):
    value=os.environ.get(name,'')
    if not value:raise DriveError('missing Drive configuration','DRIVE_CONFIG_MISSING')
    return value

def drive_http():
    transport=httplib2.Http(timeout=60)
    # Google resumable upload's 308 means Resume Incomplete, not a redirect.
    # Passing a custom Http bypasses googleapiclient.http.build_http's same fix.
    transport.redirect_codes=transport.redirect_codes-{308}
    return transport

def authenticate():
    # Fixed endpoint; never accept a token URI, access token or service account JSON.
    creds=Credentials(token=None,refresh_token=env('BACKUP_DRIVE_REFRESH_TOKEN'),token_uri='https://oauth2.googleapis.com/token',client_id=env('BACKUP_DRIVE_CLIENT_ID'),client_secret=env('BACKUP_DRIVE_CLIENT_SECRET'),scopes=[SCOPE])
    try:creds.refresh(Request(httplib2.Http(timeout=60)))
    except RefreshError as error:
        reason=next((x.get('error') for x in error.args if isinstance(x,dict)),None)
        if not isinstance(reason,str):reason=None
        code={'invalid_grant':'OAUTH_INVALID_GRANT','invalid_client':'OAUTH_INVALID_CLIENT','unauthorized_client':'OAUTH_UNAUTHORIZED_CLIENT','access_denied':'OAUTH_ACCESS_DENIED','invalid_scope':'OAUTH_INVALID_SCOPE'}.get(reason,'OAUTH_REFRESH_FAILED')
        raise DriveError('Google refresh rejected; details suppressed',code) from None
    except Exception:raise DriveError('Google refresh failed; details suppressed','OAUTH_REFRESH_FAILED') from None
    if creds.granted_scopes is None:raise DriveError('Google did not confirm granted scopes','OAUTH_SCOPE_UNCONFIRMED')
    if set(creds.granted_scopes)!={SCOPE}:raise DriveError('Granted scope is not exclusively drive.file','OAUTH_SCOPE_REJECTED')
    try:return build('drive','v3',http=AuthorizedHttp(creds,http=drive_http()),cache_discovery=False)
    except Exception:raise DriveError('Drive client initialization failed','DRIVE_CLIENT_INIT_FAILED') from None

def upload_diagnostic(error):
    if isinstance(error,TimeoutError):return 'DRIVE_UPLOAD_TIMEOUT'
    status=getattr(getattr(error,'resp',None),'status',None)
    reasons=[]
    try:
        body=json.loads(getattr(error,'content',b'{}'))
        reasons=[row.get('reason') for row in body.get('error',{}).get('errors',[]) if isinstance(row,dict)]
    except Exception:pass
    mapping={'storageQuotaExceeded':'DRIVE_SPACE_INSUFFICIENT',
             'dailyLimitExceeded':'DRIVE_API_QUOTA_REJECTED','quotaExceeded':'DRIVE_API_QUOTA_REJECTED',
             'rateLimitExceeded':'DRIVE_RATE_LIMITED','userRateLimitExceeded':'DRIVE_RATE_LIMITED',
             'insufficientFilePermissions':'DRIVE_WRITE_FORBIDDEN'}
    for reason in reasons:
        if isinstance(reason,str) and reason in mapping:return mapping[reason]
    if status==400:return 'DRIVE_UPLOAD_REQUEST_REJECTED'
    if status==403:return 'DRIVE_WRITE_FORBIDDEN'
    if type(status) is int and status>=500:return 'DRIVE_UPLOAD_SERVER_ERROR'
    return 'DRIVE_UPLOAD_UNCONFIRMED'

def escaped(value):return value.replace('\\','\\\\').replace("'","\\'")
def stamp(value):return datetime.fromisoformat(value.replace('Z','+00:00'))

def split_key(key):
    require(key.startswith(PREFIX),'wrong Drive object prefix')
    parts=key[len(PREFIX):].split('/')
    require(len(parts)==2 and re.fullmatch(BID,parts[0]) and parts[1] in OBJECTS,'invalid Drive object key')
    return parts

def file_hash(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        while chunk:=f.read(1024*1024):h.update(chunk)
    return h.hexdigest()

class DriveStore:
    def __init__(self,service,folder,email,daily_bytes):
        self.service=service;self.folder=folder;self.email=email.lower();self.daily_bytes=int(daily_bytes);self.ids={}
        require(self.daily_bytes>0,'approved daily Drive size estimate required')
    def _identity(self):
        about=self.service.about().get(fields='user(emailAddress),storageQuota(limit,usage)').execute(num_retries=3)
        require(about['user']['emailAddress'].lower()==self.email,'wrong Google account','DRIVE_ACCOUNT_MISMATCH')
        quota=about.get('storageQuota',{});require('limit' in quota and 'usage' in quota,'Drive quota could not be confirmed','DRIVE_QUOTA_UNCONFIRMED')
        return int(quota['limit'])-int(quota['usage'])
    def _private(self,file,folder=False):
        require(not file.get('trashed') and not file.get('shared') and not file.get('driveId'),'Drive target must be private My Drive','DRIVE_TARGET_NOT_PRIVATE')
        owners=file.get('owners',[])
        require(len(owners)==1 and owners[0].get('emailAddress','').lower()==self.email,'Drive owner mismatch','DRIVE_OWNER_MISMATCH')
        permissions=[p for p in file.get('permissions',[]) if not p.get('deleted')]
        require(bool(permissions),'Drive permission metadata missing','DRIVE_PERMISSION_METADATA_MISSING')
        require(all(p.get('type')=='user' and p.get('role')=='owner' for p in permissions),'Drive sharing is not owner-only','DRIVE_SHARING_NOT_OWNER_ONLY')
        if folder:
            require(file.get('mimeType')=='application/vnd.google-apps.folder' and file.get('appProperties',{}).get('adwaaPgBackupTarget')==PROJECT,'dedicated marked PostgreSQL folder required; never use legacy folder','DRIVE_FOLDER_NAMESPACE_MISMATCH')
            require(file.get('capabilities',{}).get('canAddChildren') is True,'Drive folder is not writable','DRIVE_FOLDER_NOT_WRITABLE')
        else:require(self.folder in file.get('parents',[]) and file.get('appProperties',{}).get('adwaaPgBackup')==PROJECT,'Drive file outside dedicated namespace','DRIVE_FILE_NAMESPACE_MISMATCH')
        return file
    def _metadata(self,file_id,folder=False):
        return self._private(self.service.files().get(fileId=file_id,fields=FIELDS).execute(num_retries=3),folder)
    def _list(self,key=None):
        query="'"+escaped(self.folder)+"' in parents and trashed=false and appProperties has { key='adwaaPgBackup' and value='"+PROJECT+"' }"
        if key:query+=" and appProperties has { key='objectKey' and value='"+escaped(key)+"' }"
        token=None;seen=set();rows=[]
        while True:
            page=self.service.files().list(q=query,pageSize=1000,pageToken=token,fields='nextPageToken,files(id,size,createdTime,appProperties)').execute(num_retries=3)
            rows.extend(page.get('files',[]));token=page.get('nextPageToken')
            if not token:break
            require(token not in seen,'Drive pagination loop');seen.add(token)
        # Query filters are a fence; revalidate each returned record as well.
        return [r for r in rows if r.get('appProperties',{}).get('adwaaPgBackup')==PROJECT]
    def preflight(self):
        free=self._identity();self._metadata(self.folder,True)
        managed=sum(int(r.get('size',0)) for r in self._list())
        require(free>=self.daily_bytes and free+managed>=31*self.daily_bytes,'Drive space insufficient for approved 30-day budget plus one in-flight backup','DRIVE_SPACE_INSUFFICIENT')

    def audit_existing(self):
        """GET/list only. Markers are observations, never a success certificate.

        Inspect all children to count unmarked files without exposing their names.
        Preserve malformed/unconfirmed rows; never create, download, or delete.
        """
        self._metadata(self.folder,True)
        query="'"+escaped(self.folder)+"' in parents and trashed=false"
        token=None;seen=set();rows=[]
        while True:
            try:
                page=self.service.files().list(q=query,pageSize=1000,pageToken=token,
                    fields='nextPageToken,files('+FIELDS+')').execute(num_retries=3)
            except Exception:raise DriveError('audit listing failed','DRIVE_AUDIT_FAILED') from None
            rows.extend(page.get('files',[]));token=page.get('nextPageToken')
            require(len(rows)<=10000,'audit bound exceeded','DRIVE_AUDIT_METADATA_INVALID')
            if not token:break
            require(token not in seen,'audit pagination invalid','DRIVE_PAGINATION_INVALID');seen.add(token)
        files=[];groups={};unclassified=0
        for row in rows:
            props=row.get('appProperties',{});file_id=row.get('id','')
            if props.get('adwaaPgBackup')!=PROJECT:
                unclassified+=1;continue
            try:backup_id,part=split_key(props.get('objectKey',''))
            except DriveError:
                unclassified+=1;continue
            require(isinstance(file_id,str) and re.fullmatch(r'[A-Za-z0-9_-]{8,200}',file_id),'invalid file ID','DRIVE_AUDIT_METADATA_INVALID')
            try:size=int(row.get('size',-1))
            except (ValueError,TypeError):raise DriveError('invalid size','DRIVE_AUDIT_METADATA_INVALID') from None
            require(size>=0,'size missing','DRIVE_AUDIT_METADATA_INVALID')
            try:self._private(row);code='DRIVE_OBJECT_METADATA_OK'
            except DriveError as error:code=safe_diagnostic(error)
            sha=row.get('sha256Checksum','')
            files.append({'file_id':file_id,'backup_id':backup_id,'part':part,'bytes':size,
                          'sha256_available':isinstance(sha,str) and bool(re.fullmatch(r'[a-f0-9]{64}',sha)),
                          'metadata_code':code})
            groups.setdefault(backup_id,[]).append(part)
        summaries=[]
        for backup_id,parts in sorted(groups.items()):
            summaries.append({'backup_id':backup_id,'file_count':len(parts),
                              'duplicate_parts':len(parts)-len(set(parts)),
                              'complete_marker_present':'complete.json' in parts,
                              'restore_marker_present':'restore-ok.json' in parts,
                              'restore_verified':False,
                              'status':'OBSERVED_UNVERIFIED'})
        return {'read_only':True,'managed_files':files,'groups':summaries,
                'unclassified_file_count':unclassified,'deletion_enabled':False}
    def ensure_capacity(self,size):
        require(size<=self.daily_bytes,'encrypted bundle exceeds approved daily estimate','DRIVE_BUNDLE_LIMIT_EXCEEDED')
        require(self._identity()>=size,'Drive free space insufficient','DRIVE_SPACE_INSUFFICIENT')
    def _find(self,key):
        split_key(key)
        cached=self.ids.get(key)
        # A reserved/confirmed ID is authoritative for our own upload. List
        # indexing can lag behind files.get; never allocate a new ID on ambiguity.
        if cached:
            try:file=self._metadata(cached)
            except DriveError:raise
            except Exception:raise DriveError('known object lookup unconfirmed','DRIVE_OBJECT_LOOKUP_UNCONFIRMED') from None
            require(file['appProperties'].get('objectKey')==key,'Drive key mismatch','DRIVE_OBJECT_KEY_MISMATCH')
            matches=[f for f in self._list(key) if f.get('appProperties',{}).get('objectKey')==key]
            require(all(f['id']==cached for f in matches),'duplicate Drive object key','DRIVE_DUPLICATE_OBJECT')
            return file
        files=[f for f in self._list(key) if f.get('appProperties',{}).get('objectKey')==key]
        require(len(files)<=1,'duplicate Drive object key; manual review required','DRIVE_DUPLICATE_OBJECT')
        if not files:return None
        file=self._metadata(files[0]['id'])
        require(file['appProperties'].get('objectKey')==key,'Drive key mismatch','DRIVE_OBJECT_KEY_MISMATCH')
        self.ids[key]=file['id']
        return file
    def _put(self,key,media,size,sha):
        backup_id,part=split_key(key)
        existing=self._find(key)
        if existing:
            require(int(existing.get('size',-1))==size and existing.get('sha256Checksum')==sha,'refuse overwrite of an existing Drive backup','DRIVE_EXISTING_OBJECT_CONFLICT')
            return existing
        file_id=self.ids.get(key)
        if file_id:
            # A prior ambiguous write may already exist; never allocate another ID.
            try:
                file=self._metadata(file_id)
                require(file.get('sha256Checksum')==sha and int(file.get('size',-1))==size,'unconfirmed prior Drive write')
                return file
            except Exception:raise DriveError('prior Drive outcome unknown; no second file created') from None
        self._metadata(self.folder,True)
        file_id=self.service.files().generateIds(count=1,space='drive',type='files').execute(num_retries=3)['ids'][0];self.ids[key]=file_id
        body={'id':file_id,'name':backup_id+'--'+part,'parents':[self.folder],'appProperties':{'adwaaPgBackup':PROJECT,'objectKey':key,'backupId':backup_id}}
        request=self.service.files().create(body=body,media_body=media,fields='id',supportsAllDrives=False)
        upload_code=None
        try:
            response=None;steps=0;limit=(size+media.chunksize()-1)//media.chunksize()+5
            while response is None:
                steps+=1;require(steps<=limit,'Drive upload made no bounded progress')
                _,response=request.next_chunk(num_retries=3)
        except Exception as error:
            # A lost final reply is not failure proof. Confirm the same ID.
            upload_code=upload_diagnostic(error)
        last_code='DRIVE_UPLOAD_UNCONFIRMED'
        for attempt in range(3):
            try:
                file=self._metadata(file_id)
                require(int(file.get('size',-1))==size,'Drive uploaded size mismatch','DRIVE_UPLOAD_SIZE_MISMATCH')
                require(file['appProperties'].get('objectKey')==key,'Drive uploaded key mismatch','DRIVE_UPLOAD_KEY_MISMATCH')
                require(isinstance(file.get('sha256Checksum'),str) and bool(re.fullmatch(r'[a-f0-9]{64}',file['sha256Checksum'])),'Drive uploaded checksum unavailable','DRIVE_UPLOAD_CHECKSUM_UNAVAILABLE')
                require(file['sha256Checksum']==sha,'Drive uploaded checksum mismatch','DRIVE_UPLOAD_CHECKSUM_MISMATCH')
                return file
            except Exception as error:
                last_code=safe_diagnostic(error) if isinstance(error,DriveError) else 'DRIVE_METADATA_READ_FAILED'
                if last_code=='DRIVE_GATE_FAILED':last_code='DRIVE_UPLOAD_UNCONFIRMED'
                if attempt<2:time.sleep(attempt+1)
        code=upload_code if upload_code and last_code in ('DRIVE_METADATA_READ_FAILED','DRIVE_UPLOAD_UNCONFIRMED') else last_code
        raise DriveError('Drive upload not confirmed; reserved ID retained, no duplicate retry',code)
    # Compatibility adapter: the encrypted backup engine is unchanged.
    def upload_file(self,path,bucket,key,ExtraArgs=None):
        require(bucket==self.folder,'wrong folder')
        return self._put(key,MediaFileUpload(path,mimetype='application/octet-stream',chunksize=8*1024*1024,resumable=True),Path(path).stat().st_size,file_hash(path))
    def put_object(self,Bucket,Key,Body,**kwargs):
        require(Bucket==self.folder and isinstance(Body,bytes),'invalid Drive metadata upload')
        return self._put(Key,MediaIoBaseUpload(io.BytesIO(Body),mimetype='application/octet-stream',chunksize=256*1024,resumable=True),len(Body),hashlib.sha256(Body).hexdigest())
    def head_object(self,Bucket,Key,**kwargs):
        require(Bucket==self.folder,'wrong folder');file=self._find(Key);require(file is not None,'Drive object missing')
        return {'ContentLength':int(file['size'])}
    def _download(self,file,sink):
        request=self.service.files().get_media(fileId=file['id'])
        downloader=MediaIoBaseDownload(sink,request,chunksize=8*1024*1024);done=False
        while not done:_,done=downloader.next_chunk(num_retries=3)
    def get_object(self,Bucket,Key,**kwargs):
        require(Bucket==self.folder,'wrong folder');file=self._find(Key);require(file is not None and int(file['size'])<=65536,'Drive marker missing or too large')
        sink=io.BytesIO();self._download(file,sink)
        require(hashlib.sha256(sink.getvalue()).hexdigest()==file.get('sha256Checksum'),'Drive marker checksum mismatch')
        sink.seek(0);return {'Body':sink}
    def download_file(self,bucket,key,path,ExtraArgs=None):
        require(bucket==self.folder,'wrong folder');file=self._find(key);require(file is not None and int(file['size'])<=2147483648,'Drive download missing or exceeds budget')
        with open(path,'wb') as out:os.chmod(path,0o600);self._download(file,out)
        require(Path(path).stat().st_size==int(file['size']) and file_hash(path)==file.get('sha256Checksum'),'Drive downloaded size/checksum mismatch')
    def get_paginator(self,operation):
        require(operation=='list_objects_v2','unsupported listing');return self
    def paginate(self,Bucket,Prefix,**kwargs):
        require(Bucket==self.folder and Prefix==PREFIX,'wrong Drive list scope');items=[]
        for row in self._list():
            key=row.get('appProperties',{}).get('objectKey','')
            try:split_key(key)
            except DriveError:continue
            items.append({'Key':key,'LastModified':stamp(row['createdTime'])})
        return [{'Contents':items}]
    def retention_plan(self,now=None):
        # Planning never calls update/delete/trash; legacy objects are out of scope.
        now=now or datetime.now(timezone.utc);self._metadata(self.folder,True);candidates=0
        for row in self._list():
            props=row.get('appProperties',{});key=props.get('objectKey','')
            try:backup_id,_=split_key(key)
            except DriveError:continue
            created=stamp(row['createdTime']);logical=datetime.strptime(backup_id[:16],'%Y%m%dT%H%M%SZ').replace(tzinfo=timezone.utc)
            if created<now-timedelta(days=30) and logical<now-timedelta(days=30):candidates+=1
        return {'retention_days':30,'expired_managed_objects':candidates,'deletion_enabled':False,'legacy_files_touched':False}

    def finish_retention(self,result,now=None):
        plan=self.retention_plan(now)
        if os.environ.get('BACKUP_DRIVE_RETENTION_APPROVED')!='true':return plan
        require(os.environ.get('BACKUP_PRODUCTION_RESTORE_VERIFIED')=='true','production restore gate still open')
        require(result.get('restore_verified') is True and result.get('project')==PROJECT,'current restore must pass before cleanup')
        current=result.get('backup_id','');require(re.fullmatch(BID,current),'invalid current restore identity')
        now=now or datetime.now(timezone.utc)
        current_time=datetime.strptime(current[:16],'%Y%m%dT%H%M%SZ').replace(tzinfo=timezone.utc)
        require(timedelta(0)<=now-current_time<timedelta(hours=48),'fresh restored backup required before cleanup')
        groups={}
        for row in self._list():
            try:backup_id,_=split_key(row.get('appProperties',{}).get('objectKey',''))
            except DriveError:continue
            groups.setdefault(backup_id,[]).append(row)
        deleted=0
        for backup_id,rows in groups.items():
            logical=datetime.strptime(backup_id[:16],'%Y%m%dT%H%M%SZ').replace(tzinfo=timezone.utc)
            if backup_id==current or logical>=now-timedelta(days=30) or any(stamp(r['createdTime'])>=now-timedelta(days=30) for r in rows):continue
            # Validate the entire candidate group again before any irreversible call.
            verified=[self._metadata(r['id']) for r in rows]
            require(all(f['appProperties'].get('objectKey')==r['appProperties'].get('objectKey') for f,r in zip(verified,rows)),'retention identity changed')
            for file in verified:
                self.service.files().delete(fileId=file['id']).execute(num_retries=0);deleted+=1
        return {**plan,'deletion_enabled':True,'deleted_managed_objects':deleted}

def inspect_folders(service,email):
    """Read-only: same application/project marker, never adopt by display name."""
    try:about=service.about().get(fields='user(emailAddress)').execute(num_retries=3)
    except Exception:raise DriveError('Drive account read failed','DRIVE_ACCOUNT_READ_FAILED') from None
    if about.get('user',{}).get('emailAddress','').lower()!=email.lower():
        raise DriveError('wrong Google account','DRIVE_ACCOUNT_MISMATCH')
    query="mimeType='application/vnd.google-apps.folder' and trashed=false and appProperties has { key='adwaaPgBackupTarget' and value='"+PROJECT+"' }"
    try:folders=service.files().list(q=query,pageSize=100,fields='nextPageToken,files(id,appProperties)').execute(num_retries=3)
    except Exception:raise DriveError('Drive folder lookup failed','DRIVE_FOLDER_LOOKUP_FAILED') from None
    rows=[r for r in folders.get('files',[]) if r.get('appProperties',{}).get('adwaaPgBackupTarget')==PROJECT]
    if folders.get('nextPageToken') or len(rows)>1:raise DriveError('ambiguous dedicated folder','DRIVE_FOLDER_LOOKUP_AMBIGUOUS')
    return rows

def inspection_report(service,email):
    rows=inspect_folders(service,email)
    ids=[]
    for row in rows:
        folder_id=row.get('id','')
        if not isinstance(folder_id,str) or not re.fullmatch(r'[A-Za-z0-9_-]{8,200}',folder_id):
            raise DriveError('invalid folder metadata','DRIVE_FOLDER_METADATA_INVALID')
        try:DriveStore(service,folder_id,email,1)._metadata(folder_id,True)
        except Exception:raise DriveError('existing folder validation failed','DRIVE_EXISTING_FOLDER_VALIDATION_FAILED') from None
        ids.append(folder_id)
    # IDs are non-secret metadata; do not print email, token or arbitrary API fields.
    return {'project':PROJECT,'read_only':True,'account_verified':True,'folder_count':len(ids),'folder_ids':ids}

def initialize_folder(service,email):
    rows=inspect_folders(service,email)
    created=not rows
    if rows:file=rows[0]
    else:
        try:file=service.files().create(body={'name':'Adwaa PostgreSQL Encrypted Backups','mimeType':'application/vnd.google-apps.folder','appProperties':{'adwaaPgBackupTarget':PROJECT}},fields='id').execute(num_retries=0)
        except Exception:raise DriveError('Folder creation outcome unknown; inspect before retry','DRIVE_FOLDER_CREATE_UNCONFIRMED') from None
    try:DriveStore(service,file['id'],email,1)._metadata(file['id'],True)
    except Exception:
        code='DRIVE_NEW_FOLDER_VALIDATION_FAILED' if created else 'DRIVE_EXISTING_FOLDER_VALIDATION_FAILED'
        raise DriveError('Folder validation failed; inspect before retry',code) from None
    return file['id']
