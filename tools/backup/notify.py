"""Deduplicated fixed-content GitHub Issue alerts. Never include exception text."""
import json
import os
import subprocess
import tempfile
from pathlib import Path
REPO='asm114/adwaa-alsharq'
TITLE='Production backup needs attention'
TEST_TITLE='[TEST ONLY] Adwaa backup alert notifier smoke test'
TEST_CODE='BACKUP_ALERT_DELIVERY_TEST'
CODES={'BACKUP_OPERATION_FAILED','BACKUP_HEALTH_FAILED','BACKUP_MONITOR_FAILED',
       'BACKUP_RUN_MISSING','BACKUP_RUN_STALE','BACKUP_RUN_FAILED','BACKUP_RUN_STALLED',
       'BACKUP_RUN_INCOMPLETE','BACKUP_MONITOR_API_FAILED','BACKUP_CLOCK_INVALID'}

def gh(args):
    return subprocess.run(['gh',*args,'--repo',REPO],check=True,capture_output=True,text=True,timeout=60).stdout

def send(code,run_id):
    if code != TEST_CODE and code not in CODES:code='BACKUP_MONITOR_FAILED'
    title=TEST_TITLE if code==TEST_CODE else TITLE
    run_id=int(run_id)
    if run_id<=0:raise ValueError('invalid run')
    link='https://github.com/'+REPO+'/actions/runs/'+str(run_id)
    tag='<!--adwaa-backup-alert:'+code+':'+str(run_id)+'-->'
    body=tag+'\n'+('TEST ONLY — no production incident. ' if code==TEST_CODE else '')+'Backup readiness requires attention: '+code+'.\nNo backup success is certified by this alert.\nReview: '+link+'\nDo not paste credentials, customer data or database logs.'
    rows=json.loads(gh(['issue','list','--state','open','--search',title+' in:title',
                       '--json','number,title,body,comments']))
    existing=next((row for row in rows if row['title']==title),None)
    if existing and any(tag in (value or '') for value in [existing.get('body')]+[c.get('body') for c in existing.get('comments',[])]):
        return {'code':'BACKUP_ALERT_ALREADY_RECORDED'}
    # Structured file avoids shell expansion and carries no secrets.
    with tempfile.TemporaryDirectory(prefix='adwaa-alert-') as folder:
        path=Path(folder)/'body.txt';path.write_text(body);path.chmod(0o600)
        if existing:gh(['issue','comment',str(int(existing['number'])),'--body-file',str(path)])
        else:gh(['issue','create','--title',title,'--body-file',str(path),'--assignee','asm114'])
    return {'code':'BACKUP_ALERT_DELIVERED'}

if __name__=='__main__':
    try:
        if os.environ.get('GITHUB_REPOSITORY')!=REPO:raise ValueError('wrong repository')
        print(json.dumps(send(os.environ.get('BACKUP_ALERT_CODE',''),os.environ.get('GITHUB_RUN_ID',''))))
    except Exception:
        print('BACKUP_ALERT_DELIVERY_FAILED');raise SystemExit(1) from None
