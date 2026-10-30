#!/usr/bin/env python3
"""Replay external handoff CSV/ZIP data through the native policy v2 harness.

Run under Linux/WSL. Inputs are never copied into tracked fixture directories.
Requires a compiled tests/replay_policy_v2.c executable (--replay).
"""
import argparse
import csv
import io
import json
import pathlib
import sqlite3
import subprocess
import tempfile
import zipfile


def replay(executable, trace, folder):
    folder.mkdir()
    result = subprocess.run([str(executable), str(folder), str(trace)], capture_output=True, text=True, check=True)
    return json.loads(result.stdout), sqlite3.connect(folder / 'local/production.sqlite')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--handoff', required=True, type=pathlib.Path)
    parser.add_argument('--replay', required=True, type=pathlib.Path)
    parser.add_argument('--output', required=True, type=pathlib.Path)
    parser.add_argument('--full', action='store_true')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    executable = args.replay.resolve()
    cases = json.loads((args.handoff / 'analysis/replay_cases.json').read_text())
    report = {'policy': 2, 'candidateWindowMs': 30000, 'cases': [], 'archives': []}
    with tempfile.TemporaryDirectory(prefix='guris-policy-v2-') as temporary:
        base = pathlib.Path(temporary)
        for case in cases:
            result, db = replay(executable, args.handoff / 'replay-fixtures' / (case['name'] + '.csv'), base / case['name'])
            if 'candidate' not in case:
                result.update(name=case['name'], passed=True, interpretation='managed_cleaning_trace_only_not_timer_execution')
                assert result['rows'] == case['rows']
                report['cases'].append(result)
                db.close()
                print('PASS', case['name'], flush=True)
                continue
            expected = case['candidate']
            episodes = db.execute('SELECT start,end,phase,confidence,reason,candidate_start,confirmed_start FROM material_episodes WHERE start<=? AND end>=? AND reason=?', (expected['short_start'], expected['following_start'], expected['precedingInferredReason'])).fetchall()
            assert episodes, ('material chain was lost', case['name'])
            assert all(not row[6] or row[6] > expected['short_end'] for row in episodes), ('short trial closed the episode', case['name'])
            if expected['unclassifiedStopMs'] > 30 * 60000:
                assert all(row[3] == 'uncertain' for row in episodes), 'long pause falsely confident'
            result.update(name=case['name'], passed=True, matchingEpisodes=episodes)
            report['cases'].append(result)
            db.close()
            print('PASS', case['name'], flush=True)
        if args.full:
            seen = set()
            for number, archive in enumerate(sorted((args.handoff / 'diagnostics').glob('*.zip'))):
                trace = base / ('trace-' + str(number) + '.csv')
                good = overlaps = 0
                with zipfile.ZipFile(archive) as z, z.open('trace.csv') as source, trace.open('w', newline='') as target:
                    manifest = json.loads(z.read('manifest.json'))
                    rows = csv.DictReader(io.TextIOWrapper(source), delimiter=';')
                    writer = csv.DictWriter(target, fieldnames=rows.fieldnames, delimiter=';')
                    writer.writeheader()
                    for row in rows:
                        at = int(row['at'])
                        if not manifest['requestedFromUtcMs'] <= at <= manifest['requestedToUtcMs']:
                            continue
                        identity = row['session'], row['seq']
                        if identity in seen:
                            overlaps += 1
                            continue
                        seen.add(identity)
                        good += row['good'] == '1'
                        writer.writerow(row)
                result, db = replay(executable, trace, base / ('full-' + str(number)))
                result.update(name=archive.name, validPeriodRows=good, duplicateRowsExcluded=overlaps)
                report['archives'].append(result)
                # Keep only aggregate restart evidence; original signals remain external.
                assert db.execute("SELECT count(*) FROM events WHERE kind='reason.v2.phase' AND json_extract(payload,'$.decision')='restart_confirmed_30s_counter_growth' AND json_extract(payload,'$.observedMono')-json_extract(payload,'$.candidateMono')<30000").fetchone()[0] == 0
                result['restartChecks'] = db.execute("SELECT count(*),min(json_extract(payload,'$.candidateStart')) FROM events WHERE kind='reason.v2.phase' AND json_extract(payload,'$.decision')='restart_confirmed_30s_counter_growth'").fetchone()
                db.close()
                print('PASS full trace', number + 1, flush=True)
            report['unionValidRows'] = sum(a['validPeriodRows'] for a in report['archives'])
            report['unionPositiveProducts'] = sum(a['positiveProducts'] for a in report['archives'])
            report['unionCounterResets'] = sum(a['counterResets'] for a in report['archives'])
            assert report['unionValidRows'] == 1325933
            assert report['unionPositiveProducts'] == 225050
            assert report['unionCounterResets'] == 2
    (args.output / 'replay-results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()
