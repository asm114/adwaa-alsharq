import base64,hashlib,io,json,os,sys,tarfile,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from urllib.parse import unquote,urlsplit
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'tools/backup'))
import storage_api_restore as a
import backup as b
from cryptography.exceptions import InvalidTag

REF='abcdefghijklmnopqrst'
class Response:
    def __init__(self,value,status=200):
        self.data=value if isinstance(value,bytes) else json.dumps(value).encode()
        self.raw=io.BytesIO(self.data);self.status_code=status
    def __enter__(self):return self
    def __exit__(self,*args):self.close()
    def close(self):pass
    def iter_content(self,size):
        for i in range(0,len(self.data),size):yield self.data[i:i+size]

class Session:
    def __init__(self):self.headers={};self.calls=[];self.buckets={};self.files={};self.fail_upload=False;self.corrupt=False
    def close(self):pass
    def request(self,method,url,**kw):
        self.calls.append((method,url,kw))
        assert kw['allow_redirects'] is False
        assert url.startswith('https://'+REF+'.supabase.co/storage/v1/')
        route=urlsplit(url).path.split('/storage/v1/',1)[1]
        if route=='bucket':
            if method=='GET':return Response(list(self.buckets.values()))
            data=kw['json'];self.buckets[data['id']]=data;return Response(data)
        if route.startswith('object/list/'):
            bucket=unquote(route[len('object/list/'):]);prefix=kw['json']['prefix'];rows={}
            for (bid,name),data in self.files.items():
                if bid!=bucket or not name.startswith(prefix):continue
                tail=name[len(prefix):]
                if '/' in tail:rows[tail.split('/')[0]]={'name':tail.split('/')[0],'id':None}
                else:rows[tail]={'name':tail,'id':'synthetic-id'}
            offset=kw['json']['offset'];return Response([rows[k] for k in sorted(rows)][offset:offset+100])
        if route.startswith('object/authenticated/'):
            bucket,name=unquote(route[len('object/authenticated/'):]).split('/',1)
            return Response(self.files[(bucket,name)]+(b'changed' if self.corrupt else b''))
        if route.startswith('object/'):
            if self.fail_upload:return Response({},409)
            bucket,name=unquote(route[len('object/'):]).split('/',1)
            assert kw['headers']['x-upsert']=='false'
            assert (bucket,name) not in self.files
            self.files[(bucket,name)]=kw['data'].read();return Response({'Key':'not-logged'})
        raise AssertionError('unexpected endpoint')


def fixture():
    payloads=[('bucket-one','عقد %.pdf',b'synthetic bytes'),('bucket-two','nested/empty',b''),
              ('bucket-two','nested/file',b'synthetic large'*1000)]
    index=[];objects=[];raw=io.BytesIO()
    with tarfile.open(fileobj=raw,mode='w',format=tarfile.USTAR_FORMAT) as archive:
        for i,(bucket,name,data) in enumerate(payloads):
            member='object-'+str(i).zfill(8);info=tarfile.TarInfo(member);info.size=len(data)
            archive.addfile(info,io.BytesIO(data));index.append({'member':member,'bucket':bucket,'name':name,
                'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
            objects.append({'bucket_id':bucket,'name':name,'metadata':{'size':len(data),'mimetype':'application/octet-stream'}})
    raw.seek(0)
    return raw,{'files':index,'inventory':{'buckets':[{'id':'bucket-one','public':True},
        {'id':'bucket-two','public':False},{'id':'empty-bucket','public':False}],'objects':objects}}

class StorageApiRestoreTests(unittest.TestCase):
    def test_cleanup_error_cannot_retain_a_success_report_or_expose_exception(self):
        import storage_api_check as check
        from contextlib import redirect_stdout
        def execute(report):
            report.update(code='STORAGE_API_RESTORE_VERIFIED',storage_service_restore_verified=True)
            raise RuntimeError('synthetic-sensitive-exception-must-not-appear')
        output=io.StringIO()
        with patch.object(check,'execute',side_effect=execute),patch.dict(os.environ,{},clear=True),redirect_stdout(output):
            self.assertEqual(check.main(),1)
        report=json.loads(output.getvalue())
        self.assertEqual(report['code'],'STORAGE_API_TEST_FAILED')
        self.assertFalse(report['storage_service_restore_verified'])
        self.assertNotIn('synthetic-sensitive',output.getvalue())

    def test_local_service_requires_internal_network_no_ports_or_volumes(self):
        from types import SimpleNamespace
        from local_storage_service import LocalSandbox
        from copy import deepcopy
        attrs={'HostConfig':{'PortBindings':{},'Binds':None,'LogConfig':{'Type':'none'}},
               'NetworkSettings':{'Networks':{'isolated':{'IPAddress':'172.29.0.2'}}}}
        network=SimpleNamespace(name='isolated',attrs={'Internal':True},reload=lambda:None)
        container=SimpleNamespace(attrs=attrs,reload=lambda:None)
        sandbox=LocalSandbox(container,network,'synthetic-test-token')
        self.assertFalse(sandbox.session.trust_env)
        self.assertEqual(sandbox.base,'http://172.29.0.2:5000/');sandbox.close()
        for delta in ['external','ports','volumes','logs','public-address']:
            container.attrs=deepcopy(attrs);network.attrs={'Internal':True}
            if delta=='external':network.attrs['Internal']=False
            elif delta=='ports':container.attrs['HostConfig']['PortBindings']={'5000/tcp':[{'HostPort':'5000'}]}
            elif delta=='volumes':container.attrs['HostConfig']['Binds']=['/host:/data']
            elif delta=='logs':container.attrs['HostConfig']['LogConfig']['Type']='json-file'
            else:container.attrs['NetworkSettings']['Networks']['isolated']['IPAddress']='8.8.8.8'
            with self.assertRaises(a.ApiRestoreError):LocalSandbox(container,network,'synthetic-test-token')

    def sandbox(self,session):return a.Sandbox(REF,REF,'sb_secret_synthetic-target-key','true',session)
    def test_official_routes_readback_inventory_and_private_buckets(self):
        session=Session();stream,verification=fixture();report={}
        result=a.restore(self.sandbox(session),stream,verification,report)
        self.assertTrue(result['storage_service_restore_verified']);self.assertEqual(result['objects_verified'],3)
        self.assertEqual(len(session.files),3);self.assertEqual(len(session.buckets),3)
        self.assertTrue(all(bucket['public'] is False for bucket in session.buckets.values()))
        self.assertFalse(result['reupload_metadata_identical'])
        self.assertTrue(any('object/list/' in call[1] for call in session.calls))
        self.assertTrue(all(call[0] in ('GET','POST') for call in session.calls))

    def test_production_refs_confirmation_scope_and_methods_rejected(self):
        session=Session()
        for ref in a.TARGETS.values():
            with self.assertRaises(a.ApiRestoreError):a.Sandbox(ref,ref,'sb_secret_fake','true',session)
        for ref,confirmed,token,approved in [(REF,'other','sb_secret_fake','true'),
                (REF,REF,'sb_publishable_fake','true'),(REF,REF,'sb_secret_fake','false'),
                ('https://wrong-host',REF,'sb_secret_fake','true')]:
            with self.assertRaises(a.ApiRestoreError):a.Sandbox(ref,confirmed,token,approved,session)
        jwt='x.'+base64.urlsafe_b64encode(json.dumps({'ref':a.TARGETS['portal'],'role':'service_role'}).encode()).decode().rstrip('=')+'.x'
        with self.assertRaises(a.ApiRestoreError):a.Sandbox(REF,REF,jwt,'true',session)
        sandbox=self.sandbox(session)
        with self.assertRaises(a.ApiRestoreError):sandbox.request('DELETE','bucket/anything')
        self.assertEqual(session.calls,[])

    def test_all_plaintext_hashes_validated_before_any_request(self):
        for change in ['hash','pair','mime']:
            session=Session();stream,verification=fixture()
            if change=='hash':verification['files'][-1]['sha256']='0'*64
            elif change=='pair':verification['files'][-1]['name']='../escape'
            else:verification['inventory']['objects'][-1]['metadata']['mimetype']='bad\r\nheader'
            with self.assertRaises(a.ApiRestoreError):a.restore(self.sandbox(session),stream,verification,{})
            self.assertEqual(session.calls,[])

    def test_nonempty_target_conflict_and_changed_readback_never_succeed(self):
        session=Session();session.buckets['existing']={'id':'existing'};stream,verification=fixture()
        with self.assertRaises(a.ApiRestoreError) as caught:a.restore(self.sandbox(session),stream,verification,{})
        self.assertEqual(caught.exception.code,'API_RESTORE_TARGET_NOT_EMPTY')
        self.assertEqual(len(session.calls),1)
        for field in ['fail_upload','corrupt']:
            session=Session();setattr(session,field,True);stream,verification=fixture();report={}
            with self.assertRaises(a.ApiRestoreError):a.restore(self.sandbox(session),stream,verification,report)
            self.assertNotIn('storage_service_restore_verified',report)
            self.assertFalse(any(call[0]=='DELETE' for call in session.calls))
            self.assertEqual(sum(call[0]=='POST' and '/object/' in call[1] for call in session.calls),1)

    def test_encrypted_archive_authenticates_in_ram_before_use(self):
        stream,storage=fixture();secret=os.urandom(32);bid='20261026T195727Z-'+'a'*32
        verification={'project':b.PROJECT,'backup_id':bid,'storage_files_included':True,'storage':storage}
        with tempfile.TemporaryDirectory() as folder,patch.object(b,'key',return_value=secret):
            for part in b.FULL_PARTS:
                payload=json.dumps(verification).encode() if part=='verification' else stream.getvalue() if part=='storage' else b'synthetic'
                b.seal(io.BytesIO(payload),Path(folder)/(part+'.enc'),secret,b.PROJECT+'/'+bid+'/'+part)
            manifest={'format':2,'project':b.PROJECT,'backup_id':bid,'files':{part:b.digest(Path(folder)/(part+'.enc')) for part in b.FULL_PARTS}}
            with a.authenticated_archive(b,folder,manifest) as (plaintext,metadata):
                self.assertEqual(a.validate_archive(plaintext,metadata)[0],storage['inventory']['buckets'])
            data=bytearray(Path(folder,'storage.enc').read_bytes());data[-1]^=1;Path(folder,'storage.enc').write_bytes(data)
            manifest['files']['storage']=b.digest(Path(folder,'storage.enc'))
            with self.assertRaises(InvalidTag),a.authenticated_archive(b,folder,manifest):pass
