"""Fixed PostgreSQL diagnostic codes; never serialize connection error text."""
import errno
import os
from pathlib import Path
import re
import socket
import ssl
import time


class GateError(Exception):
    pass


CODES = frozenset('PG_CONFIG_MISSING PG_SSLMODE_INVALID PG_HOST_INVALID PG_USER_INVALID PG_PORT_INVALID PG_PROJECT_UNCONFIRMED PG_DATABASE_INVALID PG_OVERRIDE_PROHIBITED PG_CA_MISSING PG_CA_INVALID PG_DNS_FAILED PG_DNS_TEMPORARY PG_NETWORK_UNREACHABLE PG_TCP_REFUSED PG_TCP_TIMEOUT PG_TCP_FAILED PG_TLS_VERIFY_FAILED PG_TLS_FAILED PG_AUTH_PASSWORD_REJECTED PG_AUTH_REJECTED PG_POOLER_IDENTITY_REJECTED PG_PERMISSION_DENIED PG_CONNECTION_LIMIT PG_DATABASE_TOO_LARGE PG_VERSION_UNSUPPORTED PG_TLS_NOT_ACTIVE PG_RLS_BYPASS_REQUIRED PG_SOURCE_FAILED'.split())


class SourceError(GateError):
    def __init__(self, code):
        self.code = code if code in CODES else 'PG_SOURCE_FAILED'
        super().__init__(self.code)


def need(condition, code):
    if not condition:
        raise SourceError(code)


def validate_config(project, identity_confirmed):
    for name in ['PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE']:
        need(bool(os.environ.get(name)), 'PG_CONFIG_MISSING')
    need(os.environ.get('PGSSLMODE') == 'verify-full', 'PG_SSLMODE_INVALID')
    host, user = os.environ['PGHOST'], os.environ['PGUSER']
    direct = host == 'db.' + project + '.supabase.co'
    pool = bool(re.fullmatch(r'aws-[a-z0-9-]+\.pooler\.supabase\.com', host))
    need(direct or pool, 'PG_HOST_INVALID')
    need(user == user.strip() and not any(c in user for c in '\r\n\x00') and
         (not pool or (user.endswith('.' + project) and bool(user[:-len(project)-1]))), 'PG_USER_INVALID')
    need(os.environ['PGPORT'] == '5432', 'PG_PORT_INVALID')
    need(identity_confirmed(), 'PG_PROJECT_UNCONFIRMED')
    need(os.environ['PGDATABASE'] == 'postgres', 'PG_DATABASE_INVALID')
    need(not any(os.environ.get(k) for k in ['PGSERVICE', 'PGSERVICEFILE', 'PGHOSTADDR']), 'PG_OVERRIDE_PROHIBITED')
    ca = os.environ.get('PGSSLROOTCERT', '')
    need(bool(ca) and Path(ca).is_file(), 'PG_CA_MISSING')
    try:
        # Validate the configured PEM itself. Do not silently fall back to roots.
        content = Path(ca).read_bytes()
        need(b'-----BEGIN CERTIFICATE-----' in content, 'PG_CA_INVALID')
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        context.load_verify_locations(cafile=ca)
    except SourceError:
        raise
    except Exception:
        raise SourceError('PG_CA_INVALID') from None
    return host


def probe_tcp(host):
    try:
        addresses = socket.getaddrinfo(host, 5432, type=socket.SOCK_STREAM)
    except socket.gaierror as error:
        raise SourceError('PG_DNS_TEMPORARY' if error.errno == socket.EAI_AGAIN else 'PG_DNS_FAILED') from None
    deadline = time.monotonic() + 15
    failures = []
    for family, kind, protocol, _, address in addresses:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            failures.append('PG_TCP_TIMEOUT')
            break
        try:
            with socket.socket(family, kind, protocol) as sock:
                sock.settimeout(min(4, remaining))
                sock.connect(address)
            return
        except TimeoutError:
            failures.append('PG_TCP_TIMEOUT')
        except OSError as error:
            failures.append({errno.ENETUNREACH: 'PG_NETWORK_UNREACHABLE', errno.EHOSTUNREACH: 'PG_NETWORK_UNREACHABLE', errno.ECONNREFUSED: 'PG_TCP_REFUSED'}.get(error.errno, 'PG_TCP_FAILED'))
    # Mixed address failures are not proof of one specific root cause.
    raise SourceError(failures[0] if failures and len(set(failures)) == 1 else 'PG_TCP_FAILED')


def classify(error):
    if isinstance(error, SourceError):
        return error.code
    state = getattr(error, 'sqlstate', None)
    if state == '28P01':
        return 'PG_AUTH_PASSWORD_REJECTED'
    if state == '28000':
        return 'PG_AUTH_REJECTED'
    if state == '42501':
        return 'PG_PERMISSION_DENIED'
    if state == '53300':
        return 'PG_CONNECTION_LIMIT'
    # libpq connect failures often have no SQLSTATE. Inspect locally only;
    # never return substrings, diagnostics, URLs, hostnames or exception text.
    text = str(error).lower()
    if any(p in text for p in ['certificate verify failed', 'root certificate', 'server certificate', 'certificate has expired', 'certificate does not match host', 'does not match host name']):
        return 'PG_TLS_VERIFY_FAILED'
    if 'tenant or user not found' in text:
        return 'PG_POOLER_IDENTITY_REJECTED'
    if 'password authentication failed' in text:
        return 'PG_AUTH_PASSWORD_REJECTED'
    if any(p in text for p in ['no pg_hba.conf entry', 'authentication failed', 'sasl authentication failed']):
        return 'PG_AUTH_REJECTED'
    if 'permission denied' in text:
        return 'PG_PERMISSION_DENIED'
    if any(p in text for p in ['could not translate host name', 'name or service not known']):
        return 'PG_DNS_FAILED'
    if any(p in text for p in ['network is unreachable', 'no route to host']):
        return 'PG_NETWORK_UNREACHABLE'
    if 'connection refused' in text:
        return 'PG_TCP_REFUSED'
    if any(p in text for p in ['timeout expired', 'connection timed out']):
        return 'PG_TCP_TIMEOUT'
    if any(p in text for p in ['ssl error', 'tls error', 'server does not support ssl']):
        return 'PG_TLS_FAILED'
    return 'PG_SOURCE_FAILED'
