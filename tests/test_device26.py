"""0.1.26 device permissions/subscriptions; only a loopback synthetic PLC."""
import time
import unittest
import test_ads_integration as plc


class Device26(unittest.TestCase):
    setUp = plc.Backend.setUp
    tearDown = plc.Backend.tearDown
    request = plc.Backend.request
    state = plc.Backend.state
    await_state = plc.Backend.await_state
    write = plc.Backend.write
    terminal = plc.Backend.terminal

    def scope(self, name):
        self.assertEqual(self.request('POST', '/api/operator-view', {'scope': name})[0], 200)

    def test_operator_four_groups_write_and_adjacent_engineering_stays_closed(self):
        self.assertEqual(self.state()['auth']['role'], 'operator')
        self.mock.set('machineState', 4)
        self.mock.set('automatic', 1)
        self.await_state(lambda s: s['fields']['automatic']['value'] == 1)
        for key, value in [('airStartAngle', 20), ('airStopAngle', 200),
                           ('feedStartSet', 25), ('feedStopSet', 245), ('jawOffset', 1.25)]:
            status, _, body = self.write(key, value)
            self.assertEqual(status, 202, key)
            self.assertEqual(self.terminal(body)['status'], 'confirmed', key)
        self.scope('unwinder')
        self.await_state(lambda s: s['fields'].get('eng0074', {}).get('quality'))
        status, _, body = self.write('eng0074', 42.5)
        self.assertEqual(status, 202)
        self.assertEqual(self.terminal(body)['status'], 'confirmed')
        for key in ('eng0075', 'jawServoGearQuantity', 'jawGearQuantity', 'jawJogSpeed'):
            body = {'id': 'forbidden-' + key, 'key': key, 'value': '1', 'expected': '00000000', 'epoch': self.state()['epoch']}
            self.assertEqual(self.request('POST', '/api/write', body)[0], 403, key)
        self.assertEqual(self.request('POST', '/api/engineering-view', {'section': 'unwinder'})[0], 403)

    def test_scope_allowlist_expiry_and_read_only_live_values(self):
        self.assertEqual(len(self.state()['fields']), 256)
        for invalid in ('factory', 'mainRoller', '.arbitrary.symbol'):
            self.assertEqual(self.request('POST', '/api/operator-view', {'scope': invalid})[0], 403)
        self.scope('temperature')
        self.mock.set('heat1Output', 63.5)
        state = self.await_state(lambda s: s['fields'].get('heat1Output', {}).get('quality'))
        self.assertAlmostEqual(state['fields']['heat1Output']['value'], 63.5)
        self.assertFalse(state['fields']['heat1Output']['writable'])
        self.assertEqual(self.write('heat1Output', 1)[0], 403)
        self.scope('edge')
        self.mock.set('edgeInput1', 1)
        state = self.await_state(lambda s: s['fields'].get('edgeInput1', {}).get('quality'))
        self.assertEqual(state['fields']['edgeInput1']['value'], 1)
        self.assertFalse(state['fields']['edgeInput1']['writable'])
        self.assertNotIn('heat1Output', state['fields'])
        self.scope('')
        time.sleep(.65)
        mark = len(self.mock.reads)
        time.sleep(.6)
        self.assertFalse(any(key.startswith(('heat1Output', 'edgeInput')) for _, key in self.mock.reads[mark:]))
        self.assertEqual(len(self.state()['fields']), 256)
        self.scope('unwinder')
        self.await_state(lambda s: s['fields'].get('eng0074', {}).get('quality'))
        time.sleep(5.2)
        self.assertNotIn('eng0074', self.state()['fields'])
        self.assertEqual(self.mock.writes, [])

    def test_operator_scope_keeps_metadata_range_and_conflict_guards(self):
        self.scope('unwinder')
        self.await_state(lambda s: s['fields'].get('eng0074', {}).get('quality'))
        self.assertEqual(self.write('eng0074', 101)[0], 422)
        self.assertEqual(self.write('eng0074', -1)[0], 422)
        self.assertEqual(self.write('eng0074', 40, {'expected': 'ffffffff'})[0], 409)
        self.assertEqual(self.mock.writes, [])
        self.scope('')
        body = {'id': 'expired-lease-0001', 'key': 'eng0074', 'value': '40', 'expected': '00000000', 'epoch': self.state()['epoch']}
        self.assertEqual(self.request('POST', '/api/write', body)[0], 409)

    def test_operator_metadata_mismatch_and_unknown_ack_never_retry(self):
        self.mock.metadata_overrides['eng0074'] = {'data_type': 3}
        self.scope('unwinder')
        self.await_state(lambda s: s['fields'].get('eng0074', {}).get('metadata', {}).get('status') == 'type_or_size_mismatch')
        self.assertEqual(self.write('eng0074', 40)[0], 409)
        self.assertEqual(self.mock.writes, [])
        self.mock.metadata_overrides.clear()
        self.mock.version += 1
        self.scope('unwinder')
        self.await_state(lambda s: s['fields'].get('eng0074', {}).get('quality'))
        self.mock.behavior = 'lost_ack'
        status, _, body = self.write('eng0074', 45)
        self.assertEqual(status, 202)
        self.assertEqual(self.terminal(body)['status'], 'uncertain')
        time.sleep(.4)
        self.assertEqual(len([x for x in self.mock.writes if x[0] == 'eng0074']), 1)

    def test_external_elevated_idle_is_returned_once_with_journal(self):
        self.mock.set('beltIdleSpeed', 50)
        self.await_state(lambda s: any(k == 'beltIdleSpeed' for k, _ in self.mock.writes) and s['fields']['beltIdleSpeed']['value'] == 10 and not s['cleaning']['pendingRestore'])
        writes = [entry for entry in self.mock.writes if entry[0] == 'beltIdleSpeed']
        self.assertEqual(writes, [('beltIdleSpeed', plc.pack_value('REAL', 10))])
        time.sleep(1.2)
        self.assertEqual([entry for entry in self.mock.writes if entry[0] == 'beltIdleSpeed'], writes)


if __name__ == '__main__':
    unittest.main()
