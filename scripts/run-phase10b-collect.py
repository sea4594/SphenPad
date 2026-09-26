#!/usr/bin/env python3
import json, subprocess, time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
manifest=json.loads((ROOT/'reports/sudokupad-phase10b-corpus-manifest.json').read_text())
cases=manifest['cases']; shard_size=25
outdir=ROOT/'reports/phase10b-shards'; outdir.mkdir(exist_ok=True)
summary=[]
for s in range(0,len(cases),shard_size):
    shard=cases[s:s+shard_size]; sn=s//shard_size
    report=outdir/f'collect-{sn:03d}.json'; md=outdir/f'collect-{sn:03d}.md'; log=outdir/f'collect-{sn:03d}.log'
    if report.exists():
        try:
            r=json.loads(report.read_text()); summary.append({'shard':sn,'status':'existing','report':str(report.relative_to(ROOT)),'passed':r.get('passed'),'total':r.get('total')}); print(f'SHARD {sn:03d} existing {r.get("passed")}/{r.get("total")}',flush=True); continue
        except Exception: pass
    cmd=['python3','scripts/run-sudokupad-browser-conformance.py','--har','/mnt/data/sudokupad.app.har','--suite','archive','--archive-sample','4051','--no-artifacts','--skip-compile','--fixture-timeout','4.5','--report-json',str(report.relative_to(ROOT)),'--report-md',str(md.relative_to(ROOT))]
    for c in shard: cmd += ['--archive-file-index',str(c['archiveIndex'])]
    print(f'SHARD {sn:03d} start cases {s}-{s+len(shard)-1}',flush=True); t=time.time()
    try:
        cp=subprocess.run(cmd,cwd=ROOT,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=150)
        log.write_text(cp.stdout)
        if report.exists():
            r=json.loads(report.read_text()); passed=r.get('passed'); total=r.get('total')
        else: passed=total=None
        summary.append({'shard':sn,'status':'done' if cp.returncode==0 else 'nonzero','returncode':cp.returncode,'seconds':round(time.time()-t,2),'report':str(report.relative_to(ROOT)),'passed':passed,'total':total})
        print(f'SHARD {sn:03d} end rc={cp.returncode} {passed}/{total} {time.time()-t:.1f}s',flush=True)
    except subprocess.TimeoutExpired as e:
        text=e.stdout or ''
        if isinstance(text,bytes): text=text.decode(errors='replace')
        log.write_text(text+'\nORCHESTRATOR TIMEOUT\n')
        summary.append({'shard':sn,'status':'orchestrator-timeout','seconds':round(time.time()-t,2),'report':str(report.relative_to(ROOT))})
        print(f'SHARD {sn:03d} ORCHESTRATOR TIMEOUT',flush=True)
    (ROOT/'reports/phase10b-collection-progress.json').write_text(json.dumps({'completedShards':len(summary),'totalShards':(len(cases)+shard_size-1)//shard_size,'shards':summary},indent=2)+'\n')
print('COLLECTION ORCHESTRATION COMPLETE',flush=True)
