#!/usr/bin/env python3
"""Run the existing idempotent daily task without exposing its bearer secret."""
import json
from pathlib import Path
import urllib.request

root = Path('/home/ubuntu/apps/riyasat')
env = dict(line.split('=', 1) for line in (root / 'runtime.env').read_text().splitlines() if '=' in line and not line.startswith('#'))
request = urllib.request.Request('http://127.0.0.1:3400/api/cron', headers={'Authorization': 'Bearer ' + env['CRON_SECRET']})
with urllib.request.urlopen(request, timeout=300) as response:
    result = json.load(response)
    if response.status != 200 or result.get('failures'):
        raise RuntimeError('Daily generation failed; inspect workspace failures privately.')
    print('Daily generation completed successfully.')
