#!/usr/bin/env python3
"""Package a compiled Windows executable with UI, docs and refreshed diagnostics."""
import argparse
import hashlib
import ipaddress
import json
import pathlib
import re
import shutil
import struct
import subprocess
import tempfile
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate_exe(path):
    data = path.read_bytes()
    if len(data) < 256 or data[:2] != b'MZ':
        raise ValueError('Executable has no valid MZ header')
    pe = struct.unpack_from('<I', data, 0x3c)[0]
    if pe + 96 > len(data) or data[pe:pe + 4] != b'PE\0\0':
        raise ValueError('Executable has no valid PE header')
    machine = struct.unpack_from('<H', data, pe + 4)[0]
    magic = struct.unpack_from('<H', data, pe + 24)[0]
    subsystem = struct.unpack_from('<H', data, pe + 24 + 68)[0]
    if (machine, magic, subsystem) != (0x8664, 0x20b, 2):
        raise ValueError('Expected PE32+ AMD64 Windows GUI executable')


def read_connection(path):
    """Validate the native four-field format without rewriting working bytes."""
    raw = path.read_bytes()
    if not raw or len(raw) > 2000000:
        raise ValueError('Connection file is empty or exceeds the native file limit')
    def unique_object(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError('Duplicate connection key: ' + key)
            result[key] = value
        return result
    value = json.loads(raw.decode('utf-8'), object_pairs_hook=unique_object)
    if not isinstance(value, dict) or set(value) != {'ip', 'netId', 'port', 'enabled'}:
        raise ValueError('Connection must contain exactly ip, netId, port, enabled')
    if not isinstance(value['ip'], str) or not isinstance(value['netId'], str):
        raise ValueError('IP and AMS Net ID must be strings')
    ipaddress.IPv4Address(value['ip'])
    net = value['netId'].split('.')
    if (len(net) != 6 or any(not re.fullmatch(r'[0-9]{1,3}', item) for item in net)
            or any(int(item) > 255 for item in net) or not any(map(int, net))):
        raise ValueError('Invalid six-byte AMS Net ID')
    port, enabled = value['port'], value['enabled']
    if (type(port) not in (int, float) or not 1 <= port <= 65535 or int(port) != port
            or type(enabled) not in (int, float) or enabled not in (0, 1)):
        raise ValueError('Invalid ADS port or enabled flag')
    return raw, value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--exe', type=pathlib.Path, default=ROOT / 'GurisSCADA_0_1.exe')
    parser.add_argument('--output-dir', type=pathlib.Path, default=ROOT / 'dist')
    profile = parser.add_mutually_exclusive_group()
    profile.add_argument('--connection-config', type=pathlib.Path,
                         help='Copy an explicitly selected working connection.json unchanged')
    profile.add_argument('--offline-template', action='store_true',
                         help='Explicit offline setup; never used implicitly for an update')
    parser.add_argument('--package-label', help='ASCII label in the archive filename')
    args = parser.parse_args()
    if args.package_label and not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', args.package_label):
        parser.error('package-label must contain only ASCII letters, digits, _ or -')
    mode = 'configured' if args.connection_config else 'offline_setup' if args.offline_template else 'update'
    config_raw, config = None, None
    if args.connection_config or args.offline_template:
        try:
            config_raw, config = read_connection(args.connection_config or ROOT / 'connection.example.json')
        except (OSError, UnicodeError, ValueError) as error:
            parser.error('Invalid connection file: ' + str(error))
        if args.offline_template and config['enabled'] != 0:
            parser.error('Offline template must have enabled=0')
    version = (ROOT / 'VERSION').read_text(encoding='utf-8').strip()
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        parser.error('VERSION must contain a three-part numeric version')
    validate_exe(args.exe)
    source_id = 'sha256:' + subprocess.check_output(
        [__import__('sys').executable, str(ROOT / 'tools/source_id.py')], text=True).strip()
    if source_id.encode() not in args.exe.read_bytes():
        raise ValueError('Executable source identity differs from current build inputs; rebuild first')
    output = args.output_dir.resolve()
    output.mkdir(parents=True, exist_ok=True)
    label = args.package_label or {'configured': 'Configured', 'offline_setup': 'OfflineSetup', 'update': 'Update'}[mode]
    archive = output / ('GurisSCADA_' + version.replace('.', '_') + '_' + label + '_Windows_x64.zip')
    try:
        commit = subprocess.check_output(
            ['git', 'rev-parse', 'HEAD'], cwd=ROOT, stderr=subprocess.DEVNULL, text=True,
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        commit = None
    with tempfile.TemporaryDirectory(prefix='guris-release-') as temporary:
        stage = pathlib.Path(temporary) / 'GurisSCADA_0_1'
        stage.mkdir()
        for folder in ('ui', 'docs', 'plc-integration', 'production'):
            shutil.copytree(ROOT / folder, stage / folder,
                            ignore=shutil.ignore_patterns('__pycache__', 'node_modules', '*.tmp'))
        # Only bundled example manuals are shipped; a machine's own guides stay local.
        (stage / 'manuals').mkdir()
        for entry in ('README_RU.md', '01-photo-guide', '02-add-manual'):
            source = ROOT / 'manuals' / entry
            if source.is_dir():
                shutil.copytree(source, stage / 'manuals' / entry)
            elif source.is_file():
                shutil.copy2(source, stage / 'manuals' / entry)
            else:
                raise FileNotFoundError('Missing bundled manual: ' + str(source))
        for name in ('Start_Compatibility.cmd', 'Start_Browser.cmd', 'Run_SCADA_Check.cmd', 'LICENSE_LUCIDE.txt', 'LICENSE_MINIZ.txt'):
            shutil.copy2(ROOT / name, stage / name)
        (stage / 'tools').mkdir()
        shutil.copy2(ROOT / 'tools/Constructor_TZ_SCADA.html', stage / 'tools/Constructor_TZ_SCADA.html')
        shutil.copy2(ROOT / 'tools/analyze_diagnostics.py', stage / 'tools/analyze_diagnostics.py')
        shutil.copy2(args.exe, stage / 'GurisSCADA_0_1.exe')
        # An update must never overwrite the installed machine's connection.
        shutil.copy2(ROOT / 'connection.example.json', stage / 'connection.example.json')
        if config_raw is not None:
            (stage / 'connection.json').write_bytes(config_raw)
        mandatory = [stage / 'GurisSCADA_0_1.exe'] + sorted(p for p in (stage / 'ui').rglob('*') if p.is_file())
        hashes = {p.relative_to(stage).as_posix(): sha256(p) for p in mandatory}
        diagnostics = (ROOT / 'Check_SCADA.ps1').read_text(encoding='utf-8-sig')
        table = '    $expectedFiles = @{\n' + ''.join(
            "        '" + name.replace('/', '\\') + "' = '" + digest + "'\n"
            for name, digest in hashes.items()
        ) + '    }'
        diagnostics, count = re.subn(
            r'(?ms)^    \$expectedFiles = @\{\n.*?^    \}', lambda _: table, diagnostics, count=1,
        )
        if count != 1:
            raise ValueError('Cannot locate the expectedFiles table in Check_SCADA.ps1')
        diagnostics = diagnostics.replace(
            '# Hashes below are taken from the distributed production 0.1.24 archive.',
            '# Hashes below are generated from this packaged build.',
        )
        (stage / 'Check_SCADA.ps1').write_bytes(b'\xef\xbb\xbf' + diagnostics.replace('\n', '\r\n').encode('utf-8'))
        connection_note = {
            'update': 'Это пакет обновления. Рабочий connection.json в него не включён и при распаковке не заменяется. '
                      'Для установки в отдельную папку перенесите connection.json из рабочей версии до запуска. '
                      'Без файла используются встроенные параметры станка.\n',
            'offline_setup': 'Это установочный пакет с ВЫКЛЮЧЕННЫМ подключением и тестовым адресом. '
                             'Для работы на станке перенесите его connection.json либо настройте связь инженером.\n',
            'configured': 'Это пакет с явно выбранной рабочей конфигурацией подключения. '
                          'connection.json перенесён без изменения адресов, порта и разрешения связи. '
                          'Распакуйте в отдельную папку.\n',
        }[mode]
        readme = (
            '# Guris SCADA ' + version + '\n\n'
            'Сбор диагностики: [docs/DIAGNOSTICS_0_1_25_RU.md](docs/DIAGNOSTICS_0_1_25_RU.md).\n'
            'Инструкция: [docs/OPERATIONS_RU.md](docs/OPERATIONS_RU.md).\n\n'
            'Распакуйте архив целиком на локальный диск. Запуск: Start_Compatibility.cmd.\n'
            + connection_note +
            'Перед обновлением полностью завершите прежнюю SCADA. Перенесите весь local и собственные manuals до запуска.\n'
        )
        (stage / 'README_RU.md').write_text(readme, encoding='utf-8')
        manifest = {'version': version, 'target': 'windows-x86_64', 'git_commit': commit,
                    'source_build': source_id, 'package_schema_version': 2, 'package_kind': mode,
                    'connection_file_included': config_raw is not None,
                    'connection_enabled_by_default': bool(config['enabled']) if config else None,
                    'connection_config_sha256': hashlib.sha256(config_raw).hexdigest() if config_raw else None,
                    'required_files_sha256': hashes}
        (stage / 'BUILD_INFO.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as target:
            for path in sorted(stage.rglob('*')):
                if path.is_file():
                    target.write(path, path.relative_to(stage.parent).as_posix())
    print('Packaged: ' + str(archive))
    print('SHA256: ' + sha256(archive))


if __name__ == '__main__':
    main()
