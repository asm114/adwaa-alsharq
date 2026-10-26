"""Inspect only existing marked Drive folders and measure read-only source readiness.

No dump, object download/upload, database writes, restore or retention operations.
The existing backup engine remains the only capture/restore implementation.
"""
import json
import os
from pathlib import Path
import re
import sys

import backup as engine
from drive_store import authenticate, inspection_report, DriveError, safe_diagnostic
from storage_source import Source, inventory
from targets import TARGET


def prepare(report):
    engine.require(os.environ.get('BACKUP_COST_APPROVED') == 'true', 'cost approval required')
    engine.require(os.environ.get('BACKUP_DRIVE_SETUP_APPROVED') == 'true', 'folder setup approval required')
    for name in ('BACKUP_EXECUTION_APPROVED', 'BACKUP_RESTORE_APPROVED',
                 'BACKUP_DRIVE_RETENTION_APPROVED', 'BACKUP_SCHEDULE_APPROVED'):
        engine.require(os.environ.get(name) == 'false', 'capture and restore must remain disabled')
    report['stage'] = 'drive_folder'
    folders = inspection_report(authenticate(), engine.env('BACKUP_DRIVE_ACCOUNT'))
    engine.require(folders['folder_count'] == 1, 'exactly one existing marked folder required')
    report['folder_id'] = folders['folder_ids'][0]
    # Immediately preserve the successful ID even if later source checks fail.
    print(json.dumps({'target': TARGET, 'folder_id': report['folder_id'], 'code': 'DRIVE_FOLDER_READY'}), flush=True)
    report['stage'] = 'source_connection'
    with engine.source_connection() as conn:
        engine.require(conn.execute(engine.identity_query()).fetchone() == (True,), 'identity tables missing')
        report['database_bytes'] = conn.execute('SELECT pg_database_size(current_database())').fetchone()[0]
        report['server_version_num'] = conn.execute('SHOW server_version_num').fetchone()[0]
        report['stage'] = 'storage_inventory'
        data = inventory(conn)
        report['bucket_count'] = len(data['buckets'])
        report['object_count'] = len(data['objects'])
        report['storage_bytes'] = sum(obj['metadata']['size'] for obj in data['objects'])
        # Extension metadata is operational information, not application records.
        extensions = conn.execute('SELECT extname,extversion FROM pg_extension ORDER BY extname').fetchall()
        engine.require(all(re.fullmatch(r'[a-zA-Z0-9_.-]{1,80}', v) for row in extensions for v in row), 'extension metadata invalid')
        report['extensions'] = [list(row) for row in extensions]
    report['stage'] = 'storage_api'
    source = Source()
    try:
        source.check_buckets(data['buckets'])
    finally:
        source.close()
    image = os.environ.get('BACKUP_RESTORE_IMAGE', '')
    estimate = os.environ.get('BACKUP_DRIVE_ESTIMATED_DAILY_BYTES', '')
    report['restore_image_configured'] = bool(re.fullmatch(r'[a-zA-Z0-9./:_-]+@sha256:[a-f0-9]{64}', image))
    report['daily_estimate_configured'] = estimate.isdigit() and int(estimate) > 0
    report['code'] = 'FIRST_CAPTURE_READINESS_MEASURED'
    report['stage'] = 'finished'


def main():
    report = {'target': TARGET, 'backup_created': False, 'production_modified': False,
              'stage': 'approval_gates', 'code': 'FIRST_CAPTURE_PREPARATION_FAILED'}
    try:
        prepare(report)
    except engine.SourceError as error:
        report['code'] = error.code
    except engine.psycopg.Error as error:
        report['code'] = engine.source_code(error)
    except DriveError as error:
        report['code'] = safe_diagnostic(error)
    except Exception:
        # Never serialize libpq errors, HTTP bodies, credential values or paths.
        pass
    print(json.dumps(report), flush=True)
    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        with Path(summary).open('a', encoding='utf-8') as out:
            out.write('```json\n' + json.dumps(report, indent=2) + '\n```\n')
    return 0 if report['code'] == 'FIRST_CAPTURE_READINESS_MEASURED' else 1


if __name__ == '__main__':
    sys.exit(main())
