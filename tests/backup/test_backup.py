"""No production connections, cloud writes or credentials."""
import base64,importlib.util,io,json,os,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('backup',ROOT/'tools/backup/backup.py');b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
class Storage:
    def get_object_lock_configuration(self,**kw):return {}
    def get_public_access_block(self,**kw):return {'PublicAccessBlockConfiguration':dict.fromkeys(['BlockPublicAcls','IgnorePublicAcls','BlockPublicPolicy','RestrictPublicBuckets'],True)}
    def get_bucket_policy_status(self,**kw):return {'PolicyStatus':{'IsPublic':False}}
    def get_bucket_versioning(self,**kw):return {'Status':'Enabled'}
    def get_bucket_lifecycle_configuration(self,**kw):return {'Rules':[{'Status':'Enabled','Filter':{'Prefix':b.PREFIX},'Expiration':{'Days':30},'NoncurrentVersionExpiration':{'NoncurrentDays':1}}]}
    def get_bucket_encryption(self,**kw):return {'ServerSideEncryptionConfiguration':{'Rules':[{'ApplyServerSideEncryptionByDefault':{'SSEAlgorithm':'AES256'}}]}}
    def get_bucket_ownership_controls(self,**kw):return {'OwnershipControls':{'Rules':[{'ObjectOwnership':'BucketOwnerEnforced'}]}}
class BackupTests(unittest.TestCase):
    def test_authenticated_streaming_and_no_plaintext(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'archive.enc';secret=os.urandom(32);plain=b'synthetic sensitive row'*100000
            b.seal(io.BytesIO(plain),p,secret,'project/id/database');out=io.BytesIO();b.unseal(p,out,secret,'project/id/database')
            self.assertEqual(out.getvalue(),plain);self.assertNotIn(b'synthetic sensitive row',p.read_bytes());self.assertEqual(p.stat().st_mode & 0o777,0o600)
    def test_tamper_wrong_key_aad_and_truncation_rejected(self):
        for fault in ['key','aad','ciphertext','tag','truncate']:
            with self.subTest(fault=fault),tempfile.TemporaryDirectory() as d:
                p=Path(d)/'a.enc';secret=os.urandom(32);b.seal(io.BytesIO(b'synthetic data'),p,secret,'expected')
                data=bytearray(p.read_bytes())
                if fault=='ciphertext':data[22]^=1
                if fault=='tag':data[-1]^=1
                if fault=='truncate':data=data[:10]
                p.write_bytes(data)
                with self.assertRaises(Exception):b.unseal(p,io.BytesIO(),os.urandom(32) if fault=='key' else secret,'other' if fault=='aad' else 'expected')
    def test_digest_size_and_changes(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'x';p.write_bytes(b'one');first=b.digest(p);p.write_bytes(b'two');self.assertNotEqual(first,b.digest(p));self.assertEqual(first['bytes'],3)
    def test_storage_policy_fails_closed(self):
        b.check_storage(Storage(),'test','123456789012')
        for method,response in [('get_public_access_block',{'PublicAccessBlockConfiguration':{}}),('get_bucket_policy_status',{'PolicyStatus':{'IsPublic':True}}),('get_bucket_versioning',{}),('get_bucket_lifecycle_configuration',{'Rules':[]}),('get_bucket_ownership_controls',{'OwnershipControls':{'Rules':[]}})]:
            with self.subTest(method=method),patch.object(Storage,method,return_value=response),self.assertRaises(b.GateError):b.check_storage(Storage(),'test','123456789012')
    def test_no_connection_without_tls_or_approved_project(self):
        for config in [{},{'PGSSLMODE':'require'},{'PGSSLMODE':'verify-full','PGHOST':'other.supabase.co','PGUSER':'postgres','PGPORT':'5432'},{'PGSSLMODE':'verify-full','PGHOST':'db.'+b.PROJECT+'.supabase.co','PGUSER':'postgres','PGPORT':'6543'}]:
            with patch.dict(os.environ,config,clear=True),patch.object(b.psycopg,'connect') as connect,self.assertRaises(b.GateError):b.source_connection()
            connect.assert_not_called()
    def test_no_cloud_without_cost_execution_approval(self):
        with patch.dict(os.environ,{},clear=True),patch.object(b.boto3,'client') as client,self.assertRaises(b.GateError):b.storage()
        client.assert_not_called()
    def test_export_process_receives_no_cloud_keys(self):
        with patch.dict(os.environ,{'PGPASSWORD':'synthetic-pg','BACKUP_ENCRYPTION_KEY':'synthetic-key','AWS_SECRET_ACCESS_KEY':'synthetic-cloud','BACKUP_DRIVE_CLIENT_SECRET':'synthetic-drive-secret','BACKUP_DRIVE_REFRESH_TOKEN':'synthetic-refresh'}):
            result=b.pg_env();self.assertNotIn('BACKUP_ENCRYPTION_KEY',result);self.assertNotIn('AWS_SECRET_ACCESS_KEY',result);self.assertNotIn('BACKUP_DRIVE_REFRESH_TOKEN',result);self.assertNotIn('BACKUP_DRIVE_CLIENT_SECRET',result);self.assertIn('default_transaction_read_only=on',result['PGOPTIONS'])
    def test_workflow_has_no_schedule_and_no_artifact_upload(self):
        text=(ROOT/'.github/workflows/database-backup.yml').read_text()
        self.assertNotIn('schedule:',text);self.assertNotIn('upload-artifact',text);self.assertNotIn('pull_request_target',text)
        self.assertIn('workflow_dispatch:',text);self.assertIn('environment: production-backup',text)
    def test_commit_marker_last_and_not_written_after_upload_failure(self):
        class Conn:
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def execute(self,q):
                value='snapshot' if 'pg_export_snapshot' in q else '[]'
                return type('R',(),{'fetchone':lambda self:(value,)})()
        class Store:
            def __init__(self,fail=False):self.events=[];self.fail=fail
            def upload_file(self,path,bucket,key,ExtraArgs):
                self.events.append(key)
                if self.fail:raise OSError('synthetic upload failure')
            def head_object(self,**kw):return {'ContentLength':3}
            def put_object(self,**kw):self.events.append(kw['Key'])
        def export(command,path,*args):path.write_bytes(b'enc')
        verification={'sequences':[],'roles':'[]','memberships':'[]'}
        for fail in [False,True]:
            store=Store(fail)
            with tempfile.TemporaryDirectory() as d,patch.object(b,'source_connection',return_value=Conn()),patch.object(b,'snapshot',return_value=dict(verification)),patch.object(b,'export',side_effect=export),patch.object(b,'key',return_value=os.urandom(32)):
                if fail:
                    with self.assertRaises(OSError):b.backup(store,'bucket','123456789012',d)
                    self.assertFalse(any(x.endswith('complete.json') for x in store.events))
                else:
                    # verification.enc has an authenticated header/payload/tag, not 3 bytes.
                    store.head_object=lambda **kw:{'ContentLength':Path(d,kw['Key'].split('/')[-1]).stat().st_size}
                    b.backup(store,'bucket','123456789012',d)
                    self.assertTrue(store.events[-1].endswith('complete.json'));self.assertEqual(len(store.events),4)
    def test_restore_fetches_remote_objects_and_rejects_changed_marker(self):
        backup_id='20261024T000000Z-'+'a'*32
        manifest={'project':b.PROJECT,'format':1,'backup_id':backup_id,'files':{p:{'bytes':3,'sha256':'x'} for p in b.PARTS}}
        class Store:
            def __init__(self):self.downloads=[]
            def get_object(self,**kw):return {'Body':io.BytesIO(json.dumps(manifest).encode())}
            def head_object(self,**kw):return {'ContentLength':3}
            def download_file(self,bucket,key,path,ExtraArgs):self.downloads.append(key);Path(path).write_bytes(b'enc')
        with tempfile.TemporaryDirectory() as d:
            store=Store();b.fetch_committed(store,'bucket','123456789012',manifest,d)
            self.assertEqual(len(store.downloads),3)
            with patch.object(store,'get_object',return_value={'Body':io.BytesIO(b'{}')}),self.assertRaises(b.GateError):b.fetch_committed(store,'bucket','123456789012',manifest,d)
    def test_missing_or_stale_remote_backup_is_not_a_success(self):
        class Pages:
            def paginate(self,**kw):return [{'Contents':[]}]
        store=type('S',(),{'get_paginator':lambda self,*args:Pages()})()
        with tempfile.TemporaryDirectory() as d,self.assertRaises(b.GateError):b.latest(store,'bucket','owner',d)
    def test_export_uses_pinned_clients_without_password_in_argv(self):
        class Process:
            def __init__(self):self.stdout=io.BytesIO(b'synthetic dump')
            def wait(self,**kw):return 0
            def poll(self):return 0
        with tempfile.TemporaryDirectory() as d,patch.dict(os.environ,{'PGSSLROOTCERT':'/tmp/synthetic-ca','PGPASSWORD':'synthetic-password','AWS_SECRET_ACCESS_KEY':'synthetic-cloud'}),patch.object(b.subprocess,'Popen',return_value=Process()) as process,patch.object(b.subprocess,'run'):
            b.export(['pg_dump','--no-password'],Path(d)/'dump.enc',os.urandom(32),'aad')
            call=process.call_args;self.assertIn(b.IMAGE,call.args[0]);self.assertIn('pg_dump',call.args[0]);self.assertNotIn('synthetic-password',str(call.args[0]));self.assertNotIn('AWS_SECRET_ACCESS_KEY',call.kwargs['env'])
    def test_corrupt_archive_cannot_start_restore_container(self):
        with tempfile.TemporaryDirectory() as d,patch.object(b,'key',return_value=os.urandom(32)),patch.object(b,'docker') as docker:
            for part in b.PARTS:Path(d,part+'.enc').write_bytes(b'corrupt')
            manifest={'format':1,'project':b.PROJECT,'backup_id':'20261024T000000Z-'+'a'*32,'files':{p:{'bytes':1,'sha256':'wrong'} for p in b.PARTS}}
            with self.assertRaises(b.GateError):b.isolated_restore(d,manifest)
            docker.assert_not_called()
    def test_accidental_schedule_cannot_connect_without_approval(self):
        with patch.dict(os.environ,{'GITHUB_REF':'refs/heads/main','GITHUB_EVENT_NAME':'schedule'},clear=True),patch.object(b.sys,'argv',['backup.py','backup']),patch.object(b,'storage') as storage,self.assertRaises(b.GateError):b.main()
        storage.assert_not_called()
    def test_quote_untrusted_identifier(self):self.assertEqual(b.quote('x";DROP'),'"x"";DROP"')
if __name__=='__main__':unittest.main()
