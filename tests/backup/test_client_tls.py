"""Real local libpq TLS handshakes, synthetic certs, no production or SQL writes.

The tiny PostgreSQL wire fixture implements startup/authentication only. It is
not a proxy to any database and has no credentials or application records.
"""
import contextlib
from datetime import datetime, timedelta, timezone
from pathlib import Path
import socket
import ssl
import struct
import sys
import tempfile
import threading
import unittest

import psycopg
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools/backup'))
from source_diagnostics import verify_client_tls, SourceError


def certificate(root, prefix):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'localhost')])
    now = datetime.now(timezone.utc)
    cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name)
            .public_key(key.public_key()).serial_number(x509.random_serial_number())
            .not_valid_before(now - timedelta(minutes=5)).not_valid_after(now + timedelta(days=1))
            .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
            .add_extension(x509.SubjectAlternativeName([x509.DNSName('localhost')]), critical=False)
            .sign(key, hashes.SHA256()))
    ca, private = root / (prefix + '.crt'), root / (prefix + '.key')
    ca.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    private.write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
    private.chmod(0o600)
    return str(ca), str(private)


def read_exact(sock, count):
    out = b''
    while len(out) < count:
        part = sock.recv(count - len(out))
        if not part:
            raise EOFError()
        out += part
    return out


@contextlib.contextmanager
def endpoint(cert, private, encrypted=True):
    listener = socket.socket()
    listener.bind(('127.0.0.1', 0))
    listener.listen(1)
    listener.settimeout(10)
    port = listener.getsockname()[1]
    def serve():
        try:
            with listener.accept()[0] as client:
                client.settimeout(5)
                if encrypted:
                    if read_exact(client, 8) != struct.pack('!II', 8, 80877103):
                        return
                    client.sendall(b'S')
                    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
                    context.load_cert_chain(cert, private)
                    with context.wrap_socket(client, server_side=True) as secured:
                        startup(secured)
                else:
                    startup(client)
        except (OSError, EOFError, ssl.SSLError):
            pass  # Negative TLS tests intentionally terminate the handshake.
    def startup(client):
        size = struct.unpack('!I', read_exact(client, 4))[0]
        read_exact(client, size - 4)
        def message(kind, payload):
            return kind + struct.pack('!I', len(payload) + 4) + payload
        payload = message(b'R', struct.pack('!I', 0))
        for key, value in [('server_version', '17.6'), ('client_encoding', 'UTF8'), ('integer_datetimes', 'on')]:
            payload += message(b'S', key.encode() + b'\0' + value.encode() + b'\0')
        client.sendall(payload + message(b'Z', b'I'))
        try:client.recv(1024)  # Wait for client close/Terminate, never execute SQL.
        except OSError:pass
    thread = threading.Thread(target=serve, daemon=True)
    thread.start()
    try:
        yield port
    finally:
        listener.close()
        thread.join(timeout=12)


class ClientTLSTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        root = Path(cls.temp.name)
        cls.ca, cls.private = certificate(root, 'valid')
        cls.wrong_ca, _ = certificate(root, 'wrong')

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def connect(self, port, **overrides):
        args = dict(host='localhost', hostaddr='127.0.0.1', port=port,
                    user='synthetic', dbname='synthetic', sslmode='verify-full',
                    sslrootcert=self.ca, connect_timeout=5, gssencmode='disable')
        return psycopg.connect(**{**args, **overrides})

    def test_real_tls_and_verified_hostname_accepted(self):
        with endpoint(self.ca, self.private) as port:
            with self.connect(port) as connection:
                self.assertIs(connection.pgconn.ssl_in_use, True)
                verify_client_tls(connection, 'localhost', self.ca)

    def test_wrong_hostname_rejected_by_libpq(self):
        with endpoint(self.ca, self.private) as port:
            with self.assertRaises(psycopg.OperationalError):
                self.connect(port, host='wrong.invalid')

    def test_untrusted_ca_rejected_by_libpq(self):
        with endpoint(self.ca, self.private) as port:
            with self.assertRaises(psycopg.OperationalError):
                self.connect(port, sslrootcert=self.wrong_ca)

    def test_plaintext_client_rejected_by_guard(self):
        with endpoint(self.ca, self.private, encrypted=False) as port:
            with self.connect(port, sslmode='disable') as connection:
                with self.assertRaises(SourceError) as error:
                    verify_client_tls(connection, 'localhost', self.ca)
                self.assertEqual(error.exception.code, 'PG_TLS_NOT_ACTIVE')
