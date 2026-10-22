"""Decode actual PLC replies. This test never creates a PLC connection."""
import ctypes
import json
import pathlib
import struct
import subprocess
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


class Metadata(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        wrapper = pathlib.Path(cls.tmp.name) / 'metadata_probe.c'
        wrapper.write_text(r'''
#include "src/app.h"
#include "src/http.h"
int metadata_probe(const unsigned char *bytes,size_t size,const char *name,int field,
                   uint32_t *out,char *type,size_t type_size){
    Meta m;int layout=ads_decode_metadata(bytes,size,name,&m);
    out[0]=m.group;out[1]=m.offset;out[2]=m.size;out[3]=m.data_type;out[4]=m.flags;
    out[5]=(uint32_t)m.resolution;out[6]=(uint32_t)m.valid;
    out[7]=(field>=0&&field<F_COUNT)?(uint32_t)metadata_matches(field,&m):0;
    copy_s(type,type_size,m.type);return layout;
}
int metadata_field(const char *name){return field_index(name);}
''')
        shared = pathlib.Path(cls.tmp.name) / 'metadata_probe.so'
        subprocess.run(['cc', '-std=c11', '-O1', '-g', '-Wall', '-Wextra',
                        '-Werror', '-Wno-unused-function', '-fPIC', '-shared',
                        '-I', str(ROOT), str(wrapper), '-o', str(shared),
                        '-pthread', '-lm'], check=True)
        cls.lib = ctypes.CDLL(str(shared))
        cls.lib.metadata_probe.argtypes = [ctypes.c_void_p, ctypes.c_size_t,
                                          ctypes.c_char_p, ctypes.c_int,
                                          ctypes.c_void_p, ctypes.c_void_p,
                                          ctypes.c_size_t]
        cls.lib.metadata_probe.restype = ctypes.c_int
        cls.lib.metadata_field.argtypes = [ctypes.c_char_p]
        cls.lib.metadata_field.restype = ctypes.c_int
        cls.captured = json.loads((ROOT/'tests/fixtures/plc_nested_metadata.json').read_text())['fixtures']
        cls.catalog = json.loads((ROOT/'tests/fixtures/plc_catalog_metadata.json').read_text())['fields']

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def probe(self, packet, name, key=None):
        data = ctypes.create_string_buffer(bytes(packet))
        values = (ctypes.c_uint32 * 8)()
        type_name = ctypes.create_string_buffer(80)
        field = self.lib.metadata_field(key.encode()) if key else -1
        layout = self.lib.metadata_probe(data, len(packet), name.encode(), field,
                                         values, type_name, len(type_name))
        return layout, list(values), type_name.value.decode()

    @staticmethod
    def entry(row, padded=False):
        name, typ = row['symbol'].encode(), row['type'].encode()
        nl = len(name) + int(padded)
        gap = b'\0\xa5' if padded else b'\0'
        return struct.pack('<IIIIIIHHH', 33+nl+len(typ), row['group'], row['offset'],
                           row['size'], row['data_type'], row['flags'], nl,
                           len(typ), 0) + name + gap + typ + b'\0\0'

    def test_five_captured_nested_replies(self):
        for row in self.captured:
            with self.subTest(name=row['requested_name']):
                reply = bytes.fromhex(row['reply_hex'])
                packet = reply[46:]
                self.assertEqual(len(packet), struct.unpack_from('<I', reply, 42)[0])
                layout, values, typ = self.probe(packet, row['requested_name'])
                self.assertEqual(layout, 2)
                self.assertEqual(typ, row['expected_type'])
                self.assertEqual(values[:5], [row['expected_group'], row['expected_offset'],
                                             row['expected_size'], row['expected_data_type'], row['expected_flags']])
                self.assertEqual(values[6], 1)
                # All byte prefixes and unexplained record tails are rejected.
                for end in range(len(packet)):
                    self.assertEqual(self.probe(packet[:end], row['requested_name'])[0], 0)
                self.assertEqual(self.probe(packet+b'\0', row['requested_name'])[0], 0)
                self.assertEqual(self.probe(packet, row['requested_name']+'X')[0], 0)

    def test_all_26_live_catalog_types_in_both_layouts(self):
        for row in self.catalog:
            for padded in (False, True):
                with self.subTest(key=row['key'], padded=padded):
                    layout, values, typ = self.probe(self.entry(row, padded), row['symbol'], row['key'])
                    self.assertEqual(layout, 2 if padded else 1)
                    self.assertEqual(typ, row['type'])
                    self.assertEqual(values[7], 1)

    def test_signedness_numeric_type_size_and_flags_stay_strict(self):
        original = next(r for r in self.catalog if r['key']=='waitingLimit')
        for change in ({'type':'UINT16', 'data_type':18}, {'data_type':18},
                       {'size':4}, {'flags':2}, {'flags':4}):
            row = dict(original, **change)
            self.assertEqual(self.probe(self.entry(row), row['symbol'], row['key'])[1][7], 0, change)
        for flags in (0, 1, 32):
            row = dict(original, flags=flags)
            self.assertEqual(self.probe(self.entry(row), row['symbol'], row['key'])[1][7], 1)

    def test_string_terminators_and_lengths_are_checked(self):
        row = self.catalog[0]
        for padded in (False, True):
            original = self.entry(row, padded)
            nl, tl = struct.unpack_from('<HH', original, 24)
            bad = bytearray(original); bad[31] = 0
            self.assertEqual(self.probe(bad, row['symbol'])[0], 0)
            bad = bytearray(original); bad[31+nl+tl] = ord('X')
            self.assertEqual(self.probe(bad, row['symbol'])[0], 0)
            bad = bytearray(original); struct.pack_into('<H', bad, 24, 65535)
            self.assertEqual(self.probe(bad, row['symbol'])[0], 0)
        # Exactly one post-terminator byte was observed; two bytes are not accepted.
        bad = bytearray(self.entry(row, True)); nl = struct.unpack_from('<H', bad, 24)[0]
        bad.insert(30+nl, 0xa5); struct.pack_into('<I', bad, 0, len(bad)); struct.pack_into('<H', bad, 24, nl+1)
        self.assertEqual(self.probe(bad, row['symbol'])[0], 0)


if __name__ == '__main__':
    unittest.main(verbosity=2)
