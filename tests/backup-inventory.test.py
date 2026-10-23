"""No network or production credentials: test metadata-only inventory behavior."""
import io,json,runpy,unittest
from pathlib import Path
from urllib.error import HTTPError
module=runpy.run_path(str(Path(__file__).resolve().parents[1]/'tools/supabase-backup-inventory.py'))
class Inventory(unittest.TestCase):
    def test_missing_auth_never_requests(self):
        self.assertEqual(module['inventory'](None)['blocked'],'management_access_token_missing')
    def test_only_get_and_safe_metadata(self):
        class Opener:
            def open(inner,request,timeout):
                self.assertEqual(request.get_method(),'GET');self.assertEqual(request.full_url,module['ENDPOINT'])
                self.assertEqual(timeout,20)
                return io.BytesIO(json.dumps({'pitr_enabled':True,'physical_backup_enabled':True,'backups':[{'id':1,'status':'COMPLETED','signed_url':'sensitive-url','password':'sensitive-password'}],'access_token':'sensitive-token'}).encode())
        result=module['inventory']('synthetic-not-real',Opener())
        self.assertTrue(result['backup_configuration_verified']);self.assertFalse(result['restore_verified'])
        self.assertNotIn('sensitive',json.dumps(result));self.assertEqual(result['backup_count'],1)
    def test_denied_request_remains_unknown(self):
        class Opener:
            def open(inner,*args,**kwargs):raise HTTPError(module['ENDPOINT'],403,'denied sensitive text',{},None)
        result=module['inventory']('synthetic-not-real',Opener())
        self.assertFalse(result['backup_configuration_verified']);self.assertEqual(result['http_status'],403)
        self.assertNotIn('sensitive',json.dumps(result))
    def test_unrecognized_response_never_claims_success(self):
        class Opener:
            def open(inner,*args,**kwargs):return io.BytesIO(b'{"message":"unknown"}')
        self.assertFalse(module['inventory']('synthetic-not-real',Opener())['backup_configuration_verified'])
    def test_backup_list_does_not_prove_configuration_or_restore(self):
        class Opener:
            def open(inner,*args,**kwargs):return io.BytesIO(b'{"backups":[]}')
        result=module['inventory']('synthetic-not-real',Opener())
        self.assertTrue(result['backup_inventory_verified'])
        self.assertFalse(result['backup_configuration_verified']);self.assertFalse(result['restore_verified'])
    def test_redirect_is_not_followed_with_authorization(self):
        self.assertIsNone(module['NoRedirect']().redirect_request(None,None,302,'',{},'https://other.invalid'))
if __name__=='__main__':unittest.main()
