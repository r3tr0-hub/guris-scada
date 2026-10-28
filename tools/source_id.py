#!/usr/bin/env python3
"""Content identity of build inputs, independent of local commit/dirty state."""
import hashlib,pathlib
root=pathlib.Path(__file__).resolve().parents[1]
h=hashlib.sha256()
for name in ['src','ui','vendor','reference']:
 for path in sorted((root/name).rglob('*')):
  if path.is_file():
   raw=path.read_bytes()
   try:
    raw.decode('utf-8')
    raw=raw.replace(b'\r\n',b'\n')
   except UnicodeDecodeError:
    pass
   h.update(path.relative_to(root).as_posix().encode());h.update(b'\0');h.update(raw);h.update(b'\0')
print(h.hexdigest())
