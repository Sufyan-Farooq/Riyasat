#!/usr/bin/env python3
"""Receive ARM64 application images through a restricted SSH deployment key."""
import fcntl
import gzip
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import urllib.request

match = re.fullmatch(r'(mawarith|riyasat) ([a-f0-9]{40})', os.environ.get('SSH_ORIGINAL_COMMAND', ''))
if not match:
    sys.exit('Only a Mawarith or Riyasat release and commit SHA are accepted.')
site, sha = match.groups()
root = Path('/home/ubuntu/apps') / site
lock = open('/home/ubuntu/apps/.naql-release.lock', 'a')
fcntl.flock(lock, fcntl.LOCK_EX)
release = root / 'release.env'
previous = release.read_text() if release.exists() else None
image = f'{site}:{sha}'
port = 3300 if site == 'mawarith' else 3400
compose = ['docker', 'compose', '--project-directory', str(root), '--env-file', str(release), '-f', str(root / 'deploy/compose.yaml')]
with tempfile.TemporaryDirectory(prefix='release-', dir=root) as temp:
    os.chmod(temp, 0o700)
    archive = Path(temp) / 'images.tar'
    total = 0
    with gzip.GzipFile(fileobj=sys.stdin.buffer) as incoming, archive.open('wb') as output:
        while chunk := incoming.read(1024 * 1024):
            total += len(chunk)
            if total > 2 * 1024**3:
                sys.exit('Image archive exceeds deployment limit.')
            output.write(chunk)
    subprocess.run(['docker', 'load', '-i', str(archive)], check=True)
    architecture = subprocess.check_output(['docker', 'image', 'inspect', '--format', '{{.Architecture}}', image], text=True).strip()
    if architecture != 'arm64':
        sys.exit('Release architecture must be ARM64.')
    release.write_text(f'APP_IMAGE={image}\n')
    os.chmod(release, 0o600)
    try:
        subprocess.run(compose + ['up', '-d', '--wait', '--wait-timeout', '180'], check=True)
        with urllib.request.urlopen(f'http://127.0.0.1:{port}/', timeout=20) as response:
            body = response.read().decode()
            if response.status != 200 or (site == 'riyasat' and 'Riyasat is not connected yet' in body):
                raise RuntimeError('Application smoke check failed')
    except Exception:
        if previous:
            release.write_text(previous)
            subprocess.run(compose + ['up', '-d', '--wait', '--wait-timeout', '180'], check=True)
        raise
    (root / 'last-successful-release').write_text(sha + '\n')
    print(f'{site} release {sha} is healthy.')
