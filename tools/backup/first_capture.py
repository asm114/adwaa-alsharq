"""One reviewer-approved capture + independent restore per target, no retention.

Uses the existing engine. All source operations are read-only; Drive writes are
restricted to the previously created marked folder. No folder initialization.
"""
import json
import os
from pathlib import Path
import re
import sys

import backup as engine
from drive_store import authenticate, inspection_report, DriveError, safe_diagnostic
from storage_source import inventory
from targets import TARGET

EXTENSIONS = [('pg_stat_statements', '1.11'), ('pgcrypto', '1.3'), ('plpgsql', '1.0'),
              ('supabase_vault', '0.3.1'), ('uuid-ossp', '1.1')]
PLANS = {
    'core': {'folder': '1MkUsuDfDjX5iltF5gENwviRvTtIM0fCB', 'daily': 67108864, 'storage_max': 16777216},
    'portal': {'folder': '1bhufP5ZmjmquqNIEIK-zBhTMPGL0_WDX', 'daily': 268435456, 'storage_max': 134217728},
}


def capture(report):
    plan = PLANS[TARGET]
    engine.require(os.environ.get('BACKUP_COST_APPROVED') == 'true', 'cost approval required')
    engine.require(os.environ.get('BACKUP_EXECUTION_APPROVED') == 'true' and
                   os.environ.get('BACKUP_RESTORE_APPROVED') == 'true', 'reviewed capture and isolated restore required')
    for name in ['BACKUP_DRIVE_RETENTION_APPROVED', 'BACKUP_SCHEDULE_APPROVED']:
        engine.require(os.environ.get(name) == 'false', 'deletion and schedule must remain disabled')
    image = engine.env('BACKUP_RESTORE_IMAGE')
    # A locally built, tested immutable Docker image ID, not a mutable tag.
    engine.require(bool(re.fullmatch(r'sha256:[a-f0-9]{64}', image)), 'tested image ID required')
    os.environ.update(BACKUP_DRIVE_FOLDER_ID=plan['folder'],
                      BACKUP_DRIVE_ESTIMATED_DAILY_BYTES=str(plan['daily']),
                      BACKUP_MAX_DATABASE_BYTES=str(67108864),
                      BACKUP_MAX_STORAGE_BYTES=str(plan['storage_max']))
    report['stage'] = 'existing_folder'
    folders = inspection_report(authenticate(), engine.env('BACKUP_DRIVE_ACCOUNT'))
    engine.require(folders['folder_count'] == 1 and folders['folder_ids'] == [plan['folder']], 'reviewed marked folder mismatch')
    report['stage'] = 'source_readiness'
    with engine.source_connection() as conn:
        engine.require(conn.execute(engine.identity_query()).fetchone() == (True,), 'source identity missing')
        extensions = [tuple(row) for row in conn.execute('SELECT extname,extversion FROM pg_extension ORDER BY extname').fetchall()]
        engine.require(extensions == EXTENSIONS, 'source extensions changed; rebuild and test before capture')
        data = inventory(conn)
        measured = sum(obj['metadata']['size'] for obj in data['objects'])
        engine.require(measured <= plan['storage_max'], 'Storage exceeds measured capacity budget')
        report.update(storage_objects_before=len(data['objects']), storage_bytes_before=measured,
                      vault_rows=conn.execute('SELECT count(*) FROM vault.secrets').fetchone()[0])
    engine.key()  # Validate key format before export, without returning it.
    report['stage'] = 'encrypted_capture_and_isolated_restore'
    original = sys.argv
    try:
        sys.argv = ['backup.py', 'backup']
        result = engine.main()
    finally:
        sys.argv = original
    engine.require(result.get('restore_verified') is True and result.get('storage_files_verified') is True,
                   'independent restore evidence missing')
    report.update(result)
    report.update(stage='finished', code='FIRST_ENCRYPTED_CAPTURE_RESTORED',
                  folder_id=plan['folder'], restore_image_id=image,
                  daily_budget_bytes=plan['daily'], production_modified=False)
    # Does not certify external Vault key recovery or a running Storage API.
    report['vault_external_key_recovery_verified'] = False


def main():
    report = {'target': TARGET, 'stage': 'approval_gates', 'code': 'FIRST_CAPTURE_FAILED',
              'production_modified': False}
    try:
        capture(report)
    except engine.SourceError as error:
        report['code'] = error.code
    except engine.psycopg.Error as error:
        report['code'] = engine.source_code(error)
    except DriveError as error:
        report['code'] = safe_diagnostic(error)
    except Exception:
        pass  # No exception text, DSNs, customer values or HTTP responses.
    print(json.dumps(report), flush=True)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with Path(os.environ['GITHUB_STEP_SUMMARY']).open('a', encoding='utf-8') as out:
            out.write('```json\n' + json.dumps(report, indent=2) + '\n```\n')
    return 0 if report['code'] == 'FIRST_ENCRYPTED_CAPTURE_RESTORED' else 1


if __name__ == '__main__':
    sys.exit(main())
