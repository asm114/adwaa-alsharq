"""Synthetic credential-file tests; never contact Google or use real secrets."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools/backup'))
import check_oauth_local

spec = importlib.util.spec_from_file_location('windows_oauth', ROOT / 'tools/backup/windows/run_local.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class WindowsOAuthTests(unittest.TestCase):
    def test_bundle_contains_only_reviewed_scripts(self):
        with zipfile.ZipFile(ROOT / 'tools/backup/windows/Adwaa-OAuth-Local-Check.zip') as bundle:
            self.assertEqual(set(bundle.namelist()), {'run_local.py', 'check_oauth_local.py', 'Run-OAuth-Check.cmd', 'sync_github_oauth.py', 'Sync-GitHub-OAuth.cmd'})
            self.assertEqual(bundle.read('check_oauth_local.py'), (ROOT / 'tools/backup/check_oauth_local.py').read_bytes())
            for name in ['run_local.py', 'Run-OAuth-Check.cmd', 'sync_github_oauth.py', 'Sync-GitHub-OAuth.cmd']:
                self.assertEqual(bundle.read(name), (ROOT / 'tools/backup/windows' / name).read_bytes())

    def test_existing_files_used_without_changes_or_redirects(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            self.assertEqual(runner.run(root), 'LOCAL_TOKEN_FILE_MISSING')
            token = root / 'drive_oauth_token.json'
            token.write_text(json.dumps({'refresh_token': 'synthetic-token', 'client_id': 'synthetic-id'}))
            self.assertEqual(runner.run(root), 'LOCAL_CLIENT_FILE_MISSING')
            client = root / 'original.json'
            client.write_text(json.dumps({'installed': {'client_id': 'synthetic-id', 'client_secret': 'synthetic-secret'}}))
            before = {p.name: p.read_bytes() for p in root.iterdir()}
            with patch.object(check_oauth_local, 'check', return_value='OAUTH_LOCAL_OK') as check:
                self.assertEqual(runner.run(root), 'OAUTH_LOCAL_OK')
                self.assertEqual(check.call_args.args[1], 'synthetic-token')
                self.assertFalse(check.call_args.args[2].http.follow_redirects)
            self.assertEqual(before, {p.name: p.read_bytes() for p in root.iterdir()})
            token.write_text(json.dumps({'refresh_token': 'synthetic-token', 'client_id': 'different'}))
            with patch.object(check_oauth_local, 'check') as check:
                self.assertEqual(runner.run(root), 'LOCAL_CLIENT_BINDING_MISMATCH')
                check.assert_not_called()
            (root / 'duplicate.json').write_bytes(client.read_bytes())
            self.assertEqual(runner.run(root), 'LOCAL_CLIENT_FILE_AMBIGUOUS')

    def test_sync_sends_only_verified_set_through_stdin(self):
        spec = importlib.util.spec_from_file_location('sync_oauth', ROOT / 'tools/backup/windows/sync_github_oauth.py')
        with patch.dict(sys.modules, {'run_local': runner}):
            sync = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(sync)
        client = {'client_id': 'synthetic-id', 'client_secret': 'synthetic-secret'}
        success = type('Result', (), {'returncode': 0})()
        failure = type('Result', (), {'returncode': 1})()
        with patch.object(sync.shutil, 'which', return_value='gh'), patch.object(sync.subprocess, 'run', return_value=success) as execute:
            self.assertEqual(sync.sync(client, 'synthetic-refresh'), 'GITHUB_OAUTH_SYNC_OK')
            self.assertEqual(execute.call_count, 4)
            for call, value in zip(execute.call_args_list[1:], ['synthetic-id', 'synthetic-secret', 'synthetic-refresh']):
                self.assertNotIn(value, call.args[0])
                self.assertEqual(call.kwargs['input'], value.encode())
                self.assertTrue(call.kwargs['capture_output'])
                self.assertIn('production-backup', call.args[0])
        with patch.object(sync.shutil, 'which', return_value='gh'), patch.object(sync.subprocess, 'run', side_effect=[success, success, failure]) as execute:
            self.assertEqual(sync.sync(client, 'synthetic-refresh'), 'GITHUB_OAUTH_SYNC_INCOMPLETE')
            self.assertEqual(execute.call_count, 3)

    def test_failed_oauth_never_calls_sync(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'drive_oauth_token.json').write_text(json.dumps({'refresh_token': 'synthetic-token'}))
            (root / 'original.json').write_text(json.dumps({'installed': {'client_id': 'synthetic-id', 'client_secret': 'synthetic-secret'}}))
            callback = unittest.mock.Mock(return_value='GITHUB_OAUTH_SYNC_OK')
            with patch.object(check_oauth_local, 'check', return_value='OAUTH_INVALID_GRANT'):
                self.assertEqual(runner.run(root, on_success=callback), 'OAUTH_INVALID_GRANT')
                callback.assert_not_called()
            with patch.object(check_oauth_local, 'check', return_value='OAUTH_LOCAL_OK'):
                self.assertEqual(runner.run(root, on_success=callback), 'GITHUB_OAUTH_SYNC_OK')
                callback.assert_called_once()
