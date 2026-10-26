import json
import sys
from pathlib import Path
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'tools/backup'))
import backup as b

class SchemaDiagnosticsTests(unittest.TestCase):
    def test_order_is_classified_but_not_accepted(self):
        before={'schemas':[{'name':'b','owner':'original'},{'name':'a','owner':'original'}]}
        after={'schemas':list(reversed(before['schemas']))}
        self.assertNotEqual(b.application_schema_metadata(before),b.application_schema_metadata(after))
        delta=b.schema_differences(before,after)['schemas']
        self.assertTrue(delta['list_order_only'])
        self.assertEqual(delta['identical_objects'],2)
        self.assertEqual(delta['changed_attributes'],{})

    def test_all_six_sections_described_without_names_sql_or_acls(self):
        secret='sensitive-never-output'
        before={};after={}
        for field in ['schemas','defaults','constraints','routines','views','triggers']:
            row={'schema':secret,'name':secret,'table':secret,'args':secret,
                 'owner':secret,'definition':secret,'acl':secret,'enabled':'O','valid':True}
            before[field]=[row]
            after[field]=[{**row,'acl':'changed-'+secret,'definition':'changed-'+secret,'valid':False}]
        result=b.schema_differences(before,after)
        self.assertEqual(set(result),set(before))
        self.assertNotIn(secret,json.dumps(result))
        for delta in result.values():
            self.assertEqual(delta['changed_attributes'],{'acl':1,'definition':1,'valid':1})
            self.assertFalse(delta['list_order_only'])
            self.assertEqual(delta['source_only_identities'],0)

    def test_missing_objects_duplicates_null_and_unknown_keys(self):
        self.assertEqual(b.schema_differences({'views':None},{'views':[]})['views'],
                         {'source_type':'NoneType','restored_type':'list'})
        left={'schemas':[{'name':'a'},{'name':'a'},{'name':'missing'}]}
        right={'schemas':[{'name':'a'},{'name':'new'}]}
        delta=b.schema_differences(left,right)['schemas']
        self.assertEqual(delta['duplicate_source_identities'],1)
        self.assertEqual(delta['source_only_identities'],1)
        self.assertEqual(delta['restored_only_identities'],1)
        delta=b.schema_differences({'views':[{'name':'v','private-key':'private-value'}]},
                                   {'views':[{'name':'v','private-key':'changed-private-value'}]})
        self.assertNotIn('private',json.dumps(delta))
        self.assertEqual(delta['views']['changed_attributes'],{'unrecognized_attribute':1})

    def test_samples_are_bounded_and_no_comparison_is_relaxed(self):
        left={'views':[{'schema':'private','name':str(i),'definition':'secret'} for i in range(100)]}
        right={'views':[{**r,'definition':'changed'} for r in left['views']]}
        self.assertEqual(b.schema_differences(left,right)['views']['changed_attributes'],{'definition':100})
        self.assertEqual(len(b.schema_differences(left,right)['views']['changed_object_samples']),20)
        self.assertNotEqual(b.application_schema_metadata(left),b.application_schema_metadata(right))
