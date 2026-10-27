"""Precision corruption tests; native execution remains a separate explicit gate."""
import json
import subprocess
import struct
import tempfile
from pathlib import Path
import unittest
from unittest.mock import MagicMock, patch
from protocol import ProtocolError
from state_trace import float_transport as codec
from state_trace import native_capture


def wire():
    values = [repr(codec.from_bits(bits)) + '|' + str(bits) for bits in codec.BITS]
    payload = dict(text='Gaia\'s "Landing"\\road\nline\ttab', value=codec.from_bits(codec.BITS[3]),
                   signed_zero=-0.0, integer=1, boolean=True, empty=None)
    native = dict(controls=''.join(chr(value) for value in range(32)), unicode='Gaïa α 🌱', empty='',
                  maximum=2**63-1, minimum=-(2**63), nested=[True, None, codec.from_bits(codec.BITS[3])])
    return '\n'.join(['FLOAT_CODEC|' + value for value in values] +
                     ['TRACE_CODEC_JSON|' + json.dumps(payload), 'JSON_NATIVE_CODEC_V2|' + json.dumps(native),
                      'BEHAVIOR_SUMMARY 3 31', 'All tests passed.'])


class PrecisionTests(unittest.TestCase):
    def test_exact_independent_native_bit_values_and_json_escapes(self):
        report = codec.audit(wire())
        self.assertEqual(report['sample_count'], 8)
        self.assertTrue(report['signed_zero_preserved'])
        self.assertEqual(report['payload']['value'], 0.3333333432674408)

    def test_nine_digits_that_roundtrip_f32_still_fail_strict_json_value(self):
        native = codec.from_bits(codec.BITS[3])
        rounded = 0.333333343
        self.assertEqual(codec.BITS[3], struct.unpack('>I', struct.pack('>f', rounded))[0])
        self.assertNotEqual(native, rounded)
        with self.assertRaises(ProtocolError): codec.audit(wire().replace(repr(native) + '|', str(rounded) + '|', 1))

    def test_six_digits_nonfinite_integer_type_and_signed_zero_corruption_fail(self):
        original = wire()
        cases = [original.replace('0.3333333432674408|', '0.333333|', 1),
                 original.replace('0.3333333432674408|', 'NaN|', 1),
                 original.replace('1.0|1065353216', '1|1065353216'),
                 original.replace('-0.0|2147483648', '0.0|2147483648')]
        for value in cases:
            with self.subTest(value=value[:80]), self.assertRaises(ProtocolError): codec.audit(value)

    def test_missing_duplicate_reordered_native_fields_and_bad_summary_fail(self):
        original = wire()
        lines = original.splitlines()
        cases = ['\n'.join(lines[1:]), original + '\n' + lines[0],
                 '\n'.join([lines[1], lines[0]] + lines[2:]),
                 original.replace('All tests passed.', 'TEST FAILED'),
                 original.replace('"integer": 1', '"integer": 1.0')]
        for value in cases:
            with self.subTest(value=value[:80]), self.assertRaises(ProtocolError): codec.audit(value)

    def test_native_string_and_integer_boundary_corruption_is_not_normalized(self):
        original = wire()
        row = next(line for line in original.splitlines() if line.startswith('JSON_NATIVE_CODEC_V2|'))
        native = json.loads(row.split('|', 1)[1])
        mutations = []
        for change in ('controls', 'unicode', 'integer', 'missing'):
            value = dict(native)
            if change == 'controls': value['controls'] = value['controls'].replace('\r', '')
            elif change == 'unicode': value['unicode'] = 'Gaia α 🌱'
            elif change == 'integer': value['maximum'] = float(value['maximum'])
            else: del value['empty']
            mutations.append(original.replace(row, 'JSON_NATIVE_CODEC_V2|' + json.dumps(value)))
        mutations += [original.replace(row, ''), original + '\n' + row]
        for log in mutations:
            with self.subTest(log=log[-100:]), self.assertRaises(ProtocolError): codec.audit(log)

    def test_native_timeout_and_spawn_failure_have_distinct_execution_receipts(self):
        with tempfile.TemporaryDirectory() as temporary:
            runtime = Path(temporary) / 'GLSMAC.js'; runtime.write_text('loader')
            runtime.with_suffix('.wasm').write_bytes(b'wasm')
            process = MagicMock(); process.__enter__.return_value = process
            process.returncode = -9
            process.communicate.side_effect = [subprocess.TimeoutExpired('node', 1), ('BEHAVIOR_BEGIN native\n', '')]
            with patch.object(native_capture.subprocess, 'Popen', return_value=process), self.assertRaises(native_capture.NativeCaptureError) as caught:
                native_capture.capture_script(runtime, codec.SCRIPT, timeout=1)
            self.assertTrue(caught.exception.execution['candidate_executed'])
            self.assertTrue(caught.exception.execution['native_execution_confirmed'])
            self.assertEqual(caught.exception.execution['process_returncode'], -9)
            process.kill.assert_called_once(); self.assertEqual(process.communicate.call_count, 2)
            with patch.object(native_capture.subprocess, 'Popen', side_effect=FileNotFoundError('node')), self.assertRaises(native_capture.NativeCaptureError) as caught:
                native_capture.capture_script(runtime, codec.SCRIPT)
            self.assertFalse(caught.exception.execution['candidate_executed'])
            self.assertFalse(caught.exception.execution['native_execution_confirmed'])
            self.assertIsNone(caught.exception.execution['process_returncode'])

    def test_complete_native_summary_does_not_hide_failed_process_shutdown(self):
        with tempfile.TemporaryDirectory() as temporary:
            runtime = Path(temporary) / 'GLSMAC.js'; runtime.write_text('loader')
            runtime.with_suffix('.wasm').write_bytes(b'wasm')
            complete = 'BEHAVIOR_BEGIN native\nBEHAVIOR_PASS native\nBEHAVIOR_SUMMARY 1 1\nAll tests passed.\n'
            for returncode in (0, 1):
                process = MagicMock(); process.__enter__.return_value = process
                process.returncode = returncode; process.communicate.return_value = (complete, '')
                with self.subTest(returncode=returncode), patch.object(native_capture.subprocess, 'Popen', return_value=process):
                    if returncode:
                        with self.assertRaises(native_capture.NativeCaptureError) as caught:
                            native_capture.capture_script(runtime, codec.SCRIPT)
                        execution = caught.exception.execution
                    else:
                        log, execution = native_capture.capture_script(runtime, codec.SCRIPT)
                        self.assertEqual(log, complete)
                        self.assertEqual(execution['status'], 'ok')
                    self.assertEqual(execution['process_returncode'], returncode)
                    self.assertTrue(execution['native_execution_confirmed'])


if __name__ == '__main__': unittest.main()
