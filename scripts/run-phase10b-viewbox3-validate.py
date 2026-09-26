#!/usr/bin/env python3
import subprocess,json,time
from concurrent.futures import ThreadPoolExecutor,as_completed
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
cases=[(1319,'iutvqv1ht8'),(1582,'ntqufgkvcx'),(1809,'rpdtjt36r7')]
out=ROOT/'reports/phase10b-viewbox3-fixed'; out.mkdir(exist_ok=True)
def run(idx,name):
 r=out/f'{name}.json'; m=out/f'{name}.md'; l=out/f'{name}.log'; t=time.time()
 cmd=['python3','scripts/run-sudokupad-browser-conformance.py','--har','/mnt/data/sudokupad.app.har','--suite','archive','--archive-sample','4051','--no-artifacts','--skip-compile','--fixture-timeout','45','--report-json',str(r.relative_to(ROOT)),'--report-md',str(m.relative_to(ROOT)),'--archive-file-index',str(idx)]
 cp=subprocess.run(cmd,cwd=ROOT,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=60); l.write_text(cp.stdout)
 d=json.loads(r.read_text()) if r.exists() else {}; return {'idx':idx,'name':name,'rc':cp.returncode,'passed':d.get('passed'),'failed':d.get('failed'),'result':(d.get('results') or [{}])[0],'seconds':round(time.time()-t,1)}
rows=[]
with ThreadPoolExecutor(max_workers=3) as ex:
 for f in as_completed([ex.submit(run,*c) for c in cases]):
  try:x=f.result()
  except Exception as e:x={'error':repr(e)}
  rows.append(x); print(json.dumps(x),flush=True)
(ROOT/'reports/sudokupad-phase10b-viewbox3-fixed.json').write_text(json.dumps({'rows':rows},indent=2)+'\n')
