"""Synthetic objects and HTTP doubles only; never customer data or live APIs."""
import copy,io,json,os,tempfile,unittest,sys,subprocess
from pathlib import Path
from unittest.mock import patch,MagicMock
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'tools/backup'))
import backup as b
import storage_source as s
from targets import PROJECT

class Result:
    def __init__(self,rows):self.rows=rows
    def fetchone(self):return self.rows[0]
    def fetchall(self):return self.rows
class Conn:
    def __init__(self,objects=None,buckets=None):
        self.objects=copy.deepcopy(objects if objects is not None else [{'id':'synthetic-id','bucket_id':'private','name':'folder/صورة %.bin','version':'synthetic-v1','updated_at':'2026-10-25T00:00:00Z','metadata':{'size':3}}])
        self.buckets=copy.deepcopy(buckets if buckets is not None else [{'id':'private','name':'private','public':False}])
    def __enter__(self):return self
    def __exit__(self,*args):pass
    def execute(self,q):
        if 'to_regclass' in q:return Result([(True,)])
        return Result([(x,) for x in (self.buckets if 'storage.buckets' in q else self.objects)])
class Response:
    def __init__(self,data,status=200,size=None):self.raw=io.BytesIO(data);self.status_code=status;self.headers={'Content-Length':str(len(data) if size is None else size)};self.closed=False
    def __enter__(self):return self
    def __exit__(self,*args):self.close()
    def close(self):self.closed=True
class API:
    def __init__(self,objects=None):self.objects=objects or {('private','folder/صورة %.bin'):b'abc'};self.closed=False
    def check_buckets(self,buckets):pass
    def object(self,bucket,name):return Response(self.objects[bucket,name])
    def close(self):self.closed=True
class StorageTests(unittest.TestCase):
    def test_ram_stage_does_not_send_unvalidated_or_oversized_plaintext(self):
        from cryptography.exceptions import InvalidTag
        def invalid(sink):
            sink.write(b'abc')
            raise InvalidTag()
        with patch('docker.APIClient') as run:
            with self.assertRaises(InvalidTag):b.stage_file('adwaa-backup-restore-aaaaaaaaaaaa','/tmp/database',3,invalid)
            with self.assertRaises(b.GateError):b.stage_file('adwaa-backup-restore-aaaaaaaaaaaa','/tmp/database',3,lambda sink:sink.write(b'abcd'))
            run.assert_not_called()
    def test_restore_uses_sealed_ram_fd_including_empty_file(self):
        import hashlib,tarfile,fcntl
        from types import SimpleNamespace
        for payload in [b'',b'abc']:
            archive_bytes=io.BytesIO()
            with tarfile.open(fileobj=archive_bytes,mode='w') as archive:
                member=tarfile.TarInfo('object-00000000');member.size=len(payload)
                archive.addfile(member,io.BytesIO(payload))
            conn=Conn(objects=[dict(Conn().objects[0],metadata={'size':len(payload)})])
            verification={'inventory':s.inventory(conn),'files':[{'member':'object-00000000','bucket':'private','name':conn.objects[0]['name'],'bytes':len(payload),'sha256':hashlib.sha256(payload).hexdigest()}]}
            class Reader:
                stdout=io.BytesIO(archive_bytes.getvalue())
                def wait(self,**kwargs):return 0
                def poll(self):return 0
            copied=[]
            def fake_run(args,**kwargs):
                if '-i' in args:
                    copied.append(kwargs['stdin'].read())
                    return subprocess.CompletedProcess(args,0,b'',b'')
                copied.append(('size',len(payload)))
                return subprocess.CompletedProcess(args,0,(str(len(payload))+'\n').encode(),b'')
            fake_engine=SimpleNamespace(stage_file=b.stage_file,docker=lambda *args,**kwargs:SimpleNamespace(stdout=(hashlib.sha256(payload).hexdigest()+'  file').encode()))
            with patch('subprocess.Popen',return_value=Reader()),patch.object(b.subprocess,'run',side_effect=fake_run):
                result=s.restore(fake_engine,'adwaa-backup-restore-aaaaaaaaaaaa',verification)
            self.assertEqual(copied[0],payload)
            self.assertEqual(copied[1],('size',len(payload)))
            self.assertTrue(result['storage_files_verified'])
    def test_read_only_http_fixed_origin_redirects_and_redaction(self):
        with patch.dict(os.environ,{'BACKUP_CONFIRMED_PROJECT_REF':PROJECT,'BACKUP_STORAGE_API_KEY':'sb_secret_synthetic-only'}),patch.object(s.requests,'Session') as factory:
            session=factory.return_value;session.get.return_value=Response(b'error containing a synthetic token',403)
            source=s.Source()
            with self.assertRaises(s.StorageError) as error:source.object('private','folder/صورة %.bin')
            self.assertNotIn('token',str(error.exception))
            call=session.get.call_args
            self.assertTrue(call.args[0].startswith('https://'+PROJECT+'.supabase.co/storage/v1/object/authenticated/private/'))
            self.assertIn('%25',call.args[0]);self.assertFalse(call.kwargs['allow_redirects']);session.post.assert_not_called();session.delete.assert_not_called()
    def test_unconfirmed_or_public_key_cannot_connect(self):
        for config in [{},{'BACKUP_CONFIRMED_PROJECT_REF':PROJECT,'BACKUP_STORAGE_API_KEY':'sb_publishable_synthetic'}]:
            with patch.dict(os.environ,config,clear=True),patch.object(s.requests,'Session') as session,self.assertRaises(s.StorageError):s.Source()
            session.assert_not_called()
    def test_inventory_rejects_duplicates_unknown_bucket_paths_missing_version_or_size(self):
        original=Conn().objects[0]
        variants=[[original,original],[dict(original,bucket_id='missing')],[dict(original,name='../escape')],[dict(original,version=None)],[dict(original,metadata={})]]
        for rows in variants:
            with self.subTest(rows=len(rows)),self.assertRaises(s.StorageError):s.inventory(Conn(objects=rows))
    def test_sql_inventory_has_no_pagination_omissions(self):
        rows=[dict(Conn().objects[0],id=str(i),name=str(i)) for i in range(1201)]
        self.assertEqual(len(s.inventory(Conn(objects=rows))['objects']),1201)
    def test_capture_encrypts_names_and_bytes_and_has_inventory_hashes(self):
        conn=Conn()
        with tempfile.TemporaryDirectory() as d,patch.object(b,'source_connection',return_value=conn):
            path=Path(d)/'storage.enc';secret=os.urandom(32)
            result=s.capture(b,conn,path,secret,'aad',API())
            self.assertEqual(result['files'][0]['bytes'],3)
            self.assertNotEqual(b'abc',path.read_bytes());self.assertNotIn('صورة'.encode(),path.read_bytes())
            out=io.BytesIO();b.unseal(path,out,secret,'aad');self.assertIn(b'abc',out.getvalue())
    def test_change_truncation_or_capacity_cannot_certify_capture(self):
        for fault in ['change','length','short','capacity']:
            conn=Conn();current=Conn()
            if fault=='change':current.objects[0]['version']='changed'
            api=API()
            if fault=='length':api.object=lambda *a:Response(b'ab',size=2)
            if fault=='short':api.object=lambda *a:Response(b'ab',size=3)
            with self.subTest(fault=fault),tempfile.TemporaryDirectory() as d,patch.object(b,'source_connection',return_value=current),patch.dict(os.environ,{'BACKUP_MAX_STORAGE_BYTES':'1' if fault=='capacity' else '100'}),self.assertRaises((s.StorageError,OSError)):
                s.capture(b,conn,Path(d)/'s.enc',os.urandom(32),'aad',api)
    def test_empty_buckets_and_zero_length_objects_preserved(self):
        rows=[dict(Conn().objects[0],name='empty',metadata={'size':0})];conn=Conn(objects=rows)
        with tempfile.TemporaryDirectory() as d,patch.object(b,'source_connection',return_value=conn):
            result=s.capture(b,conn,Path(d)/'s.enc',os.urandom(32),'aad',API({('private','empty'):b''}))
            self.assertEqual(result['files'][0]['bytes'],0)
        conn=Conn(objects=[])
        with tempfile.TemporaryDirectory() as d,patch.object(b,'source_connection',return_value=conn):
            result=s.capture(b,conn,Path(d)/'s.enc',os.urandom(32),'aad',API())
            self.assertEqual(result['files'],[]);self.assertEqual(len(result['inventory']['buckets']),1)
    def test_foreign_project_archive_rejected_before_docker(self):
        with patch.object(b,'docker') as docker,self.assertRaises(b.GateError):b.isolated_restore('/nonexistent',{'format':2,'project':'foreign'})
        docker.assert_not_called()
    def test_actual_bucket_response_must_match_sql(self):
        with patch.dict(os.environ,{'BACKUP_CONFIRMED_PROJECT_REF':PROJECT,'BACKUP_STORAGE_API_KEY':'sb_secret_synthetic-only'}),patch.object(s.requests,'Session') as factory:
            factory.return_value.get.return_value=Response(b'[]')
            source=s.Source()
            with self.assertRaises(s.StorageError):source.check_buckets(Conn().buckets)
    def test_workflows_cover_both_projects_without_enabling_schedule(self):
        root=Path(__file__).resolve().parents[2]
        text=(root/'.github/workflows/database-backup.yml').read_text()
        self.assertIn('target: core',text);self.assertIn('target: portal',text);self.assertIn('BACKUP_{0}_STORAGE_API_KEY',text)
        self.assertNotIn('schedule:',text);self.assertIn("BACKUP_DRIVE_RETENTION_APPROVED: 'false'",text)
        for forbidden in ['upload-artifact','pull_request_target']:self.assertNotIn(forbidden,text)
if __name__=='__main__':unittest.main()
