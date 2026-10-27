"""Fail-closed admission for the dedicated automatic environment. No secrets."""
import json
import os
from pathlib import Path
import subprocess
REPO='asm114/adwaa-alsharq'
ENVIRONMENT='production-backup-auto'
PLAN=Path(__file__).resolve().parents[2]/'docs/backup/activation-plan.json'
CHECKS={'stability','synthetic-only (core)','synthetic-only (portal)','official-storage-service'}

class PolicyError(Exception):pass

def need(value,code):
    if not value:raise PolicyError(code)

def api(path):
    try:
        result=subprocess.run(['gh','api','repos/'+REPO+'/'+path],capture_output=True,
                              text=True,check=True,timeout=30)
        return json.loads(result.stdout)
    except Exception:raise PolicyError('BACKUP_AUTO_POLICY_READ_FAILED') from None

def validate(plan,mode):
    need(mode in ('backup','health'),'BACKUP_AUTO_MODE_PROHIBITED')
    need(os.environ.get('GITHUB_REPOSITORY')==REPO and
         os.environ.get('GITHUB_REF')=='refs/heads/main','BACKUP_AUTO_MAIN_ONLY')
    need(os.environ.get('GITHUB_EVENT_NAME') in ('schedule','workflow_dispatch'),
         'BACKUP_AUTO_EVENT_PROHIBITED')
    need(plan.get('enabled') is True and plan.get('monitoring_enabled') is True,
         'BACKUP_AUTO_NOT_ACTIVATED')
    need(plan.get('deletion_enabled') is False and
         os.environ.get('BACKUP_DRIVE_RETENTION_APPROVED')=='false','BACKUP_AUTO_DELETION_PROHIBITED')
    need(plan.get('database_restore_verified') is True and
         plan.get('storage_official_api_restore_verified') is True,'BACKUP_AUTO_RESTORE_EVIDENCE_REQUIRED')
    need(os.environ.get('BACKUP_AUTO_EXECUTION_APPROVED')=='true','BACKUP_AUTO_OWNER_APPROVAL_REQUIRED')
    need(plan.get('daily_cron_utc')=='0 0 * * *' and plan.get('timezone')=='Asia/Riyadh',
         'BACKUP_AUTO_TIME_POLICY_INVALID')

def verify_environment():
    need(api('branches/main').get('protected') is True,'BACKUP_AUTO_MAIN_UNPROTECTED')
    rules=api('rules/branches/main')
    need(isinstance(rules,list),'BACKUP_AUTO_MAIN_RULES_INVALID')
    kinds={rule.get('type') for rule in rules}
    need({'pull_request','required_status_checks','deletion','non_fast_forward'}<=kinds,
         'BACKUP_AUTO_MAIN_RULES_INCOMPLETE')
    checks={check.get('context') for rule in rules if rule.get('type')=='required_status_checks'
            for check in rule.get('parameters',{}).get('required_status_checks',[])}
    need(CHECKS<=checks,'BACKUP_AUTO_REQUIRED_CHECKS_INCOMPLETE')
    environment=api('environments/'+ENVIRONMENT)
    need(environment.get('deployment_branch_policy')=={'protected_branches':False,'custom_branch_policies':True},
         'BACKUP_AUTO_BRANCH_POLICY_INVALID')
    need(not any(rule.get('type') not in ('branch_policy','wait_timer') or
                 (rule.get('type')=='wait_timer' and rule.get('wait_timer',0)>0)
                 for rule in environment.get('protection_rules',[])),
         'BACKUP_AUTO_UNATTENDED_POLICY_INVALID')
    policies=api('environments/'+ENVIRONMENT+'/deployment-branch-policies?per_page=100')
    rows=policies.get('branch_policies',[])
    need(policies.get('total_count')==1 and len(rows)==1 and
         rows[0].get('name')=='main' and rows[0].get('type')=='branch',
         'BACKUP_AUTO_MAIN_ONLY_POLICY_REQUIRED')

def admit(mode):
    validate(json.loads(PLAN.read_text()),mode)
    verify_environment()

def main():
    try:admit('backup');code='BACKUP_AUTO_POLICY_READY';ready=True
    except PolicyError as error:code=str(error);ready=False
    except Exception:code='BACKUP_AUTO_POLICY_READ_FAILED';ready=False
    print(json.dumps({'code':code,'ready':ready}))
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'],'a') as out:out.write('ready='+str(ready).lower()+'\n')
    return 0 if ready or code=='BACKUP_AUTO_NOT_ACTIVATED' else 1

if __name__=='__main__':raise SystemExit(main())
