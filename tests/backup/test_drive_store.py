"""Drive API doubles only. No Google credentials or existing files touched."""
import hashlib,importlib.util,io,os,tempfile,unittest,sys
from datetime import datetime,timezone
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'tools/backup'))
import drive_store as d
EMAIL='synthetic@example.invalid';FOLDER='dedicated-pg-folder';OLD='legacy-json-folder'
OLD_ID='20260101T000000Z-'+'a'*32;CURRENT='20261025T000000Z-'+'b'*32

def metadata(file_id,key=None,data=b'',parent=FOLDER):
    return {'id':file_id,'name':'synthetic','mimeType':'application/octet-stream','size':str(len(data)),'sha256Checksum':hashlib.sha256(data).hexdigest(),'createdTime':'2026-01-01T00:00:00Z','appProperties':{'adwaaPgBackup':d.PROJECT,'objectKey':key,'backupId':key[len(d.PREFIX):].split('/')[0]} if key else {},'parents':[parent],'shared':False,'owners':[{'emailAddress':EMAIL}],'permissions':[{'type':'user','role':'owner'}],'capabilities':{'canAddChildren':True,'canListChildren':True}}
class Request:
    def __init__(self,callback):self.callback=callback
    def execute(self,**kwargs):return self.callback()
class Download:
    def __init__(self,sink,request,**kwargs):self.sink=sink;self.request=request
    def next_chunk(self,**kwargs):self.sink.write(self.request);return None,True
class Service:
    def __init__(self):
        self.rows={FOLDER:metadata(FOLDER)};self.rows[FOLDER].update(mimeType='application/vnd.google-apps.folder',appProperties={'adwaaPgBackupTarget':d.PROJECT})
        self.rows['legacy']=metadata('legacy',None,b'previous JSON',OLD);self.payloads={'legacy':b'previous JSON'}
        self.generated=0;self.uploaded=0;self.deleted=[];self.queries=[];self.fail_reply=False;self.deny=False;self.email=EMAIL;self.free=10**10
    def files(self):return self
    def about(self):return self
    def get(self,**kwargs):
        if 'fileId' not in kwargs:return Request(lambda:{'user':{'emailAddress':self.email},'storageQuota':{'limit':str(self.free),'usage':'0'}})
        def read():
            if self.deny:raise TimeoutError('synthetic ambiguous lookup')
            return dict(self.rows[kwargs['fileId']])
        return Request(read)
    def list(self,**kwargs):self.queries.append(kwargs['q']);return Request(lambda:{'files':[r for id,r in self.rows.items() if id!=FOLDER]})
    def generateIds(self,**kwargs):
        def generate():self.generated+=1;return {'ids':['allocated-'+str(self.generated)]}
        return Request(generate)
    def create(self,body,media_body=None,**kwargs):
        service=self
        class Upload:
            def next_chunk(self,**kwargs):
                file_id=body['id'];raw=media_body.getbytes(0,media_body.size())
                if file_id in service.rows:raise ValueError('duplicate synthetic id')
                key=body['appProperties']['objectKey'];service.rows[file_id]=metadata(file_id,key,raw);service.payloads[file_id]=raw;service.uploaded+=1
                if service.fail_reply:service.fail_reply=False;raise TimeoutError('synthetic lost commit reply')
                return None,{'id':file_id}
        return Upload()
    def get_media(self,fileId):return self.payloads[fileId]
    def delete(self,fileId):
        def delete():self.deleted.append(fileId);self.rows.pop(fileId,None);self.payloads.pop(fileId,None);return {}
        return Request(delete)
class DriveTests(unittest.TestCase):
    def setUp(self):self.service=Service();self.store=d.DriveStore(self.service,FOLDER,EMAIL,100000)
    def test_private_account_namespace_and_quota(self):
        self.store.preflight();self.assertTrue(all(FOLDER in q and OLD not in q for q in self.service.queries))
        self.service.email='wrong@example.invalid'
        with self.assertRaises(d.DriveError):self.store.preflight()
    def test_public_folder_and_legacy_folder_refused(self):
        self.service.rows[FOLDER]['shared']=True
        with self.assertRaises(d.DriveError):self.store.preflight()
        self.service.rows[FOLDER]['shared']=False;self.service.rows[FOLDER]['appProperties']={}
        with self.assertRaises(d.DriveError):self.store.preflight()
    def test_quota_and_oversized_bundle_fail_before_upload(self):
        self.service.free=1000
        with self.assertRaises(d.DriveError):self.store.preflight()
        with self.assertRaises(d.DriveError):self.store.ensure_capacity(100001)
        self.assertEqual(self.service.uploaded,0)
    def test_lost_reply_retry_is_one_drive_file(self):
        key=d.PREFIX+CURRENT+'/database.enc';self.service.fail_reply=True
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'cipher';path.write_bytes(b'synthetic encrypted bytes')
            self.store.upload_file(str(path),FOLDER,key);self.store.upload_file(str(path),FOLDER,key)
        self.assertEqual(self.service.uploaded,1);self.assertEqual(self.service.generated,1);self.assertEqual(self.service.payloads['legacy'],b'previous JSON')
    def test_conflicting_existing_content_is_never_overwritten(self):
        key=d.PREFIX+CURRENT+'/complete.json'
        self.store.put_object(Bucket=FOLDER,Key=key,Body=b'one')
        with self.assertRaises(d.DriveError):self.store.put_object(Bucket=FOLDER,Key=key,Body=b'two')
        self.assertEqual(self.service.uploaded,1)
    def test_encrypted_download_and_marker_readback(self):
        key=d.PREFIX+CURRENT+'/verification.enc';marker=d.PREFIX+CURRENT+'/complete.json'
        self.store.put_object(Bucket=FOLDER,Key=key,Body=b'opaque encrypted bytes');self.store.put_object(Bucket=FOLDER,Key=marker,Body=b'{}')
        with patch.object(d,'MediaIoBaseDownload',Download),tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'download';self.store.download_file(FOLDER,key,str(path));self.assertEqual(path.read_bytes(),b'opaque encrypted bytes');self.assertEqual(path.stat().st_mode & 0o777,0o600)
            self.assertEqual(self.store.get_object(Bucket=FOLDER,Key=marker)['Body'].read(),b'{}')
    def test_ambiguous_outcome_cannot_allocate_a_second_id(self):
        key=d.PREFIX+CURRENT+'/database.enc';self.store.ids[key]='unknown-id'
        with patch.object(d.time,'sleep'),self.assertRaises(d.DriveError):self.store.put_object(Bucket=FOLDER,Key=key,Body=b'cipher')
        self.assertEqual(self.service.generated,0);self.assertEqual(self.service.uploaded,0)
    def test_retention_disabled_preserves_everything(self):
        key=d.PREFIX+OLD_ID+'/database.enc';self.service.rows['old-pg']=metadata('old-pg',key,b'cipher')
        with patch.dict(os.environ,{'BACKUP_DRIVE_RETENTION_APPROVED':'false'},clear=True):result=self.store.finish_retention({})
        self.assertFalse(result['deletion_enabled']);self.assertEqual(self.service.deleted,[]);self.assertIn('legacy',self.service.rows)
    def test_future_cleanup_never_targets_legacy_or_fresh_or_other_folders(self):
        self.service.rows['old-pg']=metadata('old-pg',d.PREFIX+OLD_ID+'/database.enc',b'cipher')
        self.service.rows['fresh-pg']=metadata('fresh-pg',d.PREFIX+CURRENT+'/database.enc',b'cipher');self.service.rows['fresh-pg']['createdTime']='2026-10-25T00:00:00Z'
        result={'restore_verified':True,'project':d.PROJECT,'backup_id':CURRENT}
        with patch.dict(os.environ,{'BACKUP_DRIVE_RETENTION_APPROVED':'true','BACKUP_PRODUCTION_RESTORE_VERIFIED':'true'},clear=True):self.store.finish_retention(result,datetime(2026,10,25,1,tzinfo=timezone.utc))
        self.assertEqual(self.service.deleted,['old-pg']);self.assertIn('legacy',self.service.rows);self.assertIn('fresh-pg',self.service.rows)
    def test_cleanup_requires_production_and_fresh_current_restore(self):
        with patch.dict(os.environ,{'BACKUP_DRIVE_RETENTION_APPROVED':'true'},clear=True),self.assertRaises(d.DriveError):self.store.finish_retention({'restore_verified':True})
        self.assertEqual(self.service.deleted,[])
    def test_retention_rejects_a_tagged_file_moved_outside_target(self):
        self.service.rows['moved']=metadata('moved',d.PREFIX+OLD_ID+'/database.enc',b'cipher',OLD)
        result={'restore_verified':True,'project':d.PROJECT,'backup_id':CURRENT}
        with patch.dict(os.environ,{'BACKUP_DRIVE_RETENTION_APPROVED':'true','BACKUP_PRODUCTION_RESTORE_VERIFIED':'true'},clear=True),self.assertRaises(d.DriveError):self.store.finish_retention(result,datetime(2026,10,25,1,tzinfo=timezone.utc))
        self.assertEqual(self.service.deleted,[])
    def test_activation_plan_is_3am_riyadh_and_disabled(self):
        import json
        from zoneinfo import ZoneInfo
        plan=json.loads((Path(__file__).resolve().parents[2]/'docs/backup/activation-plan.json').read_text())
        self.assertEqual(plan['daily_cron_utc'],'0 0 * * *');self.assertFalse(plan['enabled']);self.assertFalse(plan['deletion_enabled'])
        self.assertEqual(datetime(2026,10,25,tzinfo=timezone.utc).astimezone(ZoneInfo('Asia/Riyadh')).hour,3)
    def test_setup_reuses_only_marked_new_folder(self):
        with patch.object(self.service,'list',return_value=Request(lambda:{'files':[self.service.rows[FOLDER]]})),patch.object(self.service,'create') as create:
            self.assertEqual(d.initialize_folder(self.service,EMAIL),FOLDER)
        create.assert_not_called();self.assertIn('legacy',self.service.rows)
    def test_setup_creates_new_folder_instead_of_adopting_legacy(self):
        calls=[]
        def create(body,**kwargs):
            calls.append(body)
            file=metadata('new-folder');file.update(mimeType=body['mimeType'],appProperties=body['appProperties']);self.service.rows[file['id']]=file
            return Request(lambda:{'id':file['id']})
        with patch.object(self.service,'list',return_value=Request(lambda:{'files':[self.service.rows['legacy']]})),patch.object(self.service,'create',side_effect=create):self.assertEqual(d.initialize_folder(self.service,EMAIL),'new-folder')
        self.assertEqual(calls[0]['appProperties'],{'adwaaPgBackupTarget':d.PROJECT});self.assertNotIn('parents',calls[0]);self.assertEqual(self.service.payloads['legacy'],b'previous JSON')
    def test_full_drive_scope_rejected_and_no_client_created(self):
        for scopes in [['https://www.googleapis.com/auth/drive'],None]:
            creds=type('C',(),{'refresh':lambda self,*a:None,'granted_scopes':scopes})()
            with self.subTest(scopes=scopes),patch.dict(os.environ,{'BACKUP_DRIVE_REFRESH_TOKEN':'synthetic','BACKUP_DRIVE_CLIENT_ID':'synthetic','BACKUP_DRIVE_CLIENT_SECRET':'synthetic'}),patch.object(d,'Credentials',return_value=creds),patch.object(d,'build') as build,self.assertRaises(d.DriveError):d.authenticate()
            build.assert_not_called()
    def test_oauth_errors_are_fixed_codes_not_exception_payloads(self):
        from google.auth.exceptions import RefreshError
        cases=[('invalid_grant','OAUTH_INVALID_GRANT'),('invalid_client','OAUTH_INVALID_CLIENT'),('access_denied','OAUTH_ACCESS_DENIED'),('invalid_scope','OAUTH_INVALID_SCOPE'),('unknown-sensitive-value','OAUTH_REFRESH_FAILED')]
        for reason,expected in cases:
            creds=type('C',(),{'refresh':lambda self,*a:None})()
            with self.subTest(reason=expected),patch.dict(os.environ,{'BACKUP_DRIVE_REFRESH_TOKEN':'synthetic','BACKUP_DRIVE_CLIENT_ID':'synthetic','BACKUP_DRIVE_CLIENT_SECRET':'synthetic'}),patch.object(d,'Credentials',return_value=creds),patch.object(creds,'refresh',side_effect=RefreshError('SYNTHETIC-DO-NOT-LOG',{'error':reason,'error_description':'SYNTHETIC-DO-NOT-LOG'})),patch.object(d,'build') as build:
                with self.assertRaises(d.DriveError) as error:d.authenticate()
                self.assertEqual(d.safe_diagnostic(error.exception),expected)
                self.assertNotIn('SYNTHETIC',d.safe_diagnostic(error.exception));build.assert_not_called()
        self.assertEqual(d.safe_diagnostic(d.DriveError('SYNTHETIC',code='SYNTHETIC')),'DRIVE_GATE_FAILED')
    def test_cli_reports_only_allowlisted_code_without_exception_secrets(self):
        import contextlib,runpy
        stderr=io.StringIO()
        config={'GITHUB_REF':'refs/heads/ops/encrypted-daily-backup-20261024','BACKUP_COST_APPROVED':'true','BACKUP_DRIVE_SETUP_APPROVED':'true','BACKUP_DRIVE_ACCOUNT':EMAIL}
        path=Path(__file__).resolve().parents[2]/'tools/backup/backup.py'
        with patch.dict(os.environ,config,clear=True),patch.object(sys,'argv',['backup.py','init-drive']),patch.object(d,'authenticate',side_effect=d.DriveError('SYNTHETIC-SECRET-DO-NOT-LOG','OAUTH_INVALID_GRANT')),contextlib.redirect_stderr(stderr),self.assertRaises(SystemExit) as exit:
            runpy.run_path(str(path),run_name='__main__')
        self.assertEqual(exit.exception.code,1)
        self.assertIn('Drive diagnostic code: OAUTH_INVALID_GRANT',stderr.getvalue())
        self.assertNotIn('SYNTHETIC-SECRET',stderr.getvalue())

    def test_real_google_credentials_scope_confirmation_remains_fail_closed(self):
        from datetime import timedelta
        from google.auth import _helpers
        for response,expected in [({},'OAUTH_SCOPE_UNCONFIRMED'),({'scope':d.SCOPE},None),({'scope':d.SCOPE+' https://www.googleapis.com/auth/drive'},'OAUTH_SCOPE_REJECTED')]:
            grant=('synthetic-access','synthetic-refresh',_helpers.utcnow()+timedelta(hours=1),response,None)
            with self.subTest(expected=expected),patch.dict(os.environ,{'BACKUP_DRIVE_REFRESH_TOKEN':'synthetic','BACKUP_DRIVE_CLIENT_ID':'synthetic','BACKUP_DRIVE_CLIENT_SECRET':'synthetic'}),patch('google.oauth2.reauth.refresh_grant',return_value=grant),patch.object(d,'build',return_value='synthetic-service') as build:
                if expected:
                    with self.assertRaises(d.DriveError) as error:d.authenticate()
                    self.assertEqual(d.safe_diagnostic(error.exception),expected);build.assert_not_called()
                else:self.assertEqual(d.authenticate(),'synthetic-service');build.assert_called_once()
    def test_read_only_folder_inspection_never_creates_or_modifies(self):
        with patch.object(self.service,'list',return_value=Request(lambda:{'files':[self.service.rows[FOLDER]]})),patch.object(self.service,'create') as create:
            rows=d.inspect_folders(self.service,EMAIL)
            self.assertEqual(rows[0]['id'],FOLDER);create.assert_not_called()
        self.assertEqual(self.service.deleted,[])
        with self.assertRaises(d.DriveError) as error:d.inspect_folders(self.service,'different@example.invalid')
        self.assertEqual(d.safe_diagnostic(error.exception),'DRIVE_ACCOUNT_MISMATCH')
    def test_created_folder_failure_is_reported_and_reused_not_duplicated(self):
        calls=[]
        def create(body,**kwargs):
            calls.append(body);file=metadata('created-before-validation');file.update(mimeType=body['mimeType'],appProperties=body['appProperties']);self.service.rows[file['id']]=file
            return Request(lambda:{'id':file['id']})
        def listing(**kwargs):return Request(lambda:{'files':[row for key,row in self.service.rows.items() if key not in [FOLDER,'legacy']]})
        with patch.object(self.service,'list',side_effect=listing),patch.object(self.service,'create',side_effect=create),patch.object(d.DriveStore,'_metadata',side_effect=TimeoutError('SYNTHETIC-DO-NOT-LOG')):
            with self.assertRaises(d.DriveError) as error:d.initialize_folder(self.service,EMAIL)
            self.assertEqual(d.safe_diagnostic(error.exception),'DRIVE_NEW_FOLDER_VALIDATION_FAILED')
        with patch.object(self.service,'list',side_effect=listing),patch.object(self.service,'create',side_effect=create):
            self.assertEqual(d.initialize_folder(self.service,EMAIL),'created-before-validation')
        self.assertEqual(len(calls),1);self.assertEqual(self.service.payloads['legacy'],b'previous JSON')
    def test_ambiguous_create_and_lookup_fail_without_retrying_writes(self):
        with patch.object(self.service,'list',return_value=Request(lambda:{'files':[]})),patch.object(self.service,'create',side_effect=TimeoutError('SYNTHETIC-DO-NOT-LOG')) as create:
            with self.assertRaises(d.DriveError) as error:d.initialize_folder(self.service,EMAIL)
            self.assertEqual(d.safe_diagnostic(error.exception),'DRIVE_FOLDER_CREATE_UNCONFIRMED');self.assertEqual(create.call_count,1)
        with patch.object(self.service,'list',side_effect=TimeoutError('SYNTHETIC-DO-NOT-LOG')),patch.object(self.service,'create') as create:
            with self.assertRaises(d.DriveError) as error:d.initialize_folder(self.service,EMAIL)
            self.assertEqual(d.safe_diagnostic(error.exception),'DRIVE_FOLDER_LOOKUP_FAILED');create.assert_not_called()
if __name__=='__main__':unittest.main()
