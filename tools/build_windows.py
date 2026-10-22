#!/usr/bin/env python3
"""Build the production Windows x64 executable using Zig 0.13.0."""
import argparse
import importlib.util
import pathlib
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--zig', help='Path to Zig 0.13.0; otherwise PATH or the ziglang package')
    parser.add_argument('--output', type=pathlib.Path, default=ROOT / 'GurisSCADA_0_1.exe')
    args = parser.parse_args()
    zig = [args.zig] if args.zig else None
    if zig is None:
        installed = shutil.which('zig')
        if installed:
            zig = [installed]
        elif importlib.util.find_spec('ziglang'):
            zig = [sys.executable, '-m', 'ziglang']
        else:
            parser.error('Install Zig 0.13.0 or run: python -m pip install -r requirements-build.txt')
    version = subprocess.check_output(zig + ['version'], text=True).strip()
    if version != '0.13.0':
        parser.error('Expected Zig 0.13.0, found ' + version)
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    common = ['cc', '-target', 'x86_64-windows-gnu', '-std=c11', '-O2', '-Wall', '-Wextra']
    with tempfile.TemporaryDirectory(prefix='guris-windows-') as temporary:
        sqlite = str(pathlib.Path(temporary) / 'sqlite.o')
        subprocess.run(zig + common + [
            '-Wno-unused-parameter', '-DSQLITE_OMIT_LOAD_EXTENSION', '-DSQLITE_DQS=0',
            '-DSQLITE_DEFAULT_MEMSTATUS=0', '-c', 'vendor/sqlite/sqlite3.c', '-o', sqlite,
        ], cwd=ROOT, check=True)
        subprocess.run(zig + common + [
            '-s', '-municode', '-Wl,--subsystem,windows', 'src/main.c', sqlite,
            '-o', str(output), '-lws2_32', '-lshell32', '-luser32', '-lbcrypt',
        ], cwd=ROOT, check=True)
    print('Built: ' + str(output))


if __name__ == '__main__':
    main()
