import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools/backup'))
import check_oauth_local as local
from google.auth.exceptions import RefreshError


class LocalOAuthTests(unittest.TestCase):
    def test_fixed_endpoint_and_hidden_error_payload(self):
        config = {'installed': {'client_id': 'synthetic-id', 'client_secret': 'synthetic-secret'}}
        for reason in ['invalid_client', 'unauthorized_client', 'invalid_grant', 'SENSITIVE']:
            with patch.object(local, 'Credentials') as constructor:
                constructor.return_value.refresh.side_effect = RefreshError('SENSITIVE', {'error': reason})
                result = local.check(config, 'synthetic-token', object())
                self.assertNotIn('SENSITIVE', result)
                self.assertEqual(result, 'OAUTH_' + reason.upper() if reason != 'SENSITIVE' else 'OAUTH_REFRESH_FAILED')
                self.assertEqual(constructor.call_args.kwargs['token_uri'], 'https://oauth2.googleapis.com/token')

    def test_scope_and_invalid_config(self):
        config = {'web': {'client_id': 'synthetic-id', 'client_secret': 'synthetic-secret'}}
        for scopes, expected in [(None, 'OAUTH_SCOPE_UNCONFIRMED'), ([local.SCOPE], 'OAUTH_LOCAL_OK'), (['other'], 'OAUTH_SCOPE_REJECTED')]:
            with patch.object(local, 'Credentials') as constructor:
                constructor.return_value.granted_scopes = scopes
                self.assertEqual(local.check(config, 'synthetic-token', object()), expected)
        with patch.object(local, 'Credentials') as constructor:
            self.assertEqual(local.check({}, 'synthetic-token', object()), 'LOCAL_CONFIG_INVALID')
            self.assertEqual(local.check(config, ' synthetic-token', object()), 'LOCAL_CONFIG_INVALID')
            constructor.assert_not_called()

    def test_noninteractive_input_rejected_without_prompt(self):
        with patch.object(local.sys.stdin, 'isatty', return_value=False), patch('builtins.print'), patch.object(local.getpass, 'getpass') as prompt:
            self.assertEqual(local.main(), 1)
            prompt.assert_not_called()
