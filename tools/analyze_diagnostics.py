#!/usr/bin/env python3
"""Read a Guris diagnostic ZIP without extracting or modifying machine data.

Usage: python analyze_diagnostics.py GurisSCADA_Diagnostics_24h_....zip
Only Python's standard library is required. Output is a JSON summary on stdout.
"""
import argparse
import collections
import csv
import datetime
import io
import json
import zipfile


def utc(value):
    return datetime.datetime.fromtimestamp(int(value) / 1000, datetime.timezone.utc).isoformat()


def csv_rows(archive, name):
    with archive.open(name) as stream:
        yield from csv.DictReader(io.TextIOWrapper(stream, encoding='utf-8-sig'), delimiter=';')


def summarize(path):
    with zipfile.ZipFile(path) as archive:
        bad = archive.testzip()
        if bad:
            raise ValueError('CRC error in ' + bad)
        manifest = json.loads(archive.read('manifest.json'))
        if manifest.get('schemaVersion') != 1:
            raise ValueError('Unsupported diagnostic package schema')
        counts = collections.Counter()
        first = last = previous = None
        gaps, clock_changes, counter_resets = [], [], []
        counter_increases = 0
        for row in csv_rows(archive, 'trace.csv'):
            counts['samples'] += 1
            at, mono = int(row['at']), int(row['mono'])
            first = at if first is None else min(first, at)
            last = at if last is None else max(last, at)
            for flag in ['good', 'total_good', 'alarms_good']:
                if row[flag] != '1':
                    counts['bad_' + flag] += 1
            if int(row['quality_mask']) & 512:
                counts['alarm_list_truncated'] += 1
            if previous and previous['session'] == row['session']:
                md, wd = mono - int(previous['mono']), at - int(previous['at'])
                if md > 2000 and len(gaps) < 100:
                    gaps.append({'at': utc(at), 'milliseconds': md})
                if abs(wd - md) > 2000 and len(clock_changes) < 100:
                    clock_changes.append({'at': utc(at), 'wallDeltaMs': wd, 'monoDeltaMs': md})
                if (row['total_good'] == previous['total_good'] == '1'
                        and row['epoch'] == previous['epoch'] and row['plc'] == previous['plc']
                        and 0 <= md <= 2000):
                    delta = int(row['total']) - int(previous['total'])
                    if delta >= 0:
                        counter_increases += delta
                    elif len(counter_resets) < 100:
                        counter_resets.append({'at': utc(at), 'before': int(previous['total']),
                                               'after': int(row['total'])})
            previous = row
        events = collections.Counter()
        outcomes = collections.Counter()
        with archive.open('events.jsonl') as stream:
            for line in stream:
                event = json.loads(line)
                events[event['kind']] += 1
                if event['kind'] == 'transaction.finished':
                    outcomes[event['payload']['status']] += 1
        sessions = list(csv_rows(archive, 'sessions.csv'))
        snapshot = json.loads(archive.read('snapshot.json'))
        current_session = snapshot['sessionId']
        unclean = [s['id'] for s in sessions if not s['ended'] and s['id'] != current_session]
        intervals = list(csv_rows(archive, 'production_intervals.csv'))
        candidates = []
        for i in range(1, len(intervals) - 1):
            work, preceding = intervals[i], intervals[i - 1]
            if (work['state'] != 'work' or not 0 < int(work['durationMs']) <= 30000
                    or preceding['reasonCode'] not in ('roll_change', 'liner_change')):
                continue
            following, j = [], i + 1
            while j < len(intervals) and intervals[j]['state'] in ('stop', 'manual'):
                item = intervals[j]
                if item['plc'] != work['plc'] or int(item['startUtcMs']) - int(intervals[j - 1]['endUtcMs']) > 2000:
                    break
                following.append(item)
                j += 1
            unclassified = sum(int(item['durationMs']) for item in following if not item['reasonCode'])
            if unclassified:
                candidates.append({'beforeIntervalId': int(preceding['id']),
                                   'shortWorkIntervalId': int(work['id']),
                                   'shortWorkMs': int(work['durationMs']),
                                   'followingIntervals': [int(x['id']) for x in following],
                                   'unclassifiedStopMs': unclassified,
                                   'precedingInferredReason': preceding['reasonCode'],
                                   'interpretation': 'candidate_for_review_not_confirmed_replacement'})
        return {
            'schemaVersion': 1, 'appVersion': manifest['appVersion'],
            'sourceBuild': manifest['sourceBuild'], 'machineId': manifest['machineId'],
            'requestedHours': manifest['requestedHours'], 'zipCrcValid': True,
            'availableFirstUtc': utc(first) if first is not None else None,
            'availableLastUtc': utc(last) if last is not None else None,
            'startedBeforeRequestedPeriod': manifest['recordingStartedBeforeRequestedPeriod'],
            'observationCounts': dict(counts), 'eventCounts': dict(events),
            'transactionOutcomes': dict(outcomes),
            'recorderAtExport': snapshot['recorder'],
            'persistedDropsAllSessions': manifest['persistedDropsAllSessions'],
            'sessions': len(sessions), 'previousSessionsWithoutCleanEnd': unclean,
            'observationGapsOver2sFirst100': gaps,
            'wallClockChangesOver2sFirst100': clock_changes,
            'observedPositiveCounterDelta': counter_increases,
            'counterResetsFirst100': counter_resets,
            'shortRestartCandidates': candidates,
            'limitations': [
                'Counter delta is only a sum across adjacent good observations in the same connection epoch.',
                'Observed PLC changes do not identify a physical button or operator.',
                'Material reasons and short-restart candidates are inferences, not confirmed replacements.',
                'The current session normally has no ended timestamp while SCADA is running.',
                'The requested time range may contain gaps, missing history or a baseline before its beginning.',
            ],
        }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive')
    args = parser.parse_args()
    try:
        result = summarize(args.archive)
    except (OSError, ValueError, KeyError, zipfile.BadZipFile) as error:
        parser.exit(1, str(error) + '\n')
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
