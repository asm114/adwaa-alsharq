import json
import sys
from pathlib import Path
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'tools/backup'))
import backup as b


class ApplicationSchemaMetadataTests(unittest.TestCase):
    def test_legacy_standard_views_are_not_application_dump_contents(self):
        source={'views':[{'schema':'information_schema','name':'tables','definition':'old PG system view'},
                         {'schema':'public','name':'app','definition':'select * from information_schema.tables'}],
                'defaults':[{'schema':None,'acl':'preserved'},{'schema':'information_schema','acl':'system'}]}
        restored={'views':[{'schema':'public','name':'app','definition':'select * from information_schema.tables'}],
                  'defaults':[{'schema':None,'acl':'preserved'}]}
        self.assertEqual(b.application_schema_metadata(json.dumps(source)),b.application_schema_metadata(json.dumps(restored)))
        self.assertEqual(len(source['views']),2)
        restored['views'][0]['definition']='changed application view'
        self.assertNotEqual(b.application_schema_metadata(source),b.application_schema_metadata(restored))

    def test_application_acl_and_owner_differences_remain_failures(self):
        for field in ['schemas','routines','views','defaults','constraints','triggers']:
            source={field:[{'schema':'auth','acl':'owner=arwd/owner','owner':'original'}]}
            restored={field:[{'schema':'auth','acl':'owner=r/owner','owner':'changed'}]}
            self.assertNotEqual(b.application_schema_metadata(source),b.application_schema_metadata(restored))

