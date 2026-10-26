import base64
import contextlib
import importlib.util
import io
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch, MagicMock

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools/backup'))
import backup as engine
import drive_store as drive
from test_drive_store import Service, EMAIL, FOLDER, CURRENT, metadata
spec = importlib.util.spec_from_file_location('failure_audit', ROOT / 'tools/backup/failure_audit.py')
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class FailureAuditTests(unittest.TestCase):
    def test_key_diagnostics_do_not_reveal_or_transform_key(self):
        for value, code in [('', 'ENCRYPTION_KEY_MISSING'), ('SYNTHETIC-SECRET!', 'ENCRYPTION_KEY_INVALID_BASE64'), (base64.b64encode(b'synthetic-short').decode(), 'ENCRYPTION_KEY_INVALID_LENGTH')]:
            with patch.dict(os.environ, {'BACKUP_ENCRYPTION_KEY': value}, clear=True):
                with self.assertRaises(engine.EncryptionKeyError) as error:engine.key()
                self.assertEqual(error.exception.code, code)
                self.assertNotIn('SYNTHETIC', str(error.exception))
        value = base64.b64encode(b'a' * 32).decode()
        with patch.dict(os.environ, {'BACKUP_ENCRYPTION_KEY': value}, clear=True):
            self.assertEqual(engine.key(), b'a' * 32)
            self.assertEqual(os.environ['BACKUP_ENCRYPTION_KEY'], value)

    def test_partial_files_and_unconfirmed_permissions_never_certify_restore(self):
        service = Service()
        service.rows['partial-file-id'] = metadata('partial-file-id', drive.PREFIX + CURRENT + '/database.enc', b'cipher')
        service.rows['partial-file-id']['name'] = 'SYNTHETIC-CUSTOMER-NAME'
        service.rows['partial-file-id']['permissions'] = []
        store = drive.DriveStore(service, FOLDER, EMAIL, 1000)
        with patch.object(service, 'create') as create, patch.object(service, 'delete') as delete, patch.object(service, 'get_media') as download:
            report = store.audit_existing()
        self.assertNotIn('SYNTHETIC-CUSTOMER-NAME', str(report))
        self.assertEqual(report['managed_files'][0]['metadata_code'], 'DRIVE_PERMISSION_METADATA_MISSING')
        self.assertEqual(report['groups'][0]['file_count'], 1)
        self.assertFalse(report['groups'][0]['complete_marker_present'])
        self.assertFalse(report['groups'][0]['restore_verified'])
        create.assert_not_called();delete.assert_not_called();download.assert_not_called()

    def test_complete_markers_are_observations_not_restore_proof(self):
        service = Service()
        for i, part in enumerate(drive.OBJECTS):
            key = drive.PREFIX + CURRENT + '/' + part
            service.rows['synthetic-id-' + str(i)] = metadata('synthetic-id-' + str(i), key, b'cipher')
        report = drive.DriveStore(service, FOLDER, EMAIL, 1000).audit_existing()
        self.assertTrue(report['groups'][0]['complete_marker_present'])
        self.assertTrue(report['groups'][0]['restore_marker_present'])
        self.assertFalse(report['groups'][0]['restore_verified'])

    def test_capacity_and_file_validation_codes_are_specific(self):
        service = Service();service.free = 100
        store = drive.DriveStore(service, FOLDER, EMAIL, 1000)
        with self.assertRaises(drive.DriveError) as error:store.preflight()
        self.assertEqual(drive.safe_diagnostic(error.exception), 'DRIVE_SPACE_INSUFFICIENT')
        service.rows[FOLDER]['shared'] = True
        with self.assertRaises(drive.DriveError) as error:store._metadata(FOLDER, True)
        self.assertEqual(drive.safe_diagnostic(error.exception), 'DRIVE_TARGET_NOT_PRIVATE')

    def test_audit_continues_after_invalid_key_without_backup_or_db(self):
        config = {'BACKUP_COST_APPROVED': 'true', 'BACKUP_DRIVE_ACCOUNT': EMAIL,
                  **{k: 'false' for k in ['BACKUP_EXECUTION_APPROVED', 'BACKUP_RESTORE_APPROVED', 'BACKUP_DRIVE_RETENTION_APPROVED', 'BACKUP_SCHEDULE_APPROVED']}}
        store = MagicMock()
        store.audit_existing.return_value = {'managed_files': [], 'groups': []}
        store._identity.return_value = 100
        store.preflight.side_effect = drive.DriveError('SYNTHETIC-SECRET', 'DRIVE_SPACE_INSUFFICIENT')
        out = io.StringIO()
        with patch.dict(os.environ, config, clear=True), patch.object(audit, 'authenticate'), patch.object(audit, 'inspection_report', return_value={'folder_count': 1, 'folder_ids': [audit.PLANS[audit.TARGET]['folder']]}), patch.object(audit, 'DriveStore', return_value=store), patch.object(engine, 'source_connection') as database, patch.object(engine, 'main') as capture, contextlib.redirect_stdout(out):
            self.assertEqual(audit.main(), 0)
            database.assert_not_called();capture.assert_not_called()
        self.assertIn('ENCRYPTION_KEY_MISSING', out.getvalue())
        self.assertIn('DRIVE_SPACE_INSUFFICIENT', out.getvalue())
        self.assertNotIn('SYNTHETIC-SECRET', out.getvalue())

    def test_audit_workflow_excludes_database_and_capture_permissions(self):
        text = (ROOT / '.github/workflows/backup-failure-audit.yml').read_text()
        for required in ['environment: production-backup', 'github.event.after == github.sha', 'ref: ${{ github.sha }}', 'tools/backup/failure_audit.py']:
            self.assertIn(required, text)
        for name in ['BACKUP_EXECUTION_APPROVED', 'BACKUP_RESTORE_APPROVED', 'BACKUP_DRIVE_RETENTION_APPROVED', 'BACKUP_SCHEDULE_APPROVED']:
            self.assertIn(name + ": 'false'", text)
        for forbidden in ['PGPASSWORD', 'PGHOST', 'BACKUP_STORAGE_API_KEY', 'first_capture.py', 'schedule:', 'workflow_dispatch:', 'backup.py backup']:
            self.assertNotIn(forbidden, text)
