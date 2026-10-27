import io,json,os,sys,tempfile,unittest
from pathlib import Path
from datetime import datetime,timezone,timedelta
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'tools/backup'))
import watchdog as w
import notify as n
import backup as b
import runtime as r
ROOT=Path(__file__).resolve().parents[2]

class ReadinessMonitoringTests(unittest.TestCase):
    def run_row(self,now,**changes):
        return dict({'id':123,'event':'schedule','head_branch':'main','created_at':now.isoformat(),
                     'status':'completed','conclusion':'success'},**changes)
    def test_watchdog_missing_stale_failed_waiting_and_matrix(self):
        now=datetime.now(timezone.utc);jobs=[{'name':'backup ('+t+', '+t.upper()+')','conclusion':'success'} for t in ['core','portal']]
        self.assertEqual(w.evaluate([],[],now)['code'],'BACKUP_RUN_MISSING')
        recent=self.run_row(now-timedelta(hours=2))
        self.assertTrue(w.evaluate([recent],jobs,now)['healthy'])
        self.assertEqual(w.evaluate([recent],jobs[:1],now)['code'],'BACKUP_RUN_INCOMPLETE')
        cases=[({'created_at':(now-timedelta(hours=31)).isoformat()},'BACKUP_RUN_STALE'),
               ({'conclusion':'failure'},'BACKUP_RUN_FAILED'),
               ({'status':'waiting','conclusion':None,'created_at':(now-timedelta(hours=3)).isoformat()},'BACKUP_RUN_STALLED'),
               ({'created_at':(now+timedelta(hours=1)).isoformat()},'BACKUP_CLOCK_INVALID')]
        for delta,code in cases:
            self.assertEqual(w.evaluate([{**recent,**delta}],jobs,now)['code'],code)
        pending=w.evaluate([self.run_row(now,status='waiting',conclusion=None)],[],now)
        self.assertFalse(pending['healthy']);self.assertTrue(pending['pending_grace'])
        self.assertFalse(pending['backup_certified_by_monitor'])
        self.assertEqual(w.evaluate([dict(recent,event='workflow_dispatch')],jobs,now)['code'],'BACKUP_RUN_MISSING')

    def test_alert_fixed_body_deduplication_and_no_sensitive_diagnostics(self):
        calls=[]
        def gh(args):
            calls.append(args)
            if args[:2]==['issue','list']:return '[]'
            content=Path(args[args.index('--body-file')+1]).read_text()
            self.assertIn('https://github.com/asm114/adwaa-alsharq/actions/runs/123',content)
            self.assertNotIn('private-sensitive-error',content)
            self.assertIn('BACKUP_MONITOR_FAILED',content)
            return ''
        with patch.object(n,'gh',side_effect=gh):
            self.assertEqual(n.send('private-sensitive-error',123)['code'],'BACKUP_ALERT_DELIVERED')
        tag='<!--adwaa-backup-alert:BACKUP_RUN_STALE:123-->'
        existing=[{'title':n.TITLE,'number':1,'body':tag,'comments':[]}]
        with patch.object(n,'gh',return_value=json.dumps(existing)) as gh:
            self.assertEqual(n.send('BACKUP_RUN_STALE',123)['code'],'BACKUP_ALERT_ALREADY_RECORDED')
            self.assertEqual(gh.call_count,1)

    def test_schedule_approval_does_not_enable_or_require_deletion(self):
        config={'GITHUB_REF':'refs/heads/main','GITHUB_EVENT_NAME':'schedule',
                'BACKUP_SCHEDULE_APPROVED':'true','BACKUP_PRODUCTION_RESTORE_VERIFIED':'true',
                'BACKUP_DRIVE_RETENTION_APPROVED':'false'}
        with patch.dict(os.environ,config,clear=True),patch.object(b.sys,'argv',['backup.py','health']),\
             patch.object(b,'storage',return_value=(None,None,None)),patch.object(b,'health',return_value={'recent_restored_backup':True}):
            b.main()
        for delta in [{'BACKUP_SCHEDULE_APPROVED':'false'},{'BACKUP_PRODUCTION_RESTORE_VERIFIED':'false'},
                      {'BACKUP_DRIVE_RETENTION_APPROVED':'true'},{'GITHUB_REF':'refs/heads/unreviewed'}]:
            with patch.dict(os.environ,{**config,**delta},clear=True),patch.object(b.sys,'argv',['backup.py','health']),\
                 patch.object(b,'storage') as store,self.assertRaises(b.GateError):b.main()
            store.assert_not_called()

    def test_operational_defaults_reject_swapped_folders(self):
        with patch.dict(os.environ,{},clear=True):
            plan=r.configure();self.assertEqual(os.environ['BACKUP_DRIVE_FOLDER_ID'],plan['folder'])
            self.assertEqual(int(os.environ['BACKUP_DRIVE_ESTIMATED_DAILY_BYTES']),plan['daily'])
        with patch.dict(os.environ,{'BACKUP_DRIVE_FOLDER_ID':'other-folder'},clear=True),self.assertRaises(b.GateError):r.configure()

    def test_activation_and_all_triggers_remain_disabled(self):
        plan=json.loads((ROOT/'docs/backup/activation-plan.json').read_text())
        for field in ['enabled','monitoring_enabled','deletion_enabled','oauth_secret_rotation_verified']:
            self.assertIs(plan[field],False)
        self.assertIs(plan['storage_official_api_restore_verified'],True)
        for filename in ['database-backup.yml','backup-daily.yml','backup-health.yml','backup-watchdog.yml']:
            text=(ROOT/'.github/workflows'/filename).read_text()
            self.assertNotIn('schedule:',text);self.assertNotIn('pull_request_target',text)
        api=(ROOT/'.github/workflows/backup-storage-api-test.yml').read_text()
        for forbidden in ['PGHOST:','PGPASSWORD:','BACKUP_STORAGE_API_KEY:','upload-artifact']:
            self.assertNotIn(forbidden,api)
        self.assertIn('environment: production-backup',api)
        self.assertIn('github.event.after == github.sha',api)

    def test_health_stale_logical_date_and_same_size_ciphertext_tampering(self):
        now=b.datetime.now(b.timezone.utc);bid=now.strftime('%Y%m%dT%H%M%SZ')+'-'+'a'*32
        manifest={'project':b.PROJECT,'format':2,'backup_id':bid,'files':{p:{'bytes':3,'sha256':'a'*64} for p in b.FULL_PARTS}}
        evidence={'project':b.PROJECT,'backup_id':bid,'restore_verified':True,'tables_verified':1,'storage_files_verified':True}
        class Store:
            remote_checksum=True
            def get_paginator(self,*args):return self
            def paginate(self,**kw):return [{'Contents':[{'Key':b.PREFIX+manifest['backup_id']+'/complete.json','LastModified':now}]}]
            def get_object(self,**kw):return {'Body':io.BytesIO(json.dumps(evidence if kw['Key'].endswith('restore-ok.json') else manifest).encode())}
            def head_object(self,**kw):return {'ContentLength':3,'SHA256':'a'*64}
        store=Store()
        self.assertTrue(b.health(store,'bucket','owner')['recent_restored_backup'])
        with patch.object(store,'head_object',return_value={'ContentLength':3,'SHA256':'b'*64}),self.assertRaises(b.GateError):b.health(store,'bucket','owner')
        stale=(now-timedelta(hours=31)).strftime('%Y%m%dT%H%M%SZ')+'-'+'a'*32
        manifest['backup_id']=stale;evidence['backup_id']=stale
        with self.assertRaises(b.GateError):b.health(store,'bucket','owner')
