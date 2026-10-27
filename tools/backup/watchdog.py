"""Independent control-plane monitoring. No Drive/PG credentials or production I/O."""
import json
import os
from pathlib import Path
import subprocess
from datetime import datetime,timezone
REPO='asm114/adwaa-alsharq'
WORKFLOW='database-backup.yml'
CODES={'BACKUP_RUN_MISSING','BACKUP_RUN_STALE','BACKUP_RUN_FAILED','BACKUP_RUN_STALLED',
       'BACKUP_RUN_INCOMPLETE','BACKUP_MONITOR_API_FAILED','BACKUP_CLOCK_INVALID'}

def evaluate(runs,jobs,now,maximum_age=30,maximum_duration=2):
    eligible=[r for r in runs if r.get('event')=='schedule' and r.get('head_branch')=='main']
    if not eligible:return {'code':'BACKUP_RUN_MISSING','healthy':False}
    run=max(eligible,key=lambda r:r['created_at'])
    age=(now-datetime.fromisoformat(run['created_at'].replace('Z','+00:00'))).total_seconds()/3600
    link='https://github.com/'+REPO+'/actions/runs/'+str(int(run['id']))
    result={'run_url':link,'run_id':int(run['id']),'healthy':False}
    if age<-.0833:return {**result,'code':'BACKUP_CLOCK_INVALID'}
    if age>maximum_age:return {**result,'code':'BACKUP_RUN_STALE'}
    if run.get('status')!='completed':
        if age>maximum_duration:return {**result,'code':'BACKUP_RUN_STALLED'}
        previous=[r for r in eligible if r.get('status')=='completed' and r.get('conclusion')=='success']
        # A running job alone never certifies a recent backup.
        previous=[r for r in previous if 0<=(now-datetime.fromisoformat(r['created_at'].replace('Z','+00:00'))).total_seconds()<=maximum_age*3600]
        return {**result,'code':'BACKUP_RUN_IN_PROGRESS','healthy':bool(previous), 'backup_certified_by_monitor':False,'pending_grace':True}
    if run.get('conclusion')!='success':return {**result,'code':'BACKUP_RUN_FAILED'}
    successful={j['name'] for j in jobs if j.get('conclusion')=='success'}
    if not {'backup (core, CORE)','backup (portal, PORTAL)'}<=successful:
        return {**result,'code':'BACKUP_RUN_INCOMPLETE'}
    return {**result,'code':'BACKUP_WORKFLOW_RECENT','healthy':True,'drive_integrity_checked':False}

def api(path):
    result=subprocess.run(['gh','api','repos/'+REPO+'/'+path],check=True,capture_output=True,text=True,timeout=60)
    return json.loads(result.stdout)

def check(maximum_age=30,maximum_duration=2):
    data=api('actions/workflows/'+WORKFLOW+'/runs?branch=main&event=schedule&per_page=100')
    runs=data['workflow_runs'];eligible=[r for r in runs if r.get('event')=='schedule' and r.get('head_branch')=='main']
    latest=max(eligible,key=lambda r:r['created_at']) if eligible else None
    jobs=api('actions/runs/'+str(int(latest['id']))+'/jobs?per_page=100')['jobs'] if latest and latest.get('conclusion')=='success' else []
    return evaluate(runs,jobs,datetime.now(timezone.utc),maximum_age,maximum_duration)

def main():
    plan=json.loads((Path(__file__).resolve().parents[2]/'docs/backup/activation-plan.json').read_text())
    if plan.get('enabled') is not True or plan.get('monitoring_enabled') is not True:
        print(json.dumps({'code':'BACKUP_MONITOR_NOT_ACTIVATED','healthy':False,'monitoring_active':False}));return 0
    try:
        maximum_age=int(plan.get('maximum_backup_age_hours',30));maximum_duration=int(plan.get('maximum_workflow_duration_hours',2))
        if not (0<maximum_age<=48 and 0<maximum_duration<=6):raise ValueError('invalid monitor limits')
        report=check(maximum_age,maximum_duration)
    except Exception:report={'code':'BACKUP_MONITOR_API_FAILED','healthy':False}
    print(json.dumps(report))
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'],'a') as out:out.write('code='+report['code']+'\n')
    return 0 if report['healthy'] or report.get('pending_grace') else 1
if __name__=='__main__':raise SystemExit(main())
