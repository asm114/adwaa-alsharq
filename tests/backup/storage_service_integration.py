"""Real HTTP round-trip against the official service, invented fixtures only."""
import hashlib
import io
import json
from pathlib import Path
import sys
import tarfile
import requests
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'tools/backup'))
from local_storage_service import service,STORAGE_IMAGE,POSTGRES_IMAGE
from storage_api_restore import restore,ApiRestoreError

def fixture():
    stream=io.BytesIO();files=[];objects=[]
    with tarfile.open(fileobj=stream,mode='w',format=tarfile.USTAR_FORMAT) as archive:
        for index in range(107):
            bucket='test-content' if index<105 else 'test-nested'
            name=('nested/' if index>=105 else '')+'file-'+str(index)+'.bin'
            data=b'' if index==0 else hashlib.sha256(str(index).encode()).digest()*1024
            member='object-'+str(index).zfill(8);info=tarfile.TarInfo(member);info.size=len(data)
            archive.addfile(info,io.BytesIO(data))
            files.append(dict(member=member,bucket=bucket,name=name,bytes=len(data),sha256=hashlib.sha256(data).hexdigest()))
            objects.append(dict(bucket_id=bucket,name=name,metadata={'size':len(data),'mimetype':'application/octet-stream'}))
    stream.seek(0)
    return stream,{'files':files,'inventory':{'objects':objects,'buckets':[
        {'id':'test-content','public':True},{'id':'test-nested','public':False},
        {'id':'test-empty','public':False}]}}

def main():
    try:
        with service() as sandbox:
            stream,verification=fixture();report=restore(sandbox,stream,verification,{})
            assert report['objects_verified']==107 and report['bytes_verified']==3473408
            # A retry must refuse existing state before replacing any content.
            try:restore(sandbox,stream,verification,{})
            except ApiRestoreError as error:assert error.code=='API_RESTORE_TARGET_NOT_EMPTY'
            else:raise AssertionError('nonempty target accepted')
            with requests.Session() as anonymous:
                anonymous.trust_env=False
                response=anonymous.get(sandbox.base+'object/public/test-content/file-1.bin',
                    timeout=10,allow_redirects=False)
                assert response.status_code not in (200,201);response.close()
        print(json.dumps({**report,'fixture_only':True,'production_access':False,
            'hosted_supabase_restore_verified':False,'storage_image':STORAGE_IMAGE,
            'postgres_image':POSTGRES_IMAGE,'pagination_verified':True,
            'anonymous_public_read_denied':True,'nonempty_retry_rejected':True}))
        return 0
    except ApiRestoreError as error:print(error.code)
    except Exception:print('LOCAL_STORAGE_INTEGRATION_FAILED')
    return 1

if __name__=='__main__':raise SystemExit(main())
