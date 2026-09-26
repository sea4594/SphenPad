#!/usr/bin/env python3
import json, subprocess, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
cases=json.loads((ROOT/'reports/sudokupad-phase10b-heavy45-manifest.json').read_text())['cases']
out=ROOT/'reports/phase10b-heavy45'; out.mkdir(exist_ok=True)
def run(i,c):
 report=out/f'case-{i:02d}.json'; md=out/f'case-{i:02d}.md'; log=out/f'case-{i:02d}.log'
 if report.exists():
  r=json.loads(report.read_text()); return i,c['name'],'existing',r.get('passed'),r.get('failed'),0
 cmd=['python3','scripts/run-sudokupad-browser-conformance.py','--har','/mnt/data/sudokupad.app.har','--suite','archive','--archive-sample','4051','--no-artifacts','--skip-compile','--fixture-timeout','45','--report-json',str(report.relative_to(ROOT)),'--report-md',str(md.relative_to(ROOT)),'--archive-file-index',str(c['archiveIndex'])]
 t=time.time()
 try:
  cp=subprocess.run(cmd,cwd=ROOT,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=60)
  log.write_text(cp.stdout)
  r=json.loads(report.read_text()) if report.exists() else {}
  return i,c['name'],cp.returncode,r.get('passed'),r.get('failed'),round(time.time()-t,1)
 except subprocess.TimeoutExpired as e:
  text=e.stdout or ''; text=text.decode(errors='replace') if isinstance(text,bytes) else text; log.write_text(text+'\nORCHESTRATOR TIMEOUT\n'); return i,c['name'],'orchestrator-timeout',None,None,round(time.time()-t,1)
print(f'HEAVY45 {len(cases)} cases',flush=True)
with ThreadPoolExecutor(max_workers=4) as ex:
 futs={ex.submit(run,i,c):i for i,c in enumerate(cases)}
 for fut in as_completed(futs): print('CASE',*fut.result(),flush=True)
print('HEAVY45 COMPLETE',flush=True)
