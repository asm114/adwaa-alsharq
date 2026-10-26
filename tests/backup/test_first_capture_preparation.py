import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools/backup'))
spec = importlib.util.spec_from_file_location('prepare_capture', ROOT / 'tools/backup/prepare_first_capture.py')
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)

CONFIG = {'BACKUP_COST_APPROVED': 'true', 'BACKUP_DRIVE_SETUP_APPROVED': 'true',
          'BACKUP_DRIVE_ACCOUNT': 'synthetic@example.invalid',
          **{name: 'false' for name in ('BACKUP_EXECUTION_APPROVED', 'BACKUP_RESTORE_APPROVED',
             'BACKUP_DRIVE_RETENTION_APPROVED', 'BACKUP_SCHEDULE_APPROVED')}}


class FirstCapturePreparationTests(unittest.TestCase):
    def test_preparation_has_no_capture_restore_or_retention(self):
        conn = MagicMock()
        conn.execute.side_effect = [MagicMock(fetchone=lambda: (True,)),
                                   MagicMock(fetchone=lambda: (1000,)),
                                   MagicMock(fetchone=lambda: ('170006',)),
                                   MagicMock(fetchall=lambda: [('plpgsql', '1.0')])]
        inventory = {'buckets': [{'id': 'synthetic-private'}],
                     'objects': [{'name': 'SENSITIVE-NAME', 'metadata': {'size': 12}}]}
        out = io.StringIO()
        with patch.dict(os.environ, CONFIG, clear=True), patch.object(p, 'authenticate'), patch.object(p, 'initialize_folder', return_value='synthetic-folder'), patch.object(p.engine, 'source_connection') as connect, patch.object(p, 'inventory', return_value=inventory), patch.object(p, 'Source') as source, patch.object(p.engine, 'backup') as capture, patch.object(p.engine, 'isolated_restore') as restore, contextlib.redirect_stdout(out):
            connect.return_value.__enter__.return_value = conn
            self.assertEqual(p.main(), 0)
            capture.assert_not_called()
            restore.assert_not_called()
            source.return_value.check_buckets.assert_called_once_with(inventory['buckets'])
            source.return_value.close.assert_called_once()
        self.assertNotIn('SENSITIVE-NAME', out.getvalue())
        report = json.loads(out.getvalue().splitlines()[-1])
        self.assertEqual(report['storage_bytes'], 12)
        self.assertFalse(report['backup_created'])
        self.assertFalse(report['restore_image_configured'])
        for call in conn.execute.call_args_list:
            self.assertTrue(call.args[0].startswith(('SELECT ', 'SHOW ')))

    def test_failure_preserves_folder_id_and_hides_exception(self):
        out = io.StringIO()
        with patch.dict(os.environ, CONFIG, clear=True), patch.object(p, 'authenticate'), patch.object(p, 'initialize_folder', return_value='synthetic-folder'), patch.object(p.engine, 'source_connection', side_effect=RuntimeError('SYNTHETIC-SECRET')), contextlib.redirect_stdout(out):
            self.assertEqual(p.main(), 1)
        self.assertNotIn('SYNTHETIC-SECRET', out.getvalue())
        report = json.loads(out.getvalue().splitlines()[-1])
        self.assertEqual(report['folder_id'], 'synthetic-folder')
        self.assertEqual(report['stage'], 'source_connection')

    def test_permissions_fail_before_any_network(self):
        for change in [{'BACKUP_COST_APPROVED': 'false'}, {'BACKUP_DRIVE_SETUP_APPROVED': 'false'}, {'BACKUP_EXECUTION_APPROVED': 'true'}, {'BACKUP_RESTORE_APPROVED': 'true'}, {'BACKUP_DRIVE_RETENTION_APPROVED': 'true'}, {'BACKUP_SCHEDULE_APPROVED': 'true'}]:
            with patch.dict(os.environ, {**CONFIG, **change}, clear=True), patch.object(p, 'authenticate') as auth, contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(p.main(), 1)
                auth.assert_not_called()

    def test_workflow_is_reviewed_sha_bound_and_setup_only(self):
        text = (ROOT / '.github/workflows/backup-first-setup.yml').read_text()
        self.assertIn('environment: production-backup', text)
        self.assertIn('github.event.after == github.sha', text)
        self.assertIn('ref: ${{ github.sha }}', text)
        self.assertIn('test "$(git rev-parse HEAD)" = "$EXPECTED_SHA"', text)
        self.assertIn('branches: [ops/encrypted-daily-backup-20261024]', text)
        self.assertIn('tools/backup/prepare_first_capture.py', text)
        for name in ['BACKUP_EXECUTION_APPROVED', 'BACKUP_RESTORE_APPROVED', 'BACKUP_DRIVE_RETENTION_APPROVED', 'BACKUP_SCHEDULE_APPROVED']:
            self.assertIn(name + ": 'false'", text)
        for prohibited in ['schedule:', 'BACKUP_ENCRYPTION_KEY', 'backup.py backup', 'backup.py restore', 'issues: write', 'actions: write', 'secrets: write']:
            self.assertNotIn(prohibited, text)
