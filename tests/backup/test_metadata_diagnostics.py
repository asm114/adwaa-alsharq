import json
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'tools/backup'))
import backup as b

class MetadataDiagnosticsTests(unittest.TestCase):
    def test_all_metadata_differences_are_structural_and_redacted(self):
        cases={
            'catalog':({'schema':'secret-schema','name':'secret-name','owner':'secret-owner',
                        'acl':[],'rls':True,'force_rls':True,'options':[]},'force_rls',False),
            'policies':({'schemaname':'secret-schema','tablename':'secret-table','policyname':'secret-policy',
                         'qual':'secret-expression','roles':['secret-role']},'qual','changed-secret-expression'),
            'roles':({'name':'secret-role','superuser':False,'bypassrls':False},'bypassrls',True),
            'memberships':({'role':'secret-parent','member':'secret-member','grantor':'secret-grantor',
                            'admin':False,'inherit':True,'set':True},'admin',True)}
        for field,(row,attribute,value) in cases.items():
            result=b.metadata_differences(field,json.dumps([row]),json.dumps([{**row,attribute:value}]))
            self.assertEqual(result[field]['changed_attributes'],{attribute:1})
            self.assertNotIn('secret-',json.dumps(result))
