#!/usr/bin/env python3
import json, subprocess, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
cases=json.loads((ROOT/'reports/sudokupad-phase10b-timeout-manifest.json').read_text())['cases']
shard_size=8
shards=[cases[i:i+shard_size] for i in range(0,len(cases),shard_size)]
out=ROOT/'reports/phase10b-timeout-rerun'; out.mkdir(exist_ok=True)
def run(sn,shard):
 report=out/f'rerun-{sn:02d}.json'; md=out/f'rerun-{sn:02d}.md'; log=out/f'rerun-{sn:02d}.log'
 if report.exists():
  r=json.loads(report.read_text()); return sn,'existing',r.get('passed'),r.get('failed'),0
 cmd=['python3','scripts/run-sudokupad-browser-conformance.py','--har','/mnt/data/sudokupad.app.har','--suite','archive','--archive-sample','4051','--no-artifacts','--skip-compile','--fixture-timeout','15','--report-json',str(report.relative_to(ROOT)),'--report-md',str(md.relative_to(ROOT))]
 for c in shard: cmd += ['--archive-file-index',str(c['archiveIndex'])]
 t=time.time()
 try:
  cp=subprocess.run(cmd,cwd=ROOT,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=140)
  log.write_text(cp.stdout)
  r=json.loads(report.read_text()) if report.exists() else {}
  return sn,cp.returncode,r.get('passed'),r.get('failed'),round(time.time()-t,1)
 except subprocess.TimeoutExpired as e:
  text=e.stdout or ''; text=text.decode(errors='replace') if isinstance(text,bytes) else text; log.write_text(text+'\nORCHESTRATOR TIMEOUT\n'); return sn,'orchestrator-timeout',None,None,round(time.time()-t,1)
print(f'TIMEOUT RERUN {len(cases)} cases / {len(shards)} shards',flush=True)
with ThreadPoolExecutor(max_workers=3) as ex:
 futs={ex.submit(run,i,s):i for i,s in enumerate(shards)}
 for fut in as_completed(futs): print('SHARD',*fut.result(),flush=True)
print('TIMEOUT RERUN COMPLETE',flush=True)
