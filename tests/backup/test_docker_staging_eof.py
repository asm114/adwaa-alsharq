"""Regression for isolated restore staging: explicit EOF and byte-count validation."""
import io
import os
import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'tools/backup'))
import backup

CONTAINER='adwaa-backup-restore-'+'a'*12

@unittest.skipUnless(hasattr(os,'memfd_create'),'memfd unsupported')
class DockerStagingTests(unittest.TestCase):
    def test_finite_memfd_stream_and_verified_length(self):
        plaintext=b'customer-data-is-not-used-in-this-test'
        calls=[]
        def fake_run(args,**kw):
            calls.append((args,kw))
            if '-i' in args:
                self.assertIsNotNone(kw.get('stdin'))
                self.assertEqual(kw['stdin'].read(),plaintext)
                return subprocess.CompletedProcess(args,0,b'',b'')
            return subprocess.CompletedProcess(args,0,str(len(plaintext)).encode()+b'\n',b'')
        with patch.object(backup.subprocess,'run',side_effect=fake_run):
            backup.stage_file(CONTAINER,'/tmp/database',len(plaintext),
                              lambda sink:sink.write(plaintext))
        self.assertEqual(len(calls),2)
        self.assertIn('exec',calls[0][0])
        self.assertIn('-i',calls[0][0])
        self.assertNotIn(plaintext.decode(),str(calls[0][0]))
    def test_successful_copy_with_wrong_byte_count_fails_closed(self):
        def fake_run(args,**kw):
            return subprocess.CompletedProcess(args,0,b'1\n',b'')
        with patch.object(backup.subprocess,'run',side_effect=fake_run):
            with self.assertRaises(backup.RestoreError) as caught:
                backup.stage_file(CONTAINER,'/tmp/database',3,lambda sink:sink.write(b'abc'))
        self.assertEqual(caught.exception.code,'RESTORE_STAGING_PROCESS_FAILED')
    def test_cli_timeout_fails_closed(self):
        with patch.object(backup.subprocess,'run',side_effect=subprocess.TimeoutExpired('docker',180)):
            with self.assertRaises(backup.RestoreError) as caught:
                backup.stage_file(CONTAINER,'/tmp/database',3,lambda sink:sink.write(b'abc'))
        self.assertEqual(caught.exception.code,'RESTORE_STAGING_TIMEOUT')

if __name__=='__main__':unittest.main()
