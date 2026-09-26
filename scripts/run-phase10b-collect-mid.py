#!/usr/bin/env python3
import json, subprocess, time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
cases=json.loads((ROOT/'reports/sudokupad-phase10b-corpus-manifest.json').read_text())['cases']; shard_size=25
outdir=ROOT/'reports/phase10b-shards'; outdir.mkdir(exist_ok=True)
for sn in range(20,30):
    s=sn*shard_size; shard=cases[s:s+shard_size]
    report=outdir/f'collect-{sn:03d}.json'; md=outdir/f'collect-{sn:03d}.md'; log=outdir/f'collect-{sn:03d}.log'
    if report.exists(): print(f'MID {sn:03d} existing',flush=True); continue
    cmd=['python3','scripts/run-sudokupad-browser-conformance.py','--har','/mnt/data/sudokupad.app.har','--suite','archive','--archive-sample','4051','--no-artifacts','--skip-compile','--fixture-timeout','4.5','--report-json',str(report.relative_to(ROOT)),'--report-md',str(md.relative_to(ROOT))]
    for c in shard: cmd += ['--archive-file-index',str(c['archiveIndex'])]
    print(f'MID {sn:03d} start',flush=True); t=time.time()
    try:
        cp=subprocess.run(cmd,cwd=ROOT,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=150); log.write_text(cp.stdout)
        r=json.loads(report.read_text()) if report.exists() else {}; print(f'MID {sn:03d} end rc={cp.returncode} passed={r.get("passed")} {time.time()-t:.1f}s',flush=True)
    except subprocess.TimeoutExpired as e:
        text=e.stdout or ''; text=text.decode(errors='replace') if isinstance(text,bytes) else text; log.write_text(text+'\nORCHESTRATOR TIMEOUT\n'); print(f'MID {sn:03d} timeout',flush=True)
print('MID COMPLETE',flush=True)
