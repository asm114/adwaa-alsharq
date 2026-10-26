import json
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'tools/backup'))
import restore_metadata as m

class RestoreMetadataTests(unittest.TestCase):
    def test_sql_literal_escapes_quotes_and_backslashes(self):
        self.assertEqual(m.literal("a'b\\c"),"E'a''b\\\\c'")

    def test_normalization_preserves_every_acl_entry_and_definition(self):
        grants=[{'grantor':'owner','grantee':None,'privilege':'EXECUTE','grantable':False},
                {'grantor':'owner','grantee':'PUBLIC','privilege':'EXECUTE','grantable':True}]
        calls=[]
        def sql(query):
            calls.append(query)
            return json.dumps([{'i':1,'entries':grants+grants[:1]}])
        source={'routines':[{'name':'f','owner':'owner','acl':None,'definition':'original SQL'}]}
        normalized=m.normalized_metadata(source,'schema',sql)
        self.assertEqual(source['routines'][0]['acl'],None)
        self.assertEqual(normalized['routines'][0]['definition'],'original SQL')
        self.assertEqual(len(normalized['routines'][0]['acl']),3)
        self.assertIn('aclexplode',calls[0]);self.assertIn('acldefault',calls[0])
        self.assertEqual({g['grantee'] for g in normalized['routines'][0]['acl']},{None,'PUBLIC'})

    def test_incomplete_parser_response_fails_closed(self):
        with self.assertRaises(ValueError):
            m.acl_values([{'acl':None,'owner':'owner','kind':'n'}],lambda query:'[]')

