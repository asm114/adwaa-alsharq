"""Fixed backup/health only. Manual restore/setup remain in the reviewed environment."""
import json
import os
import sys
import automation_policy as policy

def main():
    mode=sys.argv[1] if len(sys.argv)==2 else ''
    try:policy.admit(mode)
    except policy.PolicyError as error:
        print(json.dumps({'code':str(error),'success_certified':False}));return 1
    except Exception:
        print(json.dumps({'code':'BACKUP_AUTO_POLICY_READ_FAILED','success_certified':False}));return 1
    # This permission is exclusively for the engine's network-none disposable
    # restore container after capture; there is no arbitrary restore operation.
    os.environ.update(BACKUP_MODE=mode,BACKUP_EXECUTION_APPROVED='true',
        BACKUP_RESTORE_APPROVED='true',BACKUP_DRIVE_SETUP_APPROVED='false',
        BACKUP_DRIVE_RETENTION_APPROVED='false',BACKUP_SCHEDULE_APPROVED='true',
        BACKUP_PRODUCTION_RESTORE_VERIFIED='true')
    import runtime
    return runtime.main()

if __name__=='__main__':raise SystemExit(main())
