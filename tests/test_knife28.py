"""Narrow operator knife authority. Only the loopback ADS peer is used."""
import time
import unittest
import test_ads_integration as plc


KEYS = ('jawWeldingAngleWindow', 'moonstepAccCoefficient', 'moonstepDecCoefficient')


class Knife28(unittest.TestCase):
    setUp = plc.Backend.setUp
    tearDown = plc.Backend.tearDown
    request = plc.Backend.request
    state = plc.Backend.state
    await_state = plc.Backend.await_state
    write = plc.Backend.write
    terminal = plc.Backend.terminal

    def scope(self, name):
        self.assertEqual(self.request('POST', '/api/operator-view', {'scope': name})[0], 200)

    def test_operator_only_three_requested_parameters_and_no_other_engineering(self):
        for key in KEYS:
            self.assertFalse(self.state()['fields'][key]['writable'])
            self.assertEqual(self.write(key, 5)[0], 409)
        self.mock.set('machineState', 4)
        self.mock.set('automatic', 1)
        self.scope('knife')
        self.await_state(lambda s: all(s['fields'][key]['writable'] for key in KEYS))
        for key, value in zip(KEYS, (3.125, 4.75, 5.5)):
            status, _, body = self.write(key, value)
            self.assertEqual(status, 202, key)
            self.assertEqual(self.terminal(body)['status'], 'confirmed', key)
        for key in ('jawServoGearQuantity', 'jawGearQuantity', 'jawJogSpeed', 'jawMaxAcceleration', 'jawMaxSpeed'):
            if key not in self.state()['fields']:
                continue
            self.assertEqual(self.write(key, 1)[0], 403, key)
        self.assertEqual(self.request('POST', '/api/engineering-view', {'section': 'jaw'})[0], 403)
        self.assertEqual(len(self.state()['fields']), 256, 'scope does not expand core polling')

    def test_ranges_conflict_and_scope_expiry_never_write(self):
        self.scope('knife')
        for key, low, high in [(KEYS[0], -0.1, 40.1), (KEYS[1], .99, 20.01), (KEYS[2], .99, 20.01)]:
            self.assertEqual(self.write(key, low)[0], 422)
            self.assertEqual(self.write(key, high)[0], 422)
        self.assertEqual(self.write(KEYS[0], 5, {'expected': 'ffffffff'})[0], 409)
        self.scope('')
        self.assertEqual(self.write(KEYS[1], 5)[0], 409)
        self.scope('knife')
        time.sleep(5.2)
        self.assertFalse(self.state()['fields'][KEYS[1]]['writable'])
        self.assertEqual(self.write(KEYS[1], 5)[0], 409)
        self.assertEqual(self.mock.writes, [])

    def test_lost_ack_is_uncertain_and_does_not_replay(self):
        self.scope('knife')
        self.mock.behavior = 'lost_ack'
        status, _, body = self.write(KEYS[0], 2.5)
        self.assertEqual(status, 202)
        self.assertEqual(self.terminal(body)['status'], 'uncertain')
        self.mock.behavior = 'normal'
        self.await_state(lambda s: s['connected'])
        time.sleep(.6)
        self.assertEqual(len([k for k, _ in self.mock.writes if k == KEYS[0]]), 1)
        self.assertEqual(self.request('POST', '/api/write', body)[0], 202)
        time.sleep(.2)
        self.assertEqual(len([k for k, _ in self.mock.writes if k == KEYS[0]]), 1)

    def test_engineer_keeps_access_without_operator_scope_and_changed_metadata_rejects(self):
        self.assertEqual(self.request('POST', '/api/auth/setup', {'password': '281031'})[0], 200)
        self.scope('')
        self.await_state(lambda s: s['fields'][KEYS[0]]['writable'])
        self.assertEqual(self.write(KEYS[0], 4.25)[0], 202)
        self.await_state(lambda s: not s['busy'])
        self.mock.metadata_overrides[KEYS[1]] = {'data_type': 3}
        status, _, body = self.write(KEYS[1], 4)
        self.assertEqual(status, 202)
        self.assertEqual(self.terminal(body)['status'], 'rejected')
        self.assertFalse(any(key == KEYS[1] for key, _ in self.mock.writes))


if __name__ == '__main__':
    unittest.main()
