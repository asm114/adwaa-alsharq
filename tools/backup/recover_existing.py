"""Recover only the NEW already-exported captures. Never export source data.

Both targets restore ONLY an existing committed four-part archive. Partial
groups are preserved and never selected, completed, or modified by this entrypoint.
"""
import io
import json
import os
from pathlib import Path
import sys
import tempfile
from cryptography.exceptions import InvalidTag

import backup as engine
from drive_store import authenticate, inspection_report, DriveStore, DriveError, safe_diagnostic
from first_capture import PLANS
from targets import PROJECT, TARGET
from verify_portal_partial import BACKUP_ID as OLD_PORTAL_ID

RECOVERY_CODES=frozenset('RECOVERY_NEW_GROUP_AMBIGUOUS RECOVERY_DUPLICATE_PARTS RECOVERY_FOUR_PARTS_REQUIRED RECOVERY_UNEXPECTED_PART RECOVERY_TEMP_LOCATION_INVALID RECOVERY_RESTORE_NOT_VERIFIED RECOVERY_PART_CHANGED RECOVERY_MANIFEST_READBACK_FAILED RECOVERY_EVIDENCE_READBACK_FAILED RECOVERY_COST_APPROVAL_REQUIRED RECOVERY_APPROVAL_REQUIRED RECOVERY_DELETE_AND_SCHEDULE_PROHIBITED RECOVERY_SOURCE_CREDENTIALS_PROHIBITED RECOVERY_FOLDER_MISMATCH'.split())


def select_new_portal_group(observed):
    groups = [g for g in observed['groups'] if g['backup_id'] != OLD_PORTAL_ID]
    engine.require(len(groups) == 1, 'RECOVERY_NEW_GROUP_AMBIGUOUS')
    group = groups[0]
    rows = [r for r in observed['managed_files'] if r['backup_id'] == group['backup_id']]
    engine.require(not group['duplicate_parts'], 'RECOVERY_DUPLICATE_PARTS')
    parts = {r['part'] for r in rows}
    engine.require({p + '.enc' for p in engine.FULL_PARTS} <= parts, 'RECOVERY_FOUR_PARTS_REQUIRED')
    engine.require(parts <= {p + '.enc' for p in engine.FULL_PARTS} | {'complete.json', 'restore-ok.json'}, 'RECOVERY_UNEXPECTED_PART')
    return group['backup_id'], rows


def recover_portal(store, report):
    report['stage'] = 'portal_existing_group_inventory'
    observed = store.audit_existing()
    report['observed_groups_before_recovery'] = observed['groups']
    report['new_group_parts'] = [{k: row[k] for k in ['backup_id','part','bytes','sha256_available','metadata_code']} for row in observed['managed_files'] if row['backup_id'] != OLD_PORTAL_ID]
    backup_id, rows = select_new_portal_group(observed)
    report['backup_id'] = backup_id
    temp_root = Path(engine.env('RUNNER_TEMP')).resolve()
    engine.require(not temp_root.is_relative_to(Path(__file__).resolve().parents[2]), 'RECOVERY_TEMP_LOCATION_INVALID')
    with tempfile.TemporaryDirectory(prefix='adwaa-recover-existing-', dir=temp_root) as directory:
        report['stage'] = 'download_existing_ciphertexts'
        for part in engine.FULL_PARTS:
            row = next(r for r in rows if r['part'] == part + '.enc')
            key = engine.PREFIX + backup_id + '/' + part + '.enc'
            store.ids[key] = row['file_id']
            store.download_file(store.folder, key, str(Path(directory) / (part + '.enc')))
        manifest = {'format': 2, 'project': PROJECT, 'backup_id': backup_id,
                    'files': {p: engine.digest(Path(directory) / (p + '.enc')) for p in engine.FULL_PARTS}}
        report['stage'] = 'authenticate_existing_parts'
        # Isolated restore checks every hash, every GCM tag/AAD and the encrypted
        # verification document before certifying SQL and Storage byte recovery.
        report['stage'] = 'isolated_restore_existing'
        result = engine.isolated_restore(directory, manifest)
        engine.require(result.get('restore_verified') is True and result.get('storage_files_verified') is True, 'RECOVERY_RESTORE_NOT_VERIFIED')
        report['stage'] = 'publish_verified_markers'
        root = engine.PREFIX + backup_id + '/'
        store.put_object(Bucket=store.folder, Key=root + 'complete.json', Body=json.dumps(manifest).encode())
        store.put_object(Bucket=store.folder, Key=root + 'restore-ok.json', Body=json.dumps(result).encode())
        # Read back markers and all encrypted part sizes/hashes through the same
        # engine before reporting success. No source credentials are available.
        for part in engine.FULL_PARTS:
            engine.require(store.head_object(Bucket=store.folder, Key=root + part + '.enc')['ContentLength'] == manifest['files'][part]['bytes'], 'RECOVERY_PART_CHANGED')
        engine.require(json.loads(store.get_object(Bucket=store.folder, Key=root + 'complete.json')['Body'].read()) == manifest, 'RECOVERY_MANIFEST_READBACK_FAILED')
        engine.require(json.loads(store.get_object(Bucket=store.folder, Key=root + 'restore-ok.json')['Body'].read()) == result, 'RECOVERY_EVIDENCE_READBACK_FAILED')
        result['encrypted_files'] = manifest['files']
        return result


def recover(report):
    engine.require(os.environ.get('BACKUP_COST_APPROVED') == 'true', 'RECOVERY_COST_APPROVAL_REQUIRED')
    engine.require(os.environ.get('BACKUP_EXECUTION_APPROVED') == 'true' and os.environ.get('BACKUP_RESTORE_APPROVED') == 'true', 'RECOVERY_APPROVAL_REQUIRED')
    engine.require(os.environ.get('BACKUP_DRIVE_RETENTION_APPROVED') == 'false' and os.environ.get('BACKUP_SCHEDULE_APPROVED') == 'false', 'RECOVERY_DELETE_AND_SCHEDULE_PROHIBITED')
    # Guard against accidentally turning this into a source-export path.
    engine.require(not any(os.environ.get(k) for k in ['PGHOST', 'PGPASSWORD', 'BACKUP_STORAGE_API_KEY']), 'RECOVERY_SOURCE_CREDENTIALS_PROHIBITED')
    engine.key()
    plan = PLANS[TARGET]
    os.environ.update(BACKUP_STORAGE_PROVIDER='drive', BACKUP_DRIVE_FOLDER_ID=plan['folder'],
                      BACKUP_DRIVE_ESTIMATED_DAILY_BYTES=str(plan['daily']))
    report['stage'] = 'existing_folder_validation'
    service = authenticate();email = engine.env('BACKUP_DRIVE_ACCOUNT')
    folders = inspection_report(service, email)
    engine.require(folders['folder_count'] == 1 and folders['folder_ids'] == [plan['folder']], 'RECOVERY_FOLDER_MISMATCH')
    store = DriveStore(service, plan['folder'], email, plan['daily']);store.preflight()
    report['observed_groups_before_recovery'] = store.audit_existing()['groups']
    report['stage'] = 'isolated_restore_existing_committed'
    original = sys.argv
    try:
        sys.argv = ['backup.py', 'restore']
        result = engine.main()
    finally:
        sys.argv = original
    engine.require(result.get('restore_verified') is True and result.get('storage_files_verified') is True, 'RECOVERY_RESTORE_NOT_VERIFIED')
    report.update(result)
    report.update(stage='finished', code='EXISTING_CAPTURE_RESTORE_VERIFIED', folder_id=plan['folder'],
                  new_source_export=False, original_portal_partial_reused=False,
                  production_modified=False, deletion_enabled=False)


def main():
    report = {'target': TARGET, 'stage': 'approval_gates', 'code': 'EXISTING_RECOVERY_FAILED', 'production_modified': False}
    try:
        recover(report)
    except InvalidTag:
        report['code'] = 'RESTORE_GCM_AUTHENTICATION_FAILED'
    except (engine.RestoreError, engine.EncryptionKeyError, engine.SourceError) as error:
        report['code'] = error.code
        if isinstance(error,engine.RestoreError) and hasattr(error,'fields'):report['comparison_fields'] = error.fields
        if hasattr(error,'diagnostics'):report['schema_diagnostics'] = error.diagnostics
        if hasattr(error,'metadata_diagnostics'):report['metadata_diagnostics'] = error.metadata_diagnostics
        if hasattr(error,'versions'):report['postgres_versions'] = error.versions
        if hasattr(error,'replayed_metadata'):report['replayed_metadata'] = error.replayed_metadata
    except DriveError as error:
        report['code'] = safe_diagnostic(error)
    except engine.GateError as error:
        code = str(error)
        if code in RECOVERY_CODES:
            report['code'] = code
    except Exception:
        pass
    print(json.dumps(report), flush=True)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with Path(os.environ['GITHUB_STEP_SUMMARY']).open('a', encoding='utf-8') as out:
            out.write('```json\n' + json.dumps(report, indent=2) + '\n```\n')
    return 0 if report['code'] == 'EXISTING_CAPTURE_RESTORE_VERIFIED' else 1


if __name__ == '__main__':
    sys.exit(main())
