import contextlib
import importlib.util
import io
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools/backup'))
import backup as b
import drive_store as d
import recover_existing as r
from test_drive_store import Service,Download,metadata,FOLDER,EMAIL,CURRENT


class ExistingRecoveryTests(unittest.TestCase):
    def fixture(self):
        service=Service()
        for prefix,bid,parts in [('old',r.OLD_PORTAL_ID,b.FULL_PARTS[:3]),('new',CURRENT,b.FULL_PARTS)]:
            for i,part in enumerate(parts):
                file_id=prefix+'-file-'+str(i);data=('synthetic-'+part).encode()
                service.rows[file_id]=metadata(file_id,d.PREFIX+bid+'/'+part+'.enc',data)
                service.payloads[file_id]=data
        return service,d.DriveStore(service,FOLDER,EMAIL,100000)

    def test_original_partial_is_never_a_recovery_candidate(self):
        service,store=self.fixture()
        observed=store.audit_existing()
        bid,rows=r.select_new_portal_group(observed)
        self.assertEqual(bid,CURRENT)
        self.assertTrue(all(row['backup_id']!=r.OLD_PORTAL_ID for row in rows))
        service.rows.pop('new-file-3')
        with self.assertRaises(b.GateError) as error:r.select_new_portal_group(store.audit_existing())
        self.assertEqual(str(error.exception),'RECOVERY_FOUR_PARTS_REQUIRED')

    def test_no_markers_on_failed_restore_and_no_new_payload_upload(self):
        for failure in [True,False]:
            service,store=self.fixture();before=dict(service.payloads)
            result={'restore_verified':True,'storage_files_verified':True,'storage_service_restore_verified':False,'backup_id':CURRENT,'project':b.PROJECT}
            with tempfile.TemporaryDirectory() as folder,patch.dict(os.environ,{'RUNNER_TEMP':folder}),patch.object(d,'MediaIoBaseDownload',Download),patch.object(b,'isolated_restore',side_effect=b.GateError('synthetic restore failed') if failure else None,return_value=result):
                if failure:
                    with self.assertRaises(b.GateError):r.recover_portal(store,{})
                    self.assertEqual(service.uploaded,0)
                else:
                    recovered=r.recover_portal(store,{})
                    self.assertTrue(recovered['restore_verified'])
                    self.assertEqual(service.uploaded,2)  # JSON markers only
            self.assertTrue(all(service.payloads[k]==v for k,v in before.items()))
            self.assertEqual(service.deleted,[])

    def test_source_credentials_rejected_before_any_network(self):
        config={'BACKUP_COST_APPROVED':'true','BACKUP_EXECUTION_APPROVED':'true','BACKUP_RESTORE_APPROVED':'true','BACKUP_DRIVE_RETENTION_APPROVED':'false','BACKUP_SCHEDULE_APPROVED':'false','PGHOST':'synthetic'}
        out=io.StringIO()
        with patch.dict(os.environ,config,clear=True),patch.object(r,'authenticate') as auth,contextlib.redirect_stdout(out):
            self.assertEqual(r.main(),1);auth.assert_not_called()
        self.assertIn('RECOVERY_SOURCE_CREDENTIALS_PROHIBITED',out.getvalue())

    def test_workflow_restores_existing_only_under_review(self):
        text=(ROOT/'.github/workflows/backup-recover-existing.yml').read_text()
        for term in ['environment: production-backup','github.event.after == github.sha','ref: ${{ github.sha }}','tools/backup/recover_existing.py',"BACKUP_DRIVE_RETENTION_APPROVED: 'false'","BACKUP_SCHEDULE_APPROVED: 'false'"]:
            self.assertIn(term,text)
        for term in ['PGHOST:','PGPASSWORD:','BACKUP_STORAGE_API_KEY:','schedule:','backup.py backup','first_capture.py']:
            self.assertNotIn(term,text)

    def test_final_retry_exports_portal_only_and_keeps_core_source_secrets_absent(self):
        text=(ROOT/'.github/workflows/backup-final-retry.yml').read_text()
        core=text.split('      - name: Restore existing Core only;',1)[1].split('      - name: New Portal',1)[0]
        self.assertIn("if: matrix.target == 'core'",core)
        self.assertIn('tools/backup/recover_existing.py',core)
        for forbidden in ['PGHOST:','PGPASSWORD:','BACKUP_STORAGE_API_KEY:','first_capture.py']:
            self.assertNotIn(forbidden,core)
        self.assertIn("if: matrix.target == 'portal'",text)
        self.assertIn('tools/backup/first_capture.py',text)
        self.assertIn('environment: production-backup',text)
        self.assertIn('github.event.after == github.sha',text)
        self.assertIn("BACKUP_DRIVE_RETENTION_APPROVED: 'false'",text)
        self.assertNotIn('schedule:',text)
