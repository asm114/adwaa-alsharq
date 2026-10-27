import io,json,os,sys,unittest
from pathlib import Path
from unittest.mock import patch
from contextlib import redirect_stdout
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'tools/backup'))
import automation_policy as p
import automatic

class AutomationPolicyTests(unittest.TestCase):
    def config(self):return {'enabled':True,'monitoring_enabled':True,'deletion_enabled':False,
        'database_restore_verified':True,'storage_official_api_restore_verified':True,
        'daily_cron_utc':'0 0 * * *','timezone':'Asia/Riyadh'}
    def env(self):return {'GITHUB_REPOSITORY':p.REPO,'GITHUB_REF':'refs/heads/main',
        'GITHUB_EVENT_NAME':'schedule','BACKUP_DRIVE_RETENTION_APPROVED':'false',
        'BACKUP_AUTO_EXECUTION_APPROVED':'true'}
    def test_mode_branch_event_activation_owner_and_restore_gates(self):
        with patch.dict(os.environ,self.env(),clear=True):
            for mode in ('backup','health'):p.validate(self.config(),mode)
            for mode in ('restore','init-drive','preflight','inspect-drive','retention-plan',''):
                with self.assertRaises(p.PolicyError):p.validate(self.config(),mode)
        for delta in [{'GITHUB_REF':'refs/heads/ops/encrypted-daily-backup-20261024'},
                      {'GITHUB_EVENT_NAME':'pull_request_target'},
                      {'GITHUB_REPOSITORY':'other/repository'},
                      {'BACKUP_AUTO_EXECUTION_APPROVED':'false'},
                      {'BACKUP_DRIVE_RETENTION_APPROVED':'true'}]:
            with patch.dict(os.environ,{**self.env(),**delta},clear=True),self.assertRaises(p.PolicyError):
                p.validate(self.config(),'backup')
        for field,value in [('enabled',False),('monitoring_enabled',False),('deletion_enabled',True),
                ('database_restore_verified',False),('storage_official_api_restore_verified',False),
                ('daily_cron_utc','0 3 * * *'),('timezone','UTC')]:
            with patch.dict(os.environ,self.env(),clear=True),self.assertRaises(p.PolicyError):
                p.validate({**self.config(),field:value},'backup')

    def test_environment_main_protection_and_exact_single_branch(self):
        rules=[{'type':kind} for kind in ['pull_request','deletion','non_fast_forward']]
        rules.append({'type':'required_status_checks','parameters':{'required_status_checks':[{'context':c} for c in p.CHECKS]}})
        safe=[{'protected':True},rules,{'deployment_branch_policy':{'protected_branches':False,'custom_branch_policies':True},
            'protection_rules':[]},{'total_count':1,'branch_policies':[{'name':'main','type':'branch'}]}]
        with patch.object(p,'api',side_effect=safe):p.verify_environment()
        from copy import deepcopy
        for change in ('main','rules','checks','any-branch','reviewer','wildcard','tag','extra','timer','unknown-rule'):
            data=deepcopy(safe)
            if change=='main':data[0]['protected']=False
            elif change=='rules':data[1]=[]
            elif change=='checks':data[1][-1]['parameters']['required_status_checks']=[]
            elif change=='any-branch':data[2]['deployment_branch_policy']=None
            elif change=='reviewer':data[2]['protection_rules']=[{'type':'required_reviewers'}]
            elif change=='wildcard':data[3]['branch_policies'][0]['name']='*'
            elif change=='tag':data[3]['branch_policies'][0]['type']='tag'
            elif change=='extra':data[3]['total_count']=2
            elif change=='timer':data[2]['protection_rules']=[{'type':'wait_timer','wait_timer':5}]
            else:data[2]['protection_rules']=[{'type':'custom_deployment_protection_rule'}]
            with patch.object(p,'api',side_effect=data),self.assertRaises(p.PolicyError):p.verify_environment()

    def test_unactivated_plan_does_not_call_any_github_or_data_api(self):
        plan=self.config();plan['enabled']=False
        output=io.StringIO()
        with patch.dict(os.environ,self.env(),clear=True),patch.object(p.PLAN.__class__,'read_text',return_value=json.dumps(plan)),\
             patch.object(p,'api') as api,redirect_stdout(output):
            self.assertEqual(p.main(),0)
        api.assert_not_called();self.assertEqual(json.loads(output.getvalue())['ready'],False)

    def test_wrapper_cannot_run_engine_on_policy_failure(self):
        with patch.object(p,'admit',side_effect=p.PolicyError('BACKUP_AUTO_MAIN_UNPROTECTED')),\
             patch.object(sys,'argv',['automatic.py','backup']),patch('runtime.main') as engine,redirect_stdout(io.StringIO()):
            self.assertEqual(automatic.main(),1)
        engine.assert_not_called()

    def test_wrapper_scopes_restore_permission_to_fixed_backup_or_health(self):
        with patch.dict(os.environ,{},clear=True),patch.object(p,'admit') as admit,\
             patch.object(sys,'argv',['automatic.py','backup']),patch('runtime.main',return_value=0):
            self.assertEqual(automatic.main(),0);admit.assert_called_once_with('backup')
            self.assertEqual(os.environ['BACKUP_MODE'],'backup')
            self.assertEqual(os.environ['BACKUP_DRIVE_RETENTION_APPROVED'],'false')
            self.assertEqual(os.environ['BACKUP_DRIVE_SETUP_APPROVED'],'false')

    def test_workflow_environment_and_monitor_match_daily_fixed_operation(self):
        root=Path(__file__).resolve().parents[2]
        daily=(root/'.github/workflows/backup-daily.yml').read_text()
        self.assertNotIn('inputs.',daily);self.assertNotIn('schedule:',daily)
        self.assertIn('tools/backup/automatic.py backup',daily)
        self.assertIn('environment: production-backup-auto',daily)
        self.assertIn("needs.admission.outputs.ready == 'true'",daily)
        manual=(root/'.github/workflows/database-backup.yml').read_text()
        self.assertIn('environment: production-backup\n',manual)
        self.assertNotIn('production-backup-auto',manual)
        import watchdog
        self.assertEqual(watchdog.WORKFLOW,'backup-daily.yml')
