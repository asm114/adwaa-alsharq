import base64
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools/backup'))
import backup as b
import drive_store as d
import verify_portal_partial as p
from test_drive_store import Service, Download, FOLDER, EMAIL, metadata


class PortalPartialTests(unittest.TestCase):
    def test_authenticate_partial_without_plaintext_files_or_drive_changes(self):
        secret=b'z'*32
        service=Service();expected={}
        document={'project':p.PROJECT,'backup_id':p.BACKUP_ID,'tables':[{'rows':1}], 'storage':{'files':[{}]}}
        payloads={'database.enc':b'SYNTHETIC-SENSITIVE-ROW','roles.enc':b'SYNTHETIC-ROLE', 'verification.enc':json.dumps(document).encode()}
        with tempfile.TemporaryDirectory() as source,tempfile.TemporaryDirectory() as destination:
            for i,(part,plain) in enumerate(payloads.items()):
                file_id='synthetic-file-'+str(i);path=Path(source)/part
                b.seal(io.BytesIO(plain),path,secret,p.PROJECT+'/'+p.BACKUP_ID+'/'+part[:-4])
                cipher=path.read_bytes();expected[part]=(file_id,len(cipher))
                service.rows[file_id]=metadata(file_id,d.PREFIX+p.BACKUP_ID+'/'+part,cipher)
                service.payloads[file_id]=cipher
            store=d.DriveStore(service,FOLDER,EMAIL,100000)
            observed=store.audit_existing()
            with patch.object(p,'TARGET','portal'),patch.object(p,'EXPECTED',expected),patch.dict(os.environ,{'RUNNER_TEMP':destination,'BACKUP_ENCRYPTION_KEY':base64.b64encode(secret).decode()}),patch.object(d,'MediaIoBaseDownload',Download),patch.object(service,'create') as create,patch.object(service,'delete') as delete:
                result=p.verify(store,observed)
                create.assert_not_called();delete.assert_not_called()
            self.assertEqual(len(result['verified_parts']),3)
            self.assertTrue(all(row['gcm_authenticated'] for row in result['verified_parts']))
            self.assertFalse(result['full_backup_complete']);self.assertFalse(result['restore_verified'])
            self.assertFalse(result['storage_payload_present'])
            self.assertEqual(list(Path(destination).iterdir()),[])
            self.assertEqual(service.uploaded,0)
            with patch.object(p,'TARGET','portal'),patch.object(p,'EXPECTED',expected),patch.dict(os.environ,{'RUNNER_TEMP':destination,'BACKUP_ENCRYPTION_KEY':base64.b64encode(b'w'*32).decode()}),patch.object(d,'MediaIoBaseDownload',Download):
                with self.assertRaises(p.PartialVerificationError) as error:p.verify(store,observed)
                self.assertEqual(error.exception.code,'PARTIAL_GCM_AUTHENTICATION_FAILED')
            self.assertEqual(list(Path(destination).iterdir()),[])
