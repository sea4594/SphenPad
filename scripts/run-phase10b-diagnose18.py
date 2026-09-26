#!/usr/bin/env python3
import json, subprocess, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
d=json.loads((ROOT/'reports/sudokupad-phase10b-heavy45-summary.json').read_text())
cases=[r for r in d['rows'] if r['kind']=='timeout']
out=ROOT/'reports/phase10b-diagnose18'; out.mkdir(exist_ok=True)
def run(i,c):
    report=out/f'case-{i:02d}.json'; md=out/f'case-{i:02d}.md'; log=out/f'case-{i:02d}.log'
    cmd=['python3','scripts/run-sudokupad-browser-conformance.py','--har','/mnt/data/sudokupad.app.har','--suite','archive','--archive-sample','4051','--no-artifacts','--skip-compile','--fixture-timeout','20','--report-json',str(report.relative_to(ROOT)),'--report-md',str(md.relative_to(ROOT)),'--archive-file-index',str(c['archiveIndex'])]
    t=time.time(); cp=subprocess.run(cmd,cwd=ROOT,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=30); log.write_text(cp.stdout)
    r=json.loads(report.read_text()) if report.exists() else {}; rr=(r.get('results') or [{}])[0]
    return {'i':i,'name':c['name'],'archiveIndex':c['archiveIndex'],'rc':cp.returncode,'passed':r.get('passed'),'failed':r.get('failed'),'result':rr,'seconds':round(time.time()-t,1)}
rows=[]
with ThreadPoolExecutor(max_workers=4) as ex:
    futs=[ex.submit(run,i,c) for i,c in enumerate(cases)]
    for fut in as_completed(futs):
        try: x=fut.result()
        except Exception as e: x={'error':repr(e)}
        rows.append(x); print(json.dumps(x),flush=True)
rows.sort(key=lambda x:x.get('i',999))
(ROOT/'reports/sudokupad-phase10b-diagnose18-summary.json').write_text(json.dumps({'rows':rows},indent=2)+'\n')
