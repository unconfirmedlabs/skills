#!/usr/bin/env python3
"""Validate module discovery, prerequisite DAG, and generated inventory integrity."""
import json
from pathlib import Path
import re
import sys
from urllib.parse import unquote

root = Path(__file__).resolve().parents[1]
refs = root / 'references'
files = [root / 'SKILL.md', *refs.rglob('*.md')]
errors = []
graph = {}
prereqs = {}
link = re.compile(r'\[[^\]\n]*\]\(([^)\s]+)\)')
for file in files:
    content = file.read_text()
    graph[file] = []
    # Fenced snippets can contain placeholder Markdown strings.
    prose = re.sub(r'```[^\n]*\n[\s\S]*?```', '', content)
    for value in link.findall(prose):
        if re.match(r'[a-z][a-z+.-]*:', value) or value.startswith('#'):
            continue
        target = (file.parent / unquote(value.split('#')[0])).resolve()
        if not target.exists():
            errors.append(f'{file.relative_to(root)}: missing {value}')
        elif target.suffix == '.md':
            graph[file].append(target)
    if file != root / 'SKILL.md' and 'generated' not in file.parts:
        match = re.search(r'^Requires:\s*(.*?)(?=\n\s*\n|\Z)', content, re.M | re.S)
        if not match:
            errors.append(f'{file.relative_to(root)}: missing Requires declaration')
        prereqs[file] = [(file.parent / v.split('#')[0]).resolve() for v in link.findall(match[1] if match else '')]

def visit(node, active, done):
    if node in active:
        errors.append('Prerequisite cycle: ' + ' -> '.join(str(p.relative_to(root)) for p in [*active, node]))
        return
    if node in done:
        return
    for dep in prereqs.get(node, []):
        visit(dep, [*active, node], done)
    done.add(node)

completed = set()
for file in prereqs:
    visit(file, [], completed)
reachable = set()
queue = [root / 'SKILL.md']
while queue:
    file = queue.pop()
    if file in reachable:
        continue
    reachable.add(file)
    queue.extend(graph.get(file, []))
for file in files:
    if file not in reachable:
        errors.append(f'{file.relative_to(root)}: unreachable from SKILL.md')

metadata = json.loads((refs / 'generated/provenance.json').read_text())
modules = [json.loads(line) for line in (refs / 'generated/api-index.jsonl').read_text().splitlines()]
worker_package = json.loads((root / 'assets/cloudflare-worker/package.json').read_text())
if worker_package['dependencies']['effect'] != metadata['effectVersion']:
    errors.append('Cloudflare starter and coverage baseline use different Effect versions')
names = [m['module'] for m in modules]
if len(names) != len(set(names)):
    errors.append('Duplicate public module entries')
if len(modules) != metadata['modules'] or sum(len(m['symbols']) for m in modules) != metadata['exports']:
    errors.append('Provenance counts do not match inventory')
for m in modules:
    if not (refs / m['guide']).is_file():
        errors.append(f"{m['module']}: missing guide {m['guide']}")
    if '/internal/' in m['module'] or not m['symbols']:
        errors.append(f"Invalid/empty public module: {m['module']}")
    if len({s['name'] for s in m['symbols']}) != len(m['symbols']):
        errors.append(f"Duplicate exported names: {m['module']}")
    for s in m['symbols']:
        if not s.get('source', '').startswith('packages/') or not isinstance(s.get('line'), int) or s['line'] < 1:
            errors.append(f"{m['module']}.{s['name']}: invalid source location")
if len(list(root.rglob('SKILL.md'))) != 1:
    errors.append('Expected one discoverable skill entrypoint')
if errors:
    print('\n'.join(errors), file=sys.stderr)
    sys.exit(1)
print(f'Validated {len(files)} Markdown documents, prerequisite DAG and {len(modules)} public modules / {metadata["exports"]} exports.')
