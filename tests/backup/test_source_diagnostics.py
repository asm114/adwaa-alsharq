import errno
import importlib.util
import os
from pathlib import Path
import socket
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools/backup'))
import source_diagnostics as d
spec = importlib.util.spec_from_file_location('diagnostic_engine', ROOT / 'tools/backup/backup.py')
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)


class SourceDiagnosticTests(unittest.TestCase):
    def test_error_classes_are_fixed_codes_without_payload(self):
        cases = {'password authentication failed SYNTHETIC-SECRET': 'PG_AUTH_PASSWORD_REJECTED',
                 'certificate verify failed SYNTHETIC-SECRET': 'PG_TLS_VERIFY_FAILED',
                 'server certificate does not match host name SYNTHETIC-SECRET': 'PG_TLS_VERIFY_FAILED',
                 'Tenant or user not found SYNTHETIC-SECRET': 'PG_POOLER_IDENTITY_REJECTED',
                 'network is unreachable SYNTHETIC-SECRET': 'PG_NETWORK_UNREACHABLE',
                 'connection refused SYNTHETIC-SECRET': 'PG_TCP_REFUSED',
                 'timeout expired SYNTHETIC-SECRET': 'PG_TCP_TIMEOUT',
                 'could not translate host name SYNTHETIC-SECRET': 'PG_DNS_FAILED',
                 'permission denied SYNTHETIC-SECRET': 'PG_PERMISSION_DENIED',
                 'SSL error SYNTHETIC-SECRET': 'PG_TLS_FAILED',
                 'unknown SYNTHETIC-SECRET': 'PG_SOURCE_FAILED'}
        for text, code in cases.items():
            self.assertEqual(d.classify(RuntimeError(text)), code)
        for state, code in [('28P01', 'PG_AUTH_PASSWORD_REJECTED'), ('28000', 'PG_AUTH_REJECTED'), ('42501', 'PG_PERMISSION_DENIED'), ('53300', 'PG_CONNECTION_LIMIT')]:
            error = RuntimeError('SYNTHETIC-SECRET');error.sqlstate = state
            self.assertEqual(d.classify(error), code)

    def test_config_rejected_before_dns_and_preserves_tls(self):
        with tempfile.TemporaryDirectory() as folder:
            ca = Path(folder) / 'ca.pem';ca.write_text('-----BEGIN CERTIFICATE-----\nsynthetic')
            config = {'PGHOST': 'db.' + b.PROJECT + '.supabase.co', 'PGPORT': '5432',
                      'PGUSER': 'postgres', 'PGPASSWORD': 'synthetic-secret',
                      'PGDATABASE': 'postgres', 'PGSSLMODE': 'verify-full',
                      'PGSSLROOTCERT': str(ca)}
            cases = [({'PGHOST': '[invalid]'}, 'PG_HOST_INVALID'),
                     ({'PGPORT': '6543'}, 'PG_PORT_INVALID'),
                     ({'PGSSLMODE': 'require'}, 'PG_SSLMODE_INVALID'),
                     ({'PGUSER': ' postgres'}, 'PG_USER_INVALID'),
                     ({'PGSSLROOTCERT': ''}, 'PG_CA_MISSING'),
                     ({'PGHOSTADDR': '127.0.0.1'}, 'PG_OVERRIDE_PROHIBITED')]
            for change, code in cases:
                with patch.dict(os.environ, {**config, **change}, clear=True):
                    with self.assertRaises(d.SourceError) as error:
                        d.validate_config(b.PROJECT, lambda: True)
                    self.assertEqual(error.exception.code, code)
            with patch.dict(os.environ, config, clear=True), patch.object(d.ssl, 'SSLContext') as context:
                self.assertEqual(d.validate_config(b.PROJECT, lambda: True), config['PGHOST'])
                context.return_value.load_verify_locations.assert_called_once_with(cafile=str(ca))
            with patch.dict(os.environ, config, clear=True):
                with self.assertRaises(d.SourceError) as error:d.validate_config(b.PROJECT, lambda: True)
                self.assertEqual(error.exception.code, 'PG_CA_INVALID')

    def test_dns_and_network_codes_and_address_fallback(self):
        with patch.object(d.socket, 'getaddrinfo', side_effect=socket.gaierror(socket.EAI_NONAME, 'SYNTHETIC-SECRET')):
            with self.assertRaises(d.SourceError) as error:d.probe_tcp('synthetic')
            self.assertEqual(error.exception.code, 'PG_DNS_FAILED')
        addresses = [(socket.AF_INET6, socket.SOCK_STREAM, 6, '', ('::1', 5432)), (socket.AF_INET, socket.SOCK_STREAM, 6, '', ('127.0.0.1', 5432))]
        with patch.object(d.socket, 'getaddrinfo', return_value=addresses), patch.object(d.socket, 'socket') as socket_factory:
            socket_factory.return_value.__enter__.return_value.connect.side_effect = [OSError(errno.ENETUNREACH, 'SYNTHETIC-SECRET'), None]
            d.probe_tcp('synthetic')
            self.assertEqual(socket_factory.return_value.__enter__.return_value.connect.call_count, 2)
        for exception, code in [(OSError(errno.ENETUNREACH, 'secret'), 'PG_NETWORK_UNREACHABLE'), (ConnectionRefusedError(errno.ECONNREFUSED, 'secret'), 'PG_TCP_REFUSED'), (TimeoutError('secret'), 'PG_TCP_TIMEOUT')]:
            with patch.object(d.socket, 'getaddrinfo', return_value=addresses[:1]), patch.object(d.socket, 'socket') as factory:
                factory.return_value.__enter__.return_value.connect.side_effect = exception
                with self.assertRaises(d.SourceError) as error:d.probe_tcp('synthetic')
                self.assertEqual(error.exception.code, code)

    def test_connection_failure_closes_resource_and_uses_fixed_code(self):
        connection = MagicMock()
        connection.execute.side_effect = RuntimeError('permission denied SYNTHETIC-SECRET')
        with patch.object(b, 'validate_config', return_value='synthetic'), patch.object(b, 'probe_tcp'), patch.object(b.psycopg, 'connect', return_value=connection):
            with self.assertRaises(d.SourceError) as error:b.source_connection()
            self.assertEqual(error.exception.code, 'PG_PERMISSION_DENIED')
            connection.close.assert_called_once()
            self.assertTrue(connection.read_only)
