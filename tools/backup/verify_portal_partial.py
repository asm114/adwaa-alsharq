"""Authenticate the three observed Portal ciphertexts, without completing backup.

GET only. Plaintext goes to a discard sink or bounded memory, never disk/logs.
No SQL restore, new source export, folder creation, marker writes or deletion.
"""
import io
import json
import os
from pathlib import Path
import tempfile
from cryptography.exceptions import InvalidTag

import backup as engine
from targets import PROJECT, TARGET

BACKUP_ID = '20261026T140258Z-c8e48dde963b40949bd6023aa46f30e2'
EXPECTED = {
    'database.enc': ('1zH-i9DUdNfaKCfvyn4nrGendAQ0pqj5j', 671485),
    'roles.enc': ('1H3qApmK4ESe04l0WrVnsja9HCwvF9QQ8', 5936),
    'verification.enc': ('1Fp1XDsBFCbnF1hQ5GEJtl8gW8IIyOsBK', 403542),
}


class PartialVerificationError(engine.GateError):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


class Discard:
    def write(self, data):
        return len(data)


def verify(store, observed):
    engine.require(TARGET == 'portal', 'Portal-only partial verification')
    rows = [row for row in observed['managed_files'] if row['backup_id'] == BACKUP_ID]
    engine.require(len(rows) == 3 and {row['part'] for row in rows} == set(EXPECTED), 'observed partial set changed')
    root = Path(engine.env('RUNNER_TEMP')).resolve()
    engine.require(not root.is_relative_to(Path(__file__).resolve().parents[2]), 'encrypted temporary files must be outside repository')
    secret = engine.key()
    checked = []
    declared = None
    with tempfile.TemporaryDirectory(prefix='adwaa-partial-verify-', dir=root) as directory:
        for row in rows:
            part = row['part'];file_id, size = EXPECTED[part]
            engine.require(row['file_id'] == file_id and row['bytes'] == size, 'partial identity or size changed')
            key = engine.PREFIX + BACKUP_ID + '/' + part
            metadata = store._metadata(file_id)
            engine.require(metadata['appProperties'].get('objectKey') == key and int(metadata['size']) == size, 'partial namespace changed')
            # Read by the already observed ID, never rely on search freshness.
            store.ids[key] = file_id
            path = Path(directory) / part
            store.download_file(store.folder, key, str(path))
            sink = io.BytesIO() if part == 'verification.enc' else Discard()
            engine.require(path.stat().st_size == size, 'partial size changed')
            try:
                engine.unseal(path, sink, secret, PROJECT + '/' + BACKUP_ID + '/' + part[:-4])
            except InvalidTag:
                raise PartialVerificationError('PARTIAL_GCM_AUTHENTICATION_FAILED') from None
            except engine.GateError:
                raise PartialVerificationError('PARTIAL_ENCRYPTED_FORMAT_INVALID') from None
            if part == 'verification.enc':
                document = json.loads(sink.getvalue())
                engine.require(document['project'] == PROJECT and document['backup_id'] == BACKUP_ID, 'verification identity mismatch')
                declared = {'tables_declared': len(document['tables']),
                            'storage_objects_declared': len(document['storage']['files'])}
            checked.append({'part': part, 'ciphertext_sha256_verified': True, 'gcm_authenticated': True})
    return {'backup_id': BACKUP_ID, 'verified_parts': checked, **(declared or {}),
            'storage_payload_present': False, 'full_backup_complete': False,
            'restore_verified': False, 'drive_modified': False}
