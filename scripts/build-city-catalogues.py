"""Compatibility entrypoint; use the shared, validated OSM compiler."""
import json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent/'data'))
from catalogue import ROOT,compile_snapshot,atomic_json
root=Path(sys.argv[1]);result={}
for city in ('kurgan','phuket'):
 parts=[json.loads(p.read_text()) for p in sorted((root/city/'places').glob('*.json'))]
 if not parts or any(p.get('remark') for p in parts):raise SystemExit('Missing or incomplete raw city data')
 raw={'osm3s':{'timestamp_osm_base':min(p['osm3s']['timestamp_osm_base'] for p in parts)},'elements':[e for p in parts for e in p['elements']]}
 result[city],_=compile_snapshot(raw,city,'places');print(city,len(result[city]['places']))
atomic_json(ROOT/'lib/other-city-places.json',result)
