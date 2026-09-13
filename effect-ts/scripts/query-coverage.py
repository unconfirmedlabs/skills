#!/usr/bin/env python3
"""Search the generated module/export index without loading it into agent context."""
import argparse
import json
from pathlib import Path
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('query', nargs='?', default='', help='Case-insensitive words; all must match')
p.add_argument('--module', help='Exact public module path, e.g. effect/Effect')
p.add_argument('--symbol', help='Exact exported name, e.g. acquireRelease')
p.add_argument('--limit', type=int, default=20)
a = p.parse_args()
if a.limit < 1:
    p.error('--limit must be positive')
base = Path(__file__).resolve().parents[1] / 'references/generated'
meta = json.loads((base / 'provenance.json').read_text())
terms = a.query.lower().split()
results = []
for line in (base / 'api-index.jsonl').open():
    m = json.loads(line)
    if a.module and m['module'] != a.module:
        continue
    for s in m['symbols']:
        if a.symbol and s['name'] != a.symbol:
            continue
        haystack = ' '.join(str(v) for v in [m['module'], m['summary'], s['name'], s['category'], s.get('summary', ''), s.get('when', '')]).lower()
        if all(t in haystack for t in terms):
            results.append({'module': m['module'], 'guide': m['guide'], **s,
                'url': f"{meta['repository']}/blob/{meta['commit']}/{s.get('source', m['source'])}#L{s.get('line', 1)}"})
print(json.dumps({'baseline': meta['effectVersion'], 'matches': len(results), 'results': results[:a.limit]}, indent=2))
