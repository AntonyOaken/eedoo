"""One locked, validated import from saved observations; no background browser scraping."""
import argparse, datetime, fcntl, json, pathlib, subprocess, sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--discoveries',required=True);p.add_argument('--observations',required=True);p.add_argument('--baseline',required=True);p.add_argument('--publish',action='store_true');a=p.parse_args()
work=ROOT/'work';work.mkdir(exist_ok=True)
def event(status,**fields):
 row={'time':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':status,**fields}
 with (work/'import-journal.jsonl').open('a') as out:out.write(json.dumps(row)+'\n')
 print(json.dumps(row),flush=True)
with (work/'import.lock').open('a') as lock:
 try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 except BlockingIOError:sys.exit('Another import is running')
 for value in [a.discoveries,a.observations,a.baseline]:
  path=pathlib.Path(value).resolve()
  if not path.is_file():sys.exit('Missing saved input: '+str(path))
 event('started')
 try:
  subprocess.run([sys.executable,'scripts/import-spb-2gis.py','--discoveries',a.discoveries,'--observations',a.observations,'--baseline',a.baseline,'--date',datetime.datetime.now(datetime.timezone.utc).date().isoformat()],cwd=ROOT,check=True)
  subprocess.run([sys.executable,'-m','unittest','discover','-s','tests','-p','*_import_test.py'],cwd=ROOT,check=True)
  subprocess.run(['pnpm','catalog:export'],cwd=ROOT,check=True)
  if a.publish:subprocess.run(['pnpm','catalog:import','work/catalog.json'],cwd=ROOT,check=True)
  event('published' if a.publish else 'validated',snapshot='work/catalog.json')
 except subprocess.CalledProcessError as e:event('failed',exit_code=e.returncode);raise
