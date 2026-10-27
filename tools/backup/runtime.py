"""Operational defaults from measured, owner-reviewed targets. No new engine."""
import os
import json
import sys
import backup as engine
from first_capture import PLANS
from targets import TARGET

def configure():
    plan=PLANS[TARGET]
    configured=os.environ.get('BACKUP_DRIVE_FOLDER_ID')
    engine.require(not configured or configured==plan['folder'],'reviewed Drive folder mismatch')
    os.environ['BACKUP_DRIVE_FOLDER_ID']=plan['folder']
    for name,value in [('BACKUP_DRIVE_ESTIMATED_DAILY_BYTES',plan['daily']),
                       ('BACKUP_MAX_DATABASE_BYTES',67108864),
                       ('BACKUP_MAX_STORAGE_BYTES',plan['storage_max'])]:
        if not os.environ.get(name):os.environ[name]=str(value)
    return plan

def main():
    from drive_store import DriveError,safe_diagnostic
    mode=os.environ.get('BACKUP_MODE','preflight')
    try:
        configure()
        engine.require(mode in ('preflight','backup','restore','health'),'operational mode prohibited')
        sys.argv=['backup.py',mode];result=engine.main()
        if isinstance(result,dict):
            fields={'backup_id','project','restore_verified','tables_verified','rows_verified',
                    'sequences_verified','storage_objects_verified','storage_buckets_verified',
                    'storage_files_verified','storage_service_restore_verified','encrypted_files'}
            print(json.dumps({'code':'BACKUP_OPERATION_VERIFIED','target':TARGET,
                              **{k:v for k,v in result.items() if k in fields}}))
        return 0
    except DriveError as error:code=safe_diagnostic(error)
    except (engine.SourceError,engine.EncryptionKeyError,engine.RestoreError) as error:code=error.code
    except engine.GateError as error:
        text=str(error)
        code=text if text in ('BACKUP_HEALTH_STALE','BACKUP_HEALTH_CHECKSUM_MISMATCH') else 'BACKUP_OPERATION_FAILED'
    except Exception:code='BACKUP_OPERATION_FAILED'
    print(json.dumps({'code':code,'target':TARGET,'success_certified':False}),file=sys.stderr)
    return 1

if __name__=='__main__':raise SystemExit(main())
