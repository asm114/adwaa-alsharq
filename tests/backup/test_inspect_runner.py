"""Static controller guards only. No OAuth, Drive or production calls."""
from pathlib import Path
from types import SimpleNamespace
import re,unittest
ROOT=Path(__file__).resolve().parents[2]
TARGET='a6b488132a203c45ca27c5f6d4f6f7b0f1a14d4e'
class InspectionRunnerTests(unittest.TestCase):
    def setUp(self):self.text=(ROOT/'.github/workflows/backup-inspect-once.yml').read_text()
    def test_distinct_controller_and_target_sha_approvals_fail_closed(self):
        condition=self.text.split('    if: >-',1)[1].split('    environment:',1)[0].strip().replace('&&',' and ')
        defaults={'event':'push','repo':'asm114/adwaa-alsharq','ref':'refs/heads/ops/encrypted-daily-backup-20261024','sha':'c'*40,'mode':'inspect-drive','target':TARGET,'controller':'c'*40}
        def permits(**changes):
            v={**defaults,**changes};context={'github':SimpleNamespace(event_name=v['event'],repository=v['repo'],ref=v['ref'],sha=v['sha']),'vars':SimpleNamespace(BACKUP_SETUP_MODE=v['mode'],BACKUP_SETUP_APPROVED_SHA=v['target'],BACKUP_INSPECT_RUNNER_APPROVED_SHA=v['controller'])}
            return eval('('+condition+')',{'__builtins__':{}},context)
        self.assertTrue(permits())
        for changes in [{'event':'pull_request'},{'event':'workflow_dispatch'},{'event':'schedule'},{'repo':'other/repo'},{'ref':'refs/heads/main'},{'mode':'init-drive'},{'mode':''},{'target':'b'*40},{'target':''},{'controller':TARGET},{'controller':''},{'sha':'d'*40}]:
            with self.subTest(changes=changes):self.assertFalse(permits(**changes))
    def test_read_only_credentials_and_fixed_operation(self):
        self.assertIn('environment: production-backup',self.text)
        self.assertIn('target: [core, portal]',self.text)
        self.assertEqual(set(re.findall(r'backup\.py ([a-z-]+)',self.text)),{'inspect-drive'})
        for name in ['PGPASSWORD','BACKUP_STORAGE_API_KEY','BACKUP_ENCRYPTION_KEY']:self.assertNotIn(name,self.text)
        for name in ['BACKUP_EXECUTION_APPROVED','BACKUP_DRIVE_SETUP_APPROVED','BACKUP_RESTORE_APPROVED','BACKUP_DRIVE_RETENTION_APPROVED','BACKUP_SCHEDULE_APPROVED']:self.assertIn(name+": 'false'",self.text)
        self.assertEqual(set(re.findall(r'\$\{\{ secrets\.([A-Z_]+) \}\}',self.text)),{'BACKUP_DRIVE_CLIENT_ID','BACKUP_DRIVE_CLIENT_SECRET','BACKUP_DRIVE_REFRESH_TOKEN'})
    def test_checkout_and_runtime_identity_are_literal_and_immutable(self):
        self.assertIn('ref: '+TARGET,self.text)
        self.assertIn('test "$(git rev-parse HEAD)" = \''+TARGET+"'",self.text)
        self.assertIn('persist-credentials: false',self.text)
        self.assertNotIn('ref: ${{',self.text)
    def test_event_cannot_run_on_main_or_on_a_timer(self):
        self.assertIn('branches: [ops/encrypted-daily-backup-20261024]',self.text)
        for event in ['workflow_dispatch:','pull_request:','pull_request_target:','schedule:','workflow_run:']:self.assertNotIn(event,self.text)
        self.assertIn('contents: read',self.text)
if __name__=='__main__':unittest.main()
