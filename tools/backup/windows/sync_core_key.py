"""Select the ORIGINAL Core key locally and sync only that GitHub secret.

No key generation, clipboard, Portal changes, secret output, or extra key files.
"""
import base64
import json
from pathlib import Path
import shutil
import subprocess
import sys


def read_original(path):
    text = Path(path).read_text(encoding='utf-8-sig')
    if text.lstrip().startswith('{'):
        document = json.loads(text)
        if document.get('target', 'core') != 'core':
            raise ValueError('wrong target')
        value = document.get('BACKUP_CORE_ENCRYPTION_KEY')
    else:
        value = text
    if not isinstance(value, str):
        raise ValueError('unsupported file format')
    # File BOM/newline framing is not part of the random 32-byte key. Do not
    # guess hex, split multi-key documents, or generate a replacement.
    value = value.strip()
    if len(base64.b64decode(value, validate=True)) != 32:
        raise ValueError('invalid key')
    return value


def sync(path):
    try:
        key = read_original(path)
    except Exception:
        return 'LOCAL_CORE_KEY_FILE_INVALID'
    gh = shutil.which('gh')
    if not gh:
        return 'LOCAL_GITHUB_CLI_REQUIRED'
    try:
        status = subprocess.run([gh, 'auth', 'status', '--hostname', 'github.com'], capture_output=True, timeout=30)
        if status.returncode:
            return 'LOCAL_GITHUB_LOGIN_REQUIRED'
        result = subprocess.run([gh, 'secret', 'set', 'BACKUP_CORE_ENCRYPTION_KEY',
                                 '--repo', 'asm114/adwaa-alsharq', '--env', 'production-backup'],
                                input=key.encode('ascii'), capture_output=True, timeout=90)
        return 'GITHUB_CORE_KEY_SYNC_OK' if result.returncode == 0 else 'GITHUB_CORE_KEY_SYNC_FAILED'
    except Exception:
        return 'GITHUB_CORE_KEY_SYNC_UNCONFIRMED'


def main():
    try:
        import tkinter as tk
        from tkinter import filedialog, messagebox
        root = tk.Tk();root.withdraw()
        path = filedialog.askopenfilename(title='Select ORIGINAL CORE encryption key file (not Portal)',
                                          initialdir=r'C:\Adwaa-Backup',
                                          filetypes=[('Key files', '*.txt *.key *.json'), ('All files', '*.*')])
        if not path:
            return 'LOCAL_CORE_KEY_SELECTION_CANCELLED'
        if not messagebox.askyesno('Confirm original Core key',
                                  'Confirm this is your saved ORIGINAL CORE key file.\nOnly BACKUP_CORE_ENCRYPTION_KEY will be updated.\nNo new key will be generated. No workflows will run.'):
            return 'LOCAL_CORE_KEY_SELECTION_CANCELLED'
        return sync(path)
    except BaseException:
        return 'LOCAL_CORE_KEY_SYNC_FAILED'


if __name__ == '__main__':
    code = main()
    print(code)
    sys.exit(0 if code == 'GITHUB_CORE_KEY_SYNC_OK' else 1)
