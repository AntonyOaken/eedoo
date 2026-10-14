"""Serve OSM graphs once as versioned JSON assets, separately from app code."""
from pathlib import Path
import re,json
for city,name in [('spb','walking-graph-data'),('kurgan','kurgan-graph-data'),('phuket','phuket-graph-data')]:
 path=Path('lib/'+name+'.ts')
 if not path.exists():continue
 data={key:json.loads(value) for key,value in re.findall(r'export const (\w+)=(.*);',path.read_text())}
 out=json.dumps(data,separators=(',',':'))
 Path(f'public/vendor/walking-graphs/{city}-20261005.json').write_text(out)
 print(city,len(out))
