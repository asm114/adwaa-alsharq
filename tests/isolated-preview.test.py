import json,runpy,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
module=runpy.run_path(str(ROOT/'tools/build-isolated-backup-preview.py'))
class Bundle(unittest.TestCase):
 def test_no_production_config_and_static_only(self):
  with tempfile.TemporaryDirectory() as directory:
   output=Path(directory)/'site';manifest=module['build'](output)
   self.assertTrue(manifest['synthetic_only']);self.assertFalse(manifest['production_connections'])
   text='\n'.join(p.read_text() for p in output.rglob('*') if p.is_file())
   for value in module['FORBIDDEN']:self.assertNotIn(value,text)
   config=json.loads((output/'vercel.json').read_text());self.assertIsNone(config['buildCommand']);self.assertFalse(config['git']['deploymentEnabled'])
   self.assertIn("connect-src 'none'",(output/'index.html').read_text())
   self.assertNotIn('src="https://accounts.google.com',(output/'live/index.html').read_text())
   self.assertIn('PREVIEW_TEST_CLIENT_ID_REQUIRED',(output/'backup-core.js').read_text())
   self.assertIn('adwaaMaintenancePreview',(output/'backup-core.js').read_text())
   self.assertNotIn("key='adwaaBackupFolder'",(output/'backup-core.js').read_text())
 def test_real_production_google_client_is_rejected(self):
  import re
  client=re.search(r"const GOOGLE_DRIVE_CLIENT_ID='([^']+)'",(ROOT/'index.html').read_text()).group(1)
  with tempfile.TemporaryDirectory() as directory:
   with self.assertRaisesRegex(ValueError,'separate public test'):
    module['build'](Path(directory)/'site',client)
 def test_live_mode_only_accepts_a_public_test_client(self):
  with tempfile.TemporaryDirectory() as directory:
   output=Path(directory)/'site';module['build'](output,'999999-test.apps.googleusercontent.com')
   self.assertIn('src="https://accounts.google.com',(output/'live/index.html').read_text())
   self.assertNotIn('src="https://accounts.google.com',(output/'index.html').read_text())
if __name__=='__main__':unittest.main()
