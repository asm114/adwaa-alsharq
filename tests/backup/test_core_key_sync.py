import base64
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('core_sync', ROOT / 'tools/backup/windows/sync_core_key.py')
s = importlib.util.module_from_spec(spec);spec.loader.exec_module(s)


class CoreKeySyncTests(unittest.TestCase):
    def test_original_key_only_through_stdin_and_source_unchanged(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'original.txt'
            key = base64.b64encode(b'k' * 32).decode()
            path.write_text('\ufeff' + key + '\n', encoding='utf-8')
            before = path.read_bytes()
            ok = type('Result', (), {'returncode': 0})()
            with patch.object(s.shutil, 'which', return_value='gh'), patch.object(s.subprocess, 'run', return_value=ok) as run:
                self.assertEqual(s.sync(path), 'GITHUB_CORE_KEY_SYNC_OK')
                call = run.call_args_list[-1]
                self.assertEqual(call.kwargs['input'], key.encode())
                self.assertIn('BACKUP_CORE_ENCRYPTION_KEY', call.args[0])
                self.assertNotIn('BACKUP_PORTAL_ENCRYPTION_KEY', call.args[0])
                self.assertNotIn(key, call.args[0])
            self.assertEqual(path.read_bytes(), before)
            self.assertEqual(len(list(Path(folder).iterdir())), 1)

    def test_invalid_or_portal_document_never_updates_secrets(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'original.txt'
            for value in ['invalid!', 'a' * 64, json.dumps({'target': 'portal', 'BACKUP_CORE_ENCRYPTION_KEY': base64.b64encode(b'p' * 32).decode()})]:
                path.write_text(value)
                with patch.object(s.subprocess, 'run') as run:
                    self.assertEqual(s.sync(path), 'LOCAL_CORE_KEY_FILE_INVALID')
                    run.assert_not_called()

    def test_bundle_contains_only_the_two_reviewed_scripts(self):
        with zipfile.ZipFile(ROOT / 'tools/backup/windows/Adwaa-Core-Key-Sync.zip') as archive:
            self.assertEqual(set(archive.namelist()), {'Sync-Core-Key.cmd', 'sync_core_key.py'})
            for name in archive.namelist():
                self.assertEqual(archive.read(name), (ROOT / 'tools/backup/windows' / name).read_bytes())
