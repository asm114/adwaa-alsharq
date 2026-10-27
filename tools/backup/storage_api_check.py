"""Protected official-API test of the already verified Portal capture. No export."""
import json
import os
from pathlib import Path
import tempfile
from contextlib import ExitStack,closing
import backup as engine
from drive_store import authenticate,DriveStore,inspection_report,DriveError,safe_diagnostic
from first_capture import PLANS
from storage_api_restore import Sandbox,authenticated_archive,restore,ApiRestoreError,need
from cryptography.exceptions import InvalidTag

BACKUP_ID='20261026T195727Z-77e060a989874b1bbfb66d0b5bd4e428'
HASHES={
 'database':'9d1fe6d803e2151125edc91047a2494886f43181b3a1489c3811479f72308cc8',
 'roles':'3935a3b40416039024d7dd2efe89e5d4c0b4d4334f6949a42ee11be2bc5be72b',
 'verification':'aaabe2809cdcac0592e948f5e7d88f8b24c7f3851ad9739d80e4ce0669a908da',
 'storage':'3777677afac629958b04be93542edef814af5c51738aeaeb1ce3aff98e71834b'}

def execute(report):
    need(engine.PROJECT=='ztqqdjryvecscidxxbfe','API_RESTORE_SOURCE_TARGET_INVALID')
    need(not any(os.environ.get(k) for k in ['PGHOST','PGPASSWORD','BACKUP_STORAGE_API_KEY']),
         'API_RESTORE_SOURCE_CREDENTIALS_PROHIBITED')
    need(os.environ.get('BACKUP_COST_APPROVED')=='true','API_RESTORE_COST_APPROVAL_REQUIRED')
    need(os.environ.get('BACKUP_DRIVE_RETENTION_APPROVED')=='false' and
         os.environ.get('BACKUP_SCHEDULE_APPROVED')=='false','API_RESTORE_DELETION_SCHEDULE_PROHIBITED')
    need(os.environ.get('BACKUP_STORAGE_API_RESTORE_APPROVED')=='true','API_RESTORE_APPROVAL_REQUIRED')
    mode=os.environ.get('BACKUP_STORAGE_API_TEST_MODE','hosted')
    need(mode in ('docker','hosted'),'API_RESTORE_MODE_INVALID')
    with ExitStack() as resources:
        if mode=='docker':
            from local_storage_service import service as isolated_storage
            sandbox=resources.enter_context(isolated_storage())
        else:
            sandbox=resources.enter_context(closing(Sandbox(os.environ.get('BACKUP_STORAGE_RESTORE_PROJECT_REF',''),
                os.environ.get('BACKUP_STORAGE_RESTORE_CONFIRMED_PROJECT_REF',''),
                os.environ.get('BACKUP_STORAGE_RESTORE_API_KEY',''),
                os.environ.get('BACKUP_STORAGE_API_RESTORE_APPROVED',''))))
        report.update(service_target=mode,hosted_supabase_restore_verified=False)
        plan=PLANS['portal'];service=authenticate();email=engine.env('BACKUP_DRIVE_ACCOUNT')
        observed=inspection_report(service,email)
        need(observed['folder_ids']==[plan['folder']],'API_RESTORE_SOURCE_FOLDER_MISMATCH')
        store=DriveStore(service,plan['folder'],email,plan['daily']);store.preflight()
        root=engine.PREFIX+BACKUP_ID+'/'
        manifest=json.loads(store.get_object(Bucket=store.folder,Key=root+'complete.json')['Body'].read())
        evidence=json.loads(store.get_object(Bucket=store.folder,Key=root+'restore-ok.json')['Body'].read())
        need(manifest.get('format')==2 and manifest.get('project')==engine.PROJECT and
             manifest.get('backup_id')==BACKUP_ID and set(manifest.get('files',{}))==set(HASHES) and
             all(manifest['files'][p].get('sha256')==h for p,h in HASHES.items()),'API_RESTORE_PINNED_CAPTURE_MISMATCH')
        need(evidence.get('backup_id')==BACKUP_ID and evidence.get('project')==engine.PROJECT and
             evidence.get('restore_verified') is True and evidence.get('storage_files_verified') is True and
             evidence.get('storage_objects_verified')==31,'API_RESTORE_SQL_EVIDENCE_MISSING')
        temp_root=Path(engine.env('RUNNER_TEMP')).resolve()
        need(not temp_root.is_relative_to(Path(__file__).resolve().parents[2]),'API_RESTORE_TEMP_LOCATION_INVALID')
        report.update(stage='authenticate_existing_capture',source_backup_id=BACKUP_ID)
        with tempfile.TemporaryDirectory(prefix='adwaa-storage-api-',dir=temp_root) as directory:
            engine.fetch_committed(store,store.folder,email,manifest,directory)
            with authenticated_archive(engine,directory,manifest) as (stream,verification):
                report['stage']='official_api_sandbox_restore'
                need(len(verification['files'])==31 and
                     sum(item['bytes'] for item in verification['files'])==69349839,
                     'API_RESTORE_PINNED_INVENTORY_MISMATCH')
                restore(sandbox,stream,verification,report)
                report['hosted_supabase_restore_verified']=mode=='hosted'
        report['stage']='finished'

def main():
    os.umask(0o077)
    report={'code':'STORAGE_API_TEST_FAILED','stage':'safety_gates',
            'storage_service_restore_verified':False,'source_production_modified':False,
            'deletion_enabled':False}
    try:execute(report)
    except ApiRestoreError as error:report['code']=error.code
    except InvalidTag:report['code']='API_RESTORE_GCM_AUTHENTICATION_FAILED'
    except DriveError as error:report['code']=safe_diagnostic(error)
    except Exception:report['code']='STORAGE_API_TEST_FAILED'
    # Cleanup/transport failures after the last object must not retain a success
    # flag. Never emit URLs, names, response bodies, tokens or exception text.
    if report['code']!='STORAGE_API_RESTORE_VERIFIED':
        report.update(storage_service_restore_verified=False,hosted_supabase_restore_verified=False)
    print(json.dumps(report),flush=True)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with Path(os.environ['GITHUB_STEP_SUMMARY']).open('a') as out:
            out.write('```json\n'+json.dumps(report,indent=2)+'\n```\n')
    return 0 if report['code']=='STORAGE_API_RESTORE_VERIFIED' else 1

if __name__=='__main__':raise SystemExit(main())
