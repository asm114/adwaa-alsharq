"""Explicit local action: sync a verified OAuth set through official GitHub CLI.

No workflow execution, key rotation, secret printing, clipboard, or secret files.
GitHub secret updates are individually atomic, not atomic as a group. On failure,
stop; do not run workflows. Re-running uses the same verified local source.
"""
import logging
from pathlib import Path
import shutil
import subprocess
import sys
import warnings

logging.disable(logging.CRITICAL)
warnings.filterwarnings('ignore')
from run_local import run

REPO = 'asm114/adwaa-alsharq'
ENVIRONMENT = 'production-backup'


def sync(client, refresh):
    gh = shutil.which('gh')
    if not gh:
        return 'LOCAL_GITHUB_CLI_REQUIRED'
    # Confirm existing official CLI authorization; do not initiate a login here.
    status = subprocess.run([gh, 'auth', 'status', '--hostname', 'github.com'],
                            capture_output=True)
    if status.returncode:
        return 'LOCAL_GITHUB_LOGIN_REQUIRED'
    values = [('BACKUP_DRIVE_CLIENT_ID', client['client_id']),
              ('BACKUP_DRIVE_CLIENT_SECRET', client['client_secret']),
              ('BACKUP_DRIVE_REFRESH_TOKEN', refresh)]
    updated = 0
    for name, value in values:
        # Secret only through stdin: never command arguments or environment.
        try:
            result = subprocess.run([gh, 'secret', 'set', name, '--repo', REPO,
                                     '--env', ENVIRONMENT], input=value.encode('utf-8'),
                                    capture_output=True, timeout=90)
        except Exception:
            return 'GITHUB_OAUTH_SYNC_INCOMPLETE'
        if result.returncode:
            return 'GITHUB_OAUTH_SYNC_INCOMPLETE' if updated else 'GITHUB_OAUTH_SYNC_FAILED'
        updated += 1
    return 'GITHUB_OAUTH_SYNC_OK'


if __name__ == '__main__':
    try:
        result = run(Path(__file__).resolve().parent, on_success=sync)
    except BaseException:
        result = 'LOCAL_SYNC_FAILED'
    print(result)
    sys.exit(0 if result == 'GITHUB_OAUTH_SYNC_OK' else 1)
