import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import contextlib
import unittest
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools/backup'))
spec = importlib.util.spec_from_file_location('first_capture', ROOT / 'tools/backup/first_capture.py')
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)
CONFIG = {'BACKUP_COST_APPROVED': 'true', 'BACKUP_EXECUTION_APPROVED': 'true',
          'BACKUP_RESTORE_APPROVED': 'true', 'BACKUP_DRIVE_RETENTION_APPROVED': 'false',
          'BACKUP_SCHEDULE_APPROVED': 'false', 'BACKUP_RESTORE_IMAGE': 'sha256:' + 'a' * 64,
          'BACKUP_DRIVE_ACCOUNT': 'synthetic@example.invalid'}


class FirstCaptureTests(unittest.TestCase):
    def test_gates_fail_before_network(self):
        for change in [{'BACKUP_COST_APPROVED': 'false'}, {'BACKUP_EXECUTION_APPROVED': 'false'}, {'BACKUP_RESTORE_APPROVED': 'false'}, {'BACKUP_DRIVE_RETENTION_APPROVED': 'true'}, {'BACKUP_SCHEDULE_APPROVED': 'true'}, {'BACKUP_RESTORE_IMAGE': 'mutable:tag'}]:
            with patch.dict(os.environ, {**CONFIG, **change}, clear=True), patch.object(c, 'authenticate') as auth, contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(c.main(), 1)
                auth.assert_not_called()

    def test_existing_folder_only_and_extension_drift_stops_capture(self):
        conn = MagicMock()
        conn.execute.side_effect = [MagicMock(fetchone=lambda: (True,)), MagicMock(fetchall=lambda: [('unexpected', '1.0')])]
        with patch.dict(os.environ, CONFIG, clear=True), patch.object(c, 'authenticate'), patch.object(c, 'inspection_report', return_value={'folder_count': 1, 'folder_ids': [c.PLANS[c.TARGET]['folder']]}), patch.object(c.engine, 'source_connection') as source, patch.object(c.engine, 'main') as engine, contextlib.redirect_stdout(io.StringIO()):
            source.return_value.__enter__.return_value = conn
            self.assertEqual(c.main(), 1)
            engine.assert_not_called()
        self.assertNotIn('initialize_folder', (ROOT / 'tools/backup/first_capture.py').read_text())

    def test_measured_limits_and_empty_core_storage_are_valid(self):
        self.assertGreater(c.PLANS['core']['daily'], 20671635)
        self.assertGreater(c.PLANS['portal']['daily'], 15461523 + 69349839)
        self.assertGreater(c.PLANS['portal']['storage_max'], 69349839)
        conn = MagicMock()
        conn.execute.side_effect = [MagicMock(fetchone=lambda: (True,)), MagicMock(fetchall=lambda: c.EXTENSIONS), MagicMock(fetchone=lambda: (0,))]
        result = {'restore_verified': True, 'storage_files_verified': True, 'storage_service_restore_verified': False}
        out = io.StringIO()
        with patch.dict(os.environ, CONFIG, clear=True), patch.object(c, 'authenticate'), patch.object(c, 'inspection_report', return_value={'folder_count': 1, 'folder_ids': [c.PLANS[c.TARGET]['folder']]}), patch.object(c.engine, 'source_connection') as source, patch.object(c, 'inventory', return_value={'buckets': [], 'objects': []}), patch.object(c.engine, 'key'), patch.object(c.engine, 'main', return_value=result), contextlib.redirect_stdout(out):
            source.return_value.__enter__.return_value = conn
            self.assertEqual(c.main(), 0)
        report = json.loads(out.getvalue())
        self.assertEqual(report['storage_objects_before'], 0)
        self.assertFalse(report['storage_service_restore_verified'])
        self.assertFalse(report['vault_external_key_recovery_verified'])

    def test_workflow_has_exact_sha_environment_review_and_no_schedule_or_delete(self):
        text = (ROOT / '.github/workflows/backup-first-capture.yml').read_text()
        self.assertIn('environment: production-backup', text)
        self.assertIn('github.event.after == github.sha', text)
        self.assertIn('ref: ${{ github.sha }}', text)
        self.assertIn('test "$(git rev-parse HEAD)" = "$EXPECTED_SHA"', text)
        self.assertIn('branches: [ops/encrypted-daily-backup-20261024]', text)
        self.assertIn('tests/backup/restore_integration.py', text)
        self.assertIn("BACKUP_DRIVE_RETENTION_APPROVED: 'false'", text)
        self.assertIn("BACKUP_SCHEDULE_APPROVED: 'false'", text)
        for forbidden in ['schedule:', 'workflow_dispatch:', 'backup.py restore', 'init-drive', 'permissions: write-all', 'packages: write']:
            self.assertNotIn(forbidden, text)
