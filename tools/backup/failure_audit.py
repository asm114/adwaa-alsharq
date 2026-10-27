"""Read-only diagnosis after failed first capture. No source DB or Drive writes."""
import json
import os
from pathlib import Path
import sys

import backup as engine
from drive_store import authenticate, inspection_report, DriveStore, DriveError, safe_diagnostic
from first_capture import PLANS
from targets import TARGET
from verify_portal_partial import PartialVerificationError


def audit(report):
    engine.require(os.environ.get('BACKUP_COST_APPROVED') == 'true', 'audit cost approval required')
    for name in ['BACKUP_EXECUTION_APPROVED', 'BACKUP_RESTORE_APPROVED', 'BACKUP_DRIVE_RETENTION_APPROVED', 'BACKUP_SCHEDULE_APPROVED']:
        engine.require(os.environ.get(name) == 'false', 'audit must not permit execution')
    report['stage'] = 'encryption_key_validation'
    try:
        engine.key()
        report['encryption_key_code'] = 'ENCRYPTION_KEY_VALID'
    except engine.EncryptionKeyError as error:
        report['encryption_key_code'] = error.code
    plan = PLANS[TARGET]
    report['stage'] = 'drive_read_only_audit'
    service = authenticate()
    email = engine.env('BACKUP_DRIVE_ACCOUNT')
    folders = inspection_report(service, email)
    engine.require(folders['folder_count'] == 1 and folders['folder_ids'] == [plan['folder']], 'reviewed folder mismatch')
    store = DriveStore(service, plan['folder'], email, plan['daily'])
    report['drive_inventory'] = store.audit_existing()
    report['stage'] = 'drive_capacity'
    report['free_bytes'] = store._identity()
    report['daily_budget_bytes'] = plan['daily']
    report['budget_31_days_bytes'] = 31 * plan['daily']
    try:
        store.preflight()
        report['drive_preflight_code'] = 'DRIVE_PREFLIGHT_OK'
    except DriveError as error:
        report['drive_preflight_code'] = safe_diagnostic(error)
    if TARGET == 'portal' and os.environ.get('BACKUP_VERIFY_OBSERVED_PARTS') == 'true':
        report['stage'] = 'portal_partial_authentication'
        from verify_portal_partial import verify
        report['portal_partial_verification'] = verify(store, report['drive_inventory'])
    report.update(stage='finished', code='READ_ONLY_FAILURE_AUDIT_COMPLETE')


def main():
    report = {'target': TARGET, 'stage': 'approval_gates', 'code': 'READ_ONLY_FAILURE_AUDIT_FAILED',
              'read_only': True, 'production_modified': False, 'backup_created': False}
    try:
        audit(report)
    except DriveError as error:
        report['code'] = safe_diagnostic(error)
    except PartialVerificationError as error:
        report['code'] = error.code
    except Exception:
        pass
    print(json.dumps(report), flush=True)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with Path(os.environ['GITHUB_STEP_SUMMARY']).open('a', encoding='utf-8') as out:
            out.write('```json\n' + json.dumps(report, indent=2) + '\n```\n')
    return 0 if report['code'] == 'READ_ONLY_FAILURE_AUDIT_COMPLETE' else 1


if __name__ == '__main__':
    sys.exit(main())
