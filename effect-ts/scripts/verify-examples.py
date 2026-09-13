#!/usr/bin/env python3
"""Compile and exercise copied starters in an isolated temporary workspace."""
import argparse
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import time
import urllib.error
import urllib.request
import subprocess
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--cloudflare', action='store_true', help='Also install and check workerd starter (no deploy)')
args = parser.parse_args()
skill = Path(__file__).resolve().parents[1]
version = json.loads((skill / 'references/generated/provenance.json').read_text())['effectVersion']

def run(argv, cwd, capture=False, timeout=180):
    return subprocess.run(argv, cwd=cwd, check=True, text=True, capture_output=capture, timeout=timeout)

with tempfile.TemporaryDirectory(prefix='effect-skill-check-') as directory:
    root = Path(directory)
    shutil.copytree(skill / 'assets/templates', root / 'templates')
    shutil.copytree(skill / 'scripts/fixtures', root / 'test')
    (root / 'package.json').write_text(json.dumps({
        'name': 'effect-skill-check', 'private': True, 'type': 'module',
        'dependencies': {'effect': version, '@effect/platform-bun': version, '@effect/platform-node': version},
        'devDependencies': {'typescript': '5.9.3', '@types/bun': '1.4.2', '@types/node': '22.20.2'}
    }))
    compiler = {'strict': True, 'target': 'ES2022', 'module': 'NodeNext', 'moduleResolution': 'NodeNext',
                'noEmit': True, 'skipLibCheck': True, 'exactOptionalPropertyTypes': True, 'types': ['bun', 'node']}
    (root / 'tsconfig.json').write_text(json.dumps({'compilerOptions': compiler, 'include': ['templates/**/*.ts', 'test/**/*.ts']}))
    run(['bun', 'install'], root)
    tsc = str(root / 'node_modules/.bin/tsc')
    run([tsc, '--noEmit'], root)
    run(['bun', 'test', 'test'], root)
    success = run(['bun', 'templates/cli.ts', 'list', '--json'], root, True)
    assert json.loads(success.stdout) == [{'title': 'Ship', 'status': 'open'}], success.stdout
    invalid = subprocess.run(['bun', 'templates/cli.ts', 'list', '--status', 'invalid'], cwd=root, text=True, capture_output=True, timeout=30)
    assert invalid.returncode != 0, invalid
    assert invalid.stdout == '', invalid.stdout
    (root / 'input.json').write_text('[{"id":1,"title":"check","done":false}]')
    run(['bun', 'templates/script.ts', 'input.json'], root, True)
    failed_script = subprocess.run(['bun', 'templates/script.ts'], cwd=root, text=True, capture_output=True, timeout=30)
    assert failed_script.returncode != 0
    run(['bun', 'templates/state-machine.ts'], root, True)
    # Emit then execute Node ESM instead of relying on Bun's source resolver.
    emitted = dict(compiler, noEmit=False, outDir='dist', rootDir='templates')
    (root / 'tsconfig.node.json').write_text(json.dumps({'compilerOptions': emitted,
        'include': ['templates/node-script.ts', 'templates/library.ts', 'templates/host-bridge.ts']}))
    run([tsc, '-p', 'tsconfig.node.json'], root)
    files = json.loads(run(['node', 'dist/node-script.js'], root, True).stdout)
    assert 'package.json' in files
    # Use the generated portable library/bridge under Node as well.
    run(['node', '--input-type=module', '-e',
        "import { User } from './dist/library.js'; import { makeClient } from './dist/host-bridge.js'; "
        "const c=makeClient([new User({id:'1',name:'Ada'})]); "
        "try { if((await c.getUser('1')).name!=='Ada') throw Error('value'); } finally { await c.dispose(); }"], root)
    # Exercise the real API adapter and validate HTTP/Schema behavior.
    with socket.socket() as reservation:
        reservation.bind(('127.0.0.1', 0))
        port = reservation.getsockname()[1]
    server = subprocess.Popen(['bun', 'templates/api.ts'], cwd=root,
        env=dict(os.environ, PORT=str(port)), stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        origin = f'http://127.0.0.1:{port}'
        deadline = time.monotonic() + 15
        while True:
            try:
                with urllib.request.urlopen(origin + '/health', timeout=1) as response:
                    assert response.status == 204
                break
            except (OSError, urllib.error.URLError):
                if server.poll() is not None or time.monotonic() >= deadline:
                    raise AssertionError('API starter did not become healthy')
                time.sleep(0.05)
        payload = urllib.request.Request(origin + '/todos/', data=b'{"title":"checked"}', headers={'Content-Type':'application/json'})
        with urllib.request.urlopen(payload, timeout=3) as response:
            todo = json.load(response)
        with urllib.request.urlopen(origin + f'/todos/{todo["id"]}', timeout=3) as response:
            assert json.load(response) == todo
        for suffix in ['/todos/99999', '/todos/not-a-number']:
            try:
                urllib.request.urlopen(origin + suffix, timeout=3)
                raise AssertionError('Expected typed HTTP failure')
            except urllib.error.HTTPError as error:
                assert error.code == (404 if suffix.endswith('99999') else 400)
                error.close()
    finally:
        if server.poll() is None:
            server.send_signal(signal.SIGINT)
        try:
            server.communicate(timeout=10)
        except subprocess.TimeoutExpired:
            server.kill()
            server.communicate()
            raise AssertionError('API starter failed to shut down')
    assert server.returncode in (0, 130), server.returncode
    # Process worker's root owns all loops and exits under the platform signal handler.
    worker_process = subprocess.Popen(['bun', 'templates/worker.ts'], cwd=root,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        try:
            worker_process.communicate(timeout=1)
            raise AssertionError('Queue worker exited before interruption')
        except subprocess.TimeoutExpired:
            worker_process.send_signal(signal.SIGINT)
        output, diagnostics = worker_process.communicate(timeout=10)
        assert worker_process.returncode in (0, 130), (worker_process.returncode, diagnostics)
        assert 'processing' in output + diagnostics
    finally:
        if worker_process.poll() is None:
            worker_process.kill()
            worker_process.communicate()
    print('Verified: 8 starters typecheck; semantic tests; CLI/script edges; state machine; Node ESM/bridge; API contracts and process shutdown.', flush=True)
    if args.cloudflare:
        worker = root / 'cloudflare'
        shutil.copytree(skill / 'assets/cloudflare-worker', worker)
        run(['bun', 'install'], worker)
        run(['bun', 'run', 'check'], worker)
        print('Verified: Cloudflare binding types, source/tests typecheck, workerd tests, minified dry run. No deployment.', flush=True)
