"""Exercise the actual workflow approval expressions without credentials."""
import itertools
import re
import unittest
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[2]


class ManualApprovalTests(unittest.TestCase):
    def setUp(self):
        self.text = (ROOT / '.github/workflows/database-backup.yml').read_text()

    def evaluate(self, expression, event, ref, operation, approval):
        context = {
            'github': SimpleNamespace(event_name=event, ref=ref),
            'inputs': SimpleNamespace(operation=operation),
            'vars': SimpleNamespace(BACKUP_EXECUTION_APPROVED=approval,
                                    BACKUP_RESTORE_APPROVED=approval),
        }
        return eval(expression.replace('&&', ' and ').replace('||', ' or '),
                    {'__builtins__': {}}, context)

    def test_only_manual_main_backup_gets_implicit_approval(self):
        for flag in ('BACKUP_EXECUTION_APPROVED', 'BACKUP_RESTORE_APPROVED'):
            expression = re.search(r'^          ' + flag + r': \$\{\{ (.+) \}\}$',
                                   self.text, re.M).group(1)
            for event, ref, operation, approval in itertools.product(
                ('workflow_dispatch', 'schedule', 'push', 'pull_request'),
                ('refs/heads/main', 'refs/heads/other', 'refs/pull/1/merge'),
                ('backup', 'restore', 'preflight', 'health', '', 'init-drive', 'retention-plan'),
                ('', 'false', 'true'),
            ):
                with self.subTest(flag=flag, event=event, ref=ref, operation=operation, approval=approval):
                    result = self.evaluate(expression, event, ref, operation, approval)
                    expected = (event == 'workflow_dispatch' and ref == 'refs/heads/main') if operation == 'backup' else approval == 'true'
                    self.assertEqual(result == 'true', expected)

    def test_environment_gate_and_mode_are_not_bypassed(self):
        job = self.text.split('  backup:\n', 1)[1].split('  notify-failure:', 1)[0]
        self.assertIn('    environment: production-backup\n', job)
        condition = re.search(r'^    if: (.+)$', job, re.M).group(1)
        for event, ref in itertools.product(('workflow_dispatch', 'schedule', 'push', 'pull_request'),
                                            ('refs/heads/main', 'refs/heads/other')):
            self.assertEqual(bool(self.evaluate(condition, event, ref, 'backup', 'true')),
                             event == 'workflow_dispatch' and ref == 'refs/heads/main')
        self.assertIn('BACKUP_MODE: ${{ inputs.operation }}', job)
        self.assertEqual(self.text.count('BACKUP_EXECUTION_APPROVED:'), 1)
        self.assertEqual(self.text.count('BACKUP_RESTORE_APPROVED:'), 1)
        for flag in ('BACKUP_DRIVE_RETENTION_APPROVED', 'BACKUP_PRODUCTION_RESTORE_VERIFIED', 'BACKUP_SCHEDULE_APPROVED'):
            self.assertIn(flag + ": 'false'", job)
        self.assertNotIn('schedule:', self.text)
        self.assertIn('options: [preflight, backup, restore, health]', self.text)


if __name__ == '__main__':
    unittest.main()
