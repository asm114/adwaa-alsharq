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

    def test_schema_grant_diagnostics_hide_custom_identifiers(self):
        original=[{'grantor':'private-person-role','grantee':'private-customer-role',
                   'privilege':'USAGE','grantable':True}]
        observed=[{'grantor':'private-person-role','grantee':None,
                   'privilege':'CREATE','grantable':False}]
        result=m.schema_acl_diagnostic('private-customer-schema',observed,original)
        rendered=json.dumps(result)
        self.assertNotIn('private-',rendered)
        self.assertEqual(result['schema'],'CUSTOM_SCHEMA')
        self.assertEqual(result['missing_grants_replayed'][0]['privilege'],'USAGE')
        self.assertTrue(result['missing_grants_replayed'][0]['grantable'])
        self.assertEqual(result['extra_grants_removed'][0]['grantee'],'PUBLIC')
        self.assertEqual(m.schema_acl_diagnostic('graphql',[],original)['schema'],'graphql')

    def test_delegated_grants_are_replayed_in_dependency_order(self):
        source=[{'grantor':'b','grantee':'c','privilege':'USAGE','grantable':False},
                {'grantor':'a','grantee':'b','privilege':'USAGE','grantable':True},
                {'grantor':'owner','grantee':'a','privilege':'USAGE','grantable':True}]
        ordered=m.grant_order(source,'owner')
        self.assertEqual([g['grantor'] for g in ordered],['owner','a','b'])
        self.assertEqual(len(source),3)
        self.assertCountEqual(source,ordered)
        with self.assertRaises(ValueError):m.grant_order(source[:2],'owner')
        wrong_privilege=[dict(source[2],privilege='CREATE')]+source[:2]
        with self.assertRaises(ValueError):m.grant_order(wrong_privilege,'owner')

    def test_permission_failure_reports_only_safe_code(self):
        import subprocess
        from types import SimpleNamespace
        def sql(query):return '{}' if 'jsonb_object_agg' in query else '[]'
        def docker(command):
            raise subprocess.CalledProcessError(3,command,stderr=b'ERROR: 42501 private-role-and-secret-must-not-escape')
        engine=SimpleNamespace(application_schema_metadata=json.loads,quote=lambda text:'"'+text+'"',
                               stage_file=lambda *args:None,docker=docker)
        verification={'schema':json.dumps({'schemas':[],'routines':[]}),'catalog':'[]'}
        with self.assertRaises(m.MetadataRestoreError) as caught:
            m.restore_extension_metadata(engine,'synthetic-container',verification,sql,'synthetic-owner')
        self.assertEqual(caught.exception.code,'RESTORE_METADATA_PERMISSION_DENIED')
        self.assertNotIn('private-',str(caught.exception))
        self.assertEqual(caught.exception.diagnostics,[])
