"""Exercise the REAL Google/httplib2 resumable stack without network or secrets."""
import io
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

import httplib2
from googleapiclient.http import HttpRequest,MediaIoBaseUpload
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'tools/backup'))
import drive_store as d


class ResumableProtocolTests(unittest.TestCase):
    def upload(self,transport):
        payload=b'x'*(256*1024+1)
        media=MediaIoBaseUpload(io.BytesIO(payload),mimetype='application/octet-stream',chunksize=256*1024,resumable=True)
        request=HttpRequest(transport,lambda response,body:json.loads(body),
                            'https://synthetic.invalid/upload',method='POST',body='{}',resumable=media)
        calls=[];uploaded=[]
        def response(connection,request_uri,method,body,headers,**kwargs):
            calls.append(method)
            if method=='POST':
                return httplib2.Response({'status':'200','location':'https://synthetic.invalid/session'}),b'{}'
            data=body.read();uploaded.append(data)
            if len(uploaded)==1:
                return httplib2.Response({'status':'308','range':'bytes=0-262143'}),b''
            return httplib2.Response({'status':'200'}),b'{"id":"synthetic-file"}'
        with patch.object(transport,'_conn_request',side_effect=response):
            result=None
            for _ in range(3):
                _,result=request.next_chunk()
                if result:break
        self.assertEqual(result,{'id':'synthetic-file'})
        self.assertEqual(b''.join(uploaded),payload)
        self.assertEqual(calls,['POST','PUT','PUT'])

    def test_original_custom_http_reproduces_308_missing_location_failure(self):
        with self.assertRaises(httplib2.RedirectMissingLocation):
            self.upload(httplib2.Http(timeout=60))

    def test_fixed_transport_completes_multichunk_upload_without_redirect(self):
        transport=d.drive_http()
        self.assertNotIn(308,transport.redirect_codes)
        self.assertIn(307,transport.redirect_codes)
        self.assertEqual(transport.timeout,60)
        self.upload(transport)
