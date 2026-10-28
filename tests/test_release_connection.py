"""Release config and startup checks that never override IP or enabled via CLI.

All ADS peers and configuration fixtures in this test are loopback-only.
"""
import contextlib
import hashlib
import http.client
import json
import pathlib
import shutil
import struct
import subprocess
import sys
import tempfile
import time
import unittest
import zipfile

import test_ads_integration as ads

ROOT = ads.ROOT
LIVE = {'ip': '127.0.0.1', 'netId': '1.2.3.4.5.6', 'port': 801, 'enabled': 1}


class ConnectionStartup(unittest.TestCase):
    def setUp(self):
        self.mock = ads.MockPLC()
        self.tmp = tempfile.TemporaryDirectory()
        self.base = pathlib.Path(self.tmp.name)
        shutil.copytree(ROOT / 'ui', self.base / 'ui')

    def tearDown(self):
        self.mock.close()
        self.tmp.cleanup()

    @contextlib.contextmanager
    def boot(self):
        # Only the transport port is redirected to the isolated loopback peer.
        # --ip, --offline and a substitute app base would hide release errors.
        process = subprocess.Popen(
            [str(ROOT / 'scada-test-host'), '--tcp-port', str(self.mock.port)],
            cwd=self.base, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        self.cookie = ''
        try:
            ready = process.stdout.readline().split()
            self.assertEqual(ready[0], 'READY')
            self.port, self.token = int(ready[1]), ready[2]
            yield
        finally:
            with contextlib.suppress(Exception):
                self.request('POST', '/api/quit', {})
            try:
                process.wait(8)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
                self.fail('Backend did not exit')
            self.assertEqual(process.returncode, 0, process.stderr.read())
            process.stdout.close()
            process.stderr.close()

    def request(self, method, route, body=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.port, timeout=4)
        headers = {'X-SCADA-Token': self.token, 'Content-Type': 'application/json'}
        if self.cookie:
            headers['Cookie'] = self.cookie
        connection.request(method, route, json.dumps(body) if body is not None else None, headers)
        response = connection.getresponse()
        data, status = json.loads(response.read()), response.status
        if response.getheader('Set-Cookie'):
            self.cookie = response.getheader('Set-Cookie').split(';')[0]
        connection.close()
        return status, data

    def state(self):
        status, data = self.request('GET', '/api/state')
        self.assertEqual(status, 200)
        return data

    def wait_connected(self):
        deadline = time.monotonic() + 7
        while time.monotonic() < deadline:
            data = self.state()
            if all(data['fields'][key]['quality'] for key in ('current', 'groups', 'total')):
                return data
            time.sleep(.04)
        self.fail('Saved connection did not become live')

    def test_distributed_offline_template_explains_no_connection(self):
        shutil.copy2(ROOT / 'connection.example.json', self.base / 'connection.json')
        with self.boot():
            time.sleep(.6)
            data = self.state()
            self.assertFalse(data['connected'])
            self.assertEqual(data['ip'], '127.0.0.1')
            self.assertIn('отключено', data['message'])
            self.assertFalse(data['fields']['total']['quality'])
            self.assertEqual(self.mock.reads, [])
            self.assertEqual(self.mock.writes, [])

    def test_existing_enabled_connection_starts_without_cli_ip_override(self):
        (self.base / 'connection.json').write_text(json.dumps(LIVE))
        with self.boot():
            data = self.wait_connected()
            self.assertEqual(data['netId'], LIVE['netId'])
            self.assertEqual(data['port'], LIVE['port'])
            self.assertEqual(data['fields']['total']['value'], ads.INITIAL['total'])
            self.assertEqual(self.mock.writes, [])

    def test_restored_configuration_is_used_on_next_process_start(self):
        shutil.copy2(ROOT / 'connection.example.json', self.base / 'connection.json')
        with self.boot():
            time.sleep(.2)
            self.assertFalse(self.state()['connected'])
        (self.base / 'connection.json').write_text(json.dumps(LIVE))
        with self.boot():
            self.assertTrue(self.wait_connected()['connected'])
            self.assertEqual(self.mock.writes, [])

    def test_ui_connection_edit_survives_restart_with_diagnostics(self):
        shutil.copy2(ROOT / 'connection.example.json', self.base / 'connection.json')
        with self.boot():
            self.assertEqual(self.request('POST', '/api/auth/setup', {'password': '036281'})[0], 200)
            self.assertEqual(self.request('POST', '/api/connect', LIVE)[0], 202)
            self.wait_connected()
        self.assertEqual(json.loads((self.base / 'connection.json').read_text()), LIVE)
        with self.boot():
            self.wait_connected()
            self.assertEqual(self.mock.writes, [])


class ReleasePackaging(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.base = pathlib.Path(cls.tmp.name)
        cls.exe = cls.base / 'packaging-only-fixture.exe'
        # PE header fixture validates packaging; it is never executed or shipped.
        data = bytearray(512)
        data[:2] = b'MZ'
        struct.pack_into('<I', data, 0x3c, 0x80)
        data[0x80:0x84] = b'PE\0\0'
        struct.pack_into('<H', data, 0x84, 0x8664)
        struct.pack_into('<H', data, 0x80 + 24, 0x20b)
        struct.pack_into('<H', data, 0x80 + 24 + 68, 2)
        identity = subprocess.check_output([sys.executable, str(ROOT / 'tools/source_id.py')]).strip()
        cls.exe.write_bytes(data + b'sha256:' + identity)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def package(self, extra=(), success=True):
        destination = pathlib.Path(tempfile.mkdtemp(dir=self.base))
        result = subprocess.run(
            [sys.executable, str(ROOT / 'tools/build_release.py'), '--exe', str(self.exe),
             '--output-dir', str(destination), *map(str, extra)],
            capture_output=True, text=True)
        if not success:
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(list(destination.glob('*.zip')), [])
            return
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        archive, = destination.glob('*.zip')
        return archive

    def test_default_update_cannot_overwrite_installed_connection(self):
        archive = self.package()
        installed = self.base / 'installed'
        root = installed / 'GurisSCADA_0_1'
        root.mkdir(parents=True)
        original = json.dumps(LIVE, indent=4).encode()
        (root / 'connection.json').write_bytes(original)
        with zipfile.ZipFile(archive) as z:
            self.assertNotIn('GurisSCADA_0_1/connection.json', z.namelist())
            self.assertIn('GurisSCADA_0_1/connection.example.json', z.namelist())
            metadata = json.loads(z.read('GurisSCADA_0_1/BUILD_INFO.json'))
            self.assertEqual(metadata['package_kind'], 'update')
            self.assertFalse(metadata['connection_file_included'])
            z.extractall(installed)
        self.assertEqual((root / 'connection.json').read_bytes(), original)

    def test_configured_package_preserves_selected_working_bytes(self):
        original = (json.dumps(LIVE, indent=3) + '\n').encode()
        path = self.base / 'chosen.json'
        path.write_bytes(original)
        archive = self.package(['--connection-config', path, '--package-label', 'KP4_ConnectionFix'])
        self.assertIn('KP4_ConnectionFix', archive.name)
        with zipfile.ZipFile(archive) as z:
            self.assertIsNone(z.testzip())
            self.assertEqual(z.read('GurisSCADA_0_1/connection.json'), original)
            metadata = json.loads(z.read('GurisSCADA_0_1/BUILD_INFO.json'))
            self.assertEqual(metadata['package_kind'], 'configured')
            self.assertTrue(metadata['connection_enabled_by_default'])
            self.assertEqual(metadata['connection_config_sha256'], hashlib.sha256(original).hexdigest())
            self.assertFalse(any('/local/' in n or '/logs/' in n for n in z.namelist()))

    def test_explicit_offline_setup_is_labelled_and_stays_disabled(self):
        archive = self.package(['--offline-template'])
        self.assertIn('OfflineSetup', archive.name)
        with zipfile.ZipFile(archive) as z:
            config = json.loads(z.read('GurisSCADA_0_1/connection.json'))
            self.assertEqual(config['enabled'], 0)
            metadata = json.loads(z.read('GurisSCADA_0_1/BUILD_INFO.json'))
            self.assertEqual(metadata['package_kind'], 'offline_setup')
            self.assertFalse(metadata['connection_enabled_by_default'])

    def test_configured_disabled_flag_is_not_silently_enabled(self):
        path = self.base / 'disabled.json'
        path.write_text(json.dumps({**LIVE, 'enabled': 0}))
        archive = self.package(['--connection-config', path])
        with zipfile.ZipFile(archive) as z:
            self.assertEqual(json.loads(z.read('GurisSCADA_0_1/connection.json'))['enabled'], 0)

    def test_invalid_configuration_never_produces_a_package(self):
        path = self.base / 'invalid.json'
        for change in [{'ip': 'bad'}, {'netId': '1.2.3.4.5.999'}, {'enabled': True}, {'port': 0}, {'extra': 1}]:
            path.write_text(json.dumps({**LIVE, **change}))
            self.package(['--connection-config', path], success=False)
        path.write_text(json.dumps(LIVE)[:-1] + ',"enabled":0}')
        self.package(['--connection-config', path], success=False)

    def test_conflicting_modes_and_unsafe_label_are_rejected(self):
        self.package(['--connection-config', self.base / 'unused.json', '--offline-template'], success=False)
        self.package(['--package-label', '../escape'], success=False)
