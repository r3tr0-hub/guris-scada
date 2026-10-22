#!/usr/bin/env python3
"""Package a compiled Windows executable with UI, docs and refreshed diagnostics."""
import argparse
import hashlib
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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--exe', type=pathlib.Path, default=ROOT / 'GurisSCADA_0_1.exe')
    parser.add_argument('--output-dir', type=pathlib.Path, default=ROOT / 'dist')
    args = parser.parse_args()
    version = (ROOT / 'VERSION').read_text(encoding='utf-8').strip()
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        parser.error('VERSION must contain a three-part numeric version')
    validate_exe(args.exe)
    output = args.output_dir.resolve()
    output.mkdir(parents=True, exist_ok=True)
    archive = output / ('GurisSCADA_' + version.replace('.', '_') + '_Windows_x64.zip')
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
        for name in ('Start_Compatibility.cmd', 'Start_Browser.cmd', 'Run_SCADA_Check.cmd', 'LICENSE_LUCIDE.txt'):
            shutil.copy2(ROOT / name, stage / name)
        (stage / 'tools').mkdir()
        shutil.copy2(ROOT / 'tools/Constructor_TZ_SCADA.html', stage / 'tools/Constructor_TZ_SCADA.html')
        shutil.copy2(args.exe, stage / 'GurisSCADA_0_1.exe')
        shutil.copy2(ROOT / 'connection.example.json', stage / 'connection.json')
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
        readme = (
            '# Guris SCADA ' + version + '\n\n'
            'Инструкция: [docs/OPERATIONS_RU.md](docs/OPERATIONS_RU.md).\n\n'
            'Распакуйте архив целиком на локальный диск. Запуск: Start_Compatibility.cmd.\n'
            'В новой сборке подключение выключено. При обновлении перенесите прежние connection.json, '
            'весь local и собственные manuals до запуска. Для новой установки настройте связь инженером.\n'
        )
        (stage / 'README_RU.md').write_text(readme, encoding='utf-8')
        manifest = {'version': version, 'target': 'windows-x86_64', 'git_commit': commit,
                    'connection_enabled_by_default': False, 'required_files_sha256': hashes}
        (stage / 'BUILD_INFO.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as target:
            for path in sorted(stage.rglob('*')):
                if path.is_file():
                    target.write(path, path.relative_to(stage.parent).as_posix())
    print('Packaged: ' + str(archive))
    print('SHA256: ' + sha256(archive))


if __name__ == '__main__':
    main()
