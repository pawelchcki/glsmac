"""Bounded read-only replay of the one retained INCOMPLETE movement capture.

No subprocess, extraction, assets, runtime evaluation, historical path or PID
access. CLI zero means this offline audit completed; it never means game PASS.
"""
from pathlib import Path
import argparse
import collections
import gzip
import hashlib
import importlib
import io
import json
import sys
import tarfile

ALLOWLIST = ('application.log', 'application-log-chunks.jsonl', 'receipt-acceptance.json',
             'movement-result.json', 'raw-outcome.json', 'report.json', 'setup-processes.jsonl',
             'node.log', 'preflight.json', 'launch-plan.json', 'operator-execution-context.json',
             'post-restoration.json', 'owned-process-samples.jsonl', 'independent-delivery-audit.json')
MANIFEST = 'tools/behavior-tests/ui/unit-body-movement-evidence-v2.manifest.json'
SOURCE_EQ = 'tools/behavior-tests/ui/unit-body-movement-source-equivalence-v2.json'
SOURCE_FREEZE = 'tools/behavior-tests/ui/unit-body-movement-source-freeze-v2.json'
ACTUAL_SOURCE = '66dc0b997e2804a33012bebaea45bca0c221e22d'
MAX_COMPRESSED = 256 * 1024
MAX_TAR = 3 * 1024 * 1024
MAX_MEMBER = 1536 * 1024


def require(ok, message):
    if not ok:
        raise ValueError(message)


def sha(value):
    return hashlib.sha256(value).hexdigest()


def read_bounded(path, maximum):
    with Path(path).open('rb') as stream:
        value = stream.read(maximum + 1)
    require(len(value) <= maximum, 'input exceeds bounded size')
    return value


def load_bundle(bundle, manifest):
    """Read fixed regular-file members into memory; never extract any paths."""
    require(manifest['schema'] == 'candidate.unit-body-movement-retained.v2', 'manifest schema')
    require(type(manifest['members']) is list and
            [row['name'] for row in manifest['members']] == list(ALLOWLIST), 'exact member allowlist required')
    require(type(manifest['compressed_bytes']) is int and 0 < manifest['compressed_bytes'] <= MAX_COMPRESSED, 'compressed size')
    require(type(manifest['uncompressed_tar_bytes']) is int and 0 < manifest['uncompressed_tar_bytes'] <= MAX_TAR, 'tar size')
    compressed = read_bounded(bundle, MAX_COMPRESSED)
    require(len(compressed) == manifest['compressed_bytes'] and sha(compressed) == manifest['archive_sha256'], 'archive hash/size differs')
    with gzip.GzipFile(fileobj=io.BytesIO(compressed)) as stream:
        data = stream.read(MAX_TAR + 1)
    require(len(data) <= MAX_TAR and len(data) == manifest['uncompressed_tar_bytes'], 'decompressed size differs')
    result = {}
    total = 0
    with tarfile.open(fileobj=io.BytesIO(data), mode='r:') as archive:
        for index, member in enumerate(archive):
            require(index < len(ALLOWLIST), 'too many archive members')
            expected = manifest['members'][index]
            require(member.name == ALLOWLIST[index] and '/' not in member.name and '\\' not in member.name, 'unsafe/reordered member name')
            require(member.type == tarfile.REGTYPE and member.isfile() and not member.pax_headers, 'only regular fixed members supported')
            require(member.uid == member.gid == member.mtime == 0 and member.uname == member.gname == '' and member.mode == 0o444, 'noncanonical archive metadata')
            require(type(expected['bytes']) is int and 0 <= expected['bytes'] <= MAX_MEMBER and member.size == expected['bytes'], 'member size')
            stream = archive.extractfile(member)
            require(stream is not None, 'missing member bytes')
            value = stream.read(MAX_MEMBER + 1)
            require(len(value) == member.size and sha(value) == expected['sha256'], 'member hash/size differs')
            value.decode('utf-8')
            result[member.name] = value
            total += len(value)
    require(tuple(result) == ALLOWLIST and total == manifest['member_total_bytes'] and total <= MAX_TAR, 'missing member/total size')
    canonical = io.BytesIO()
    with tarfile.open(fileobj=canonical, mode='w', format=tarfile.USTAR_FORMAT) as archive:
        for name, value in result.items():
            member = tarfile.TarInfo(name); member.size = len(value)
            member.mtime = member.uid = member.gid = 0; member.uname = member.gname = ''; member.mode = 0o444
            archive.addfile(member, io.BytesIO(value))
    require(canonical.getvalue() == data, 'noncanonical or unlisted archive bytes')
    return result


def replay(bundle, manifest_path, source_root):
    """Explicit public source only. Captured filenames/PIDs remain inert data."""
    root = Path(source_root).resolve()
    manifest_bytes = read_bounded(manifest_path, 16384)
    require(manifest_bytes == read_bounded(root / MANIFEST, 16384), 'manifest differs from explicit source checkout')
    manifest = json.loads(manifest_bytes)
    data = load_bundle(bundle, manifest)
    decode = lambda name: json.loads(data[name])
    equivalent = json.loads(read_bounded(root / SOURCE_EQ, 32768))
    for key, relative in (('source_equivalence', SOURCE_EQ), ('original_source_freeze', SOURCE_FREEZE)):
        require(manifest[key]['path'] == relative and sha(read_bounded(root / relative, 32768)) == manifest[key]['sha256'], 'public source metadata differs')
    require(manifest['actual_executed_source'] == equivalent['actual_executed_commit'] == ACTUAL_SOURCE and
            equivalent['public_commit_was_game_executed'] is False, 'historical source identity changed')
    # These modules are pure source validators. Explicit-root binding avoids
    # accidentally auditing with some unrelated already-imported checkout.
    sys.path.insert(0, str(root / 'tools/behavior-tests'))
    try:
        proof = importlib.import_module('state_trace.unit_body_movement_proof')
    finally:
        sys.path.pop(0)
    require(Path(proof.__file__).resolve() == root / 'tools/behavior-tests/state_trace/unit_body_movement_proof.py', 'validator source root differs')
    report, outcome, pre = (decode(name) for name in ('report.json', 'raw-outcome.json', 'preflight.json'))
    acceptance, strict, independent = (decode(name) for name in ('receipt-acceptance.json', 'movement-result.json', 'independent-delivery-audit.json'))
    require(pre['source_files_sha256'] == equivalent['source_files_sha256'], 'historical 41-file source scope differs')
    require(report['host_head'] == pre['head'] == outcome['head'] == ACTUAL_SOURCE, 'recorded source differs')
    require(report['native_source_tree'] == outcome['native_tree'] == pre['native_tree'] == manifest['native_tree'], 'recorded Native differs')
    require(report['production_default_tree'] == outcome['default_tree'] == pre['default_tree'] == manifest['default_tree'], 'recorded Default differs')
    require(type(outcome['raw_node_exit']) is int and outcome['raw_node_exit'] == 1 and outcome['os_wait_completed'] is True, 'recorded Node1/OSwait required')
    require(outcome['forced_cleanup'] is False and outcome['outer_timeout'] is False and outcome['postrun_bindings_match'] is True, 'recorded cleanup/bindings failed')
    require(outcome['owned_group_before_cleanup'] == outcome['owned_group_after_cleanup'] == 'absent' and outcome['tracked_descendants_after_cleanup'] == [], 'recorded owned cleanup incomplete')
    samples = [json.loads(line) for line in data['owned-process-samples.jsonl'].splitlines()]
    identities = {(row['pid'], row['start_ticks']) for sample in samples for row in sample['observed_owned']}
    # The sample ledger ends before communicate() returns. Final absence is
    # recorded in raw-outcome, not invented from its last in-flight sample.
    require(len(identities) == outcome['tracked_identity_count'] == 13, 'recorded tracked identities differ')
    require(type(report['native_raw_exit_code']) is int and report['native_raw_exit_code'] == 0 and report['server_reaped'] is True and
            report['asset_server_exit'] == {'code': None, 'signal': 'SIGTERM'} and report['browser_errors'] == [], 'recorded APP0/producer close differs')
    raw = data['application.log']; log = raw.decode('utf-8'); offset = 0; joined = bytearray()
    chunks = [json.loads(line) for line in data['application-log-chunks.jsonl'].splitlines()]
    for packet in chunks:
        require(type(packet['start_utf16']) is int and packet['start_utf16'] == offset, 'chunk gap/order')
        encoded = packet['text'].encode('utf-16-le', 'surrogatepass'); offset += len(encoded) // 2
        require(type(packet['end_utf16']) is int and packet['end_utf16'] == offset, 'chunk length')
        joined.extend(encoded)
    require(bytes(joined).decode('utf-16-le').encode('utf-8') == raw and len(chunks) == 242, 'chunk join differs')
    transport = report['log_transport']
    require(transport['sealed'] is True and transport['partial'] is True and transport['settled_failure'] is None and
            acceptance['log']['partial'] is False, 'final rejected report/pre-evaluator receipt distinction differs')
    require(transport['raw_sha256'] == transport['joined_chunk_sha256'] == sha(raw), 'raw seal hash differs')
    proof._envelope(log, acceptance)
    require(acceptance['acquisition'] == [{key: packet[key] for key in ('start_utf16', 'end_utf16', 'acquired_monotonic_ms')} for packet in chunks], 'acquisition receipts differ')
    config = report['native_log_configuration']
    require(config['installations'] == 1 and config['barrier']['continued'] is True and config['barrier']['ack']['installed_before_runtime_capture'] is True, 'recorded main ACK missing')
    workers = config['worker_requests']
    require(len(workers) == len({row['target_id'] for row in workers}) == 8 and all(row['continued'] is True for row in workers), 'recorded worker ACK missing')
    setup = [json.loads(line) for line in data['setup-processes.jsonl'].splitlines()]
    require(setup == report['setup_children'] and len(setup) == 5, 'setup receipts differ')
    for call in setup:
        require(call['command'] == 'git' and call['spawned'] is True and type(call['pid']) is int and call['pid'] > 0 and call['wait_completed'] is True and
                type(call['status']) is int and call['status'] == 0 and call['error'] is None and
                not any(call[key] for key in ('timed_out', 'cancelled', 'unknown_wait')), 'recorded Git lifecycle differs')
    child = report['evaluator_process']
    require(child['command'] == 'python3' and child['spawned'] is True and child['wait_completed'] is True and child['status'] == 1, 'recorded evaluator wait differs')
    rows = proof.parse(log); reads = [row['data'] for row in rows if row['kind'] == 'CENSUS']
    checkpoints = [row['data'] for row in rows if row['kind'] == 'CHECKPOINT']
    require(len(checkpoints) == 2 and [row['label'] for row in checkpoints] == ['before', 'after'], 'world checkpoints differ')
    projection = None
    for checkpoint in checkpoints:
        world, ids = proof._world(checkpoint)
        require(len(world['players']) == len(world['bases']) == 7 and len(world['units']) == 9 and len(world['terrain_trace']['tiles']) == 128, 'all-owner world inventory differs')
        if projection is None: projection = ids
        else: require(sorted(ids, key=lambda r: int(r['unit_id'])) == sorted(projection, key=lambda r: int(r['unit_id'])), 'world native identities differ')
    require(len(reads) == 32, 'read inventory differs')
    packets = [proof.census.validate(row['payload'], projection) for row in reads]
    actors = [proof._row(packet, 8) for packet in packets]
    logical = [tuple(proof.census.float32(row['unit_render_coords'][axis]) for axis in 'xyz') for row in actors]
    stored = [tuple(proof.census.float32(row['instance_position'][axis]) for axis in 'xyz') for row in actors]
    for positions in (logical, stored):
        start = positions[0]; end = (start[0] + 1., start[1], start[2])
        require(collections.Counter(positions[1:30]) == {start: 2, end: 27} and all(point == end for point in positions[28:]), 'recorded sampling distribution differs')
    floats = 0
    def count(value):
        nonlocal floats
        if type(value) is dict:
            if set(value) == {'value', 'bits'}: proof.census.float32(value); floats += 1
            else:
                for item in value.values(): count(item)
        elif type(value) is list:
            for item in value: count(item)
    for packet in packets: count(packet)
    require(floats == independent['census_F32_descriptors_verified'] == 1812, 'F32 descriptor audit differs')
    try:
        proof.evaluate(log, acceptance)
    except proof.SamplingIncomplete as error:
        require(str(error) == 'no actual submitted intermediate point was sampled', 'incomplete reason differs')
    else:
        raise ValueError('retained incomplete capture was accepted')
    require(strict['complete'] is False and strict['match'] is False and strict['status'] == independent['status'].removeprefix('confirmed-') == 'incomplete-sampling', 'recorded incomplete classification differs')
    require(independent['all7_world_effect_comparator_accepted'] is False, 'unreached effect guard was promoted')
    return dict(status='offline-audit-complete', candidate_executed=False, recorded_status='incomplete-sampling',
                recorded_node_exit=1, recorded_app_exit=0, movement_passing_cases=0, full_browser_passing_cases=0,
                original_passing_cases=0, all7_effect_guard_accepted=False, raw_sha256=sha(raw), raw_bytes=len(raw),
                raw_chunks=len(chunks), census_reads=32, census_F32_descriptors_verified=floats,
                baseline_samples=2, endpoint_samples=27, intermediate_samples=0,
                recorded_source=ACTUAL_SOURCE, recorded_owned_identities_reaped=13,
                recorded_final_report_partial=True, recorded_pre_evaluator_receipt_partial=False,
                current_process_or_host_audit=False, exact_callback_identity_supported=False)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bundle', type=Path, required=True)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--source-root', type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(replay(args.bundle, args.manifest, args.source_root), indent=2, sort_keys=True))


if __name__ == '__main__':
    main()
