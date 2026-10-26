"""Read existing credentials in memory; emit only a fixed diagnostic code."""
import json
import logging
from pathlib import Path
import sys
import warnings

logging.disable(logging.CRITICAL)
warnings.filterwarnings('ignore')


def run(root):
    import check_oauth_local as checker
    import httplib2
    from google_auth_httplib2 import Request
    token_path = root / 'drive_oauth_token.json'
    if not token_path.is_file():
        return 'LOCAL_TOKEN_FILE_MISSING'
    token = json.loads(token_path.read_text(encoding='utf-8-sig'))
    if not isinstance(token, dict):
        return 'LOCAL_TOKEN_FORMAT_INVALID'
    refresh = token.get('refresh_token')
    if not isinstance(refresh, str) or not refresh or refresh.strip() != refresh:
        return 'LOCAL_REFRESH_TOKEN_MISSING_OR_INVALID'
    candidates = []
    for path in root.glob('*.json'):
        if path == token_path:
            continue
        try:
            config = json.loads(path.read_text(encoding='utf-8-sig'))
        except (ValueError, OSError):
            continue
        if isinstance(config, dict):
            sections = [config[k] for k in ('installed', 'web') if k in config]
            if len(sections) == 1 and isinstance(sections[0], dict) and all(
                    isinstance(sections[0].get(k), str) and sections[0][k]
                    for k in ('client_id', 'client_secret')):
                candidates.append((config, sections[0]))
    if len(candidates) != 1:
        return 'LOCAL_CLIENT_FILE_MISSING' if not candidates else 'LOCAL_CLIENT_FILE_AMBIGUOUS'
    config, client = candidates[0]
    # Some token exports include the client binding. Check it before networking.
    for key in ('client_id', 'client_secret'):
        if key in token and token[key] != client[key]:
            return 'LOCAL_CLIENT_BINDING_MISMATCH'
    httplib2.debuglevel = 0
    transport = httplib2.Http(timeout=60)
    # Do not forward any OAuth request body through a redirect.
    transport.follow_redirects = False
    return checker.check(config, refresh, Request(transport))


if __name__ == '__main__':
    try:
        code = run(Path(__file__).resolve().parent)
    except BaseException:
        code = 'LOCAL_CHECK_FAILED'
    print(code)
    sys.exit(0 if code == 'OAUTH_LOCAL_OK' else 1)
