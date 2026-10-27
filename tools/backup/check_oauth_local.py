"""Local token-endpoint check. Never reads GitHub secrets or accesses Drive files."""
import getpass
import json
import logging
import sys
from pathlib import Path

import httplib2
from google.auth.exceptions import RefreshError
from google.oauth2.credentials import Credentials
from google_auth_httplib2 import Request

SCOPE = 'https://www.googleapis.com/auth/drive.file'
CODES = {'invalid_client', 'unauthorized_client', 'invalid_grant',
         'access_denied', 'invalid_scope'}


def check(config, refresh_token, request):
    # Refuse ambiguous exports; accept Google's original downloaded client JSON.
    sections = [config[k] for k in ('installed', 'web') if k in config]
    if len(sections) != 1:
        return 'LOCAL_CONFIG_INVALID'
    client = sections[0]
    values = [client.get('client_id'), client.get('client_secret'), refresh_token]
    if any(not isinstance(v, str) or not v or v.strip() != v for v in values):
        return 'LOCAL_CONFIG_INVALID'
    creds = Credentials(None, refresh_token=refresh_token,
                        token_uri='https://oauth2.googleapis.com/token',
                        client_id=values[0], client_secret=values[1], scopes=[SCOPE])
    try:
        creds.refresh(request)
    except RefreshError as error:
        reason = next((v.get('error') for v in error.args if isinstance(v, dict)), None)
        return ('OAUTH_' + reason.upper()) if isinstance(reason, str) and reason in CODES else 'OAUTH_REFRESH_FAILED'
    except Exception:
        return 'OAUTH_REFRESH_FAILED'
    if creds.granted_scopes is None:
        return 'OAUTH_SCOPE_UNCONFIRMED'
    return 'OAUTH_LOCAL_OK' if set(creds.granted_scopes) == {SCOPE} else 'OAUTH_SCOPE_REJECTED'


def main():
    logging.disable(logging.CRITICAL)
    # Do not allow getpass to fall back to visible input in a redirected shell.
    if not sys.stdin.isatty():
        print('LOCAL_INTERACTIVE_TERMINAL_REQUIRED')
        return 1
    try:
        path = input('Original OAuth client JSON path (local only): ').strip().strip('"')
        config = json.loads(Path(path).read_text(encoding='utf-8-sig'))
        token = getpass.getpass('Refresh Token (hidden, never saved): ')
        result = check(config, token, Request(httplib2.Http(timeout=60)))
    except BaseException:
        result = 'LOCAL_CHECK_FAILED'
    print(result)
    return 0 if result == 'OAUTH_LOCAL_OK' else 1


if __name__ == '__main__':
    sys.exit(main())
