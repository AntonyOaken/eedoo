"""Read-only Overture pilot. Produces review candidates, never edits the live catalogue.
Requires duckdb; install httpfs once. Bounds are fixed, small central pilot areas.
"""
import argparse,datetime,json,re,urllib.request,urllib.parse,xml.etree.ElementTree as ET
from difflib import SequenceMatcher
from pathlib import Path
from catalogue import ROOT,distance,atomic_json
SAMPLES={'spb':(59.925,30.295,59.946,30.340),'kurgan':(55.431,65.327,55.451,65.362),'phuket':(7.875,98.378,7.895,98.405)}
def list_files(release):
 prefix=f'{release}/theme=places/type=place/';files=[];marker=''
 while True:
  params={'restype':'container','comp':'list','prefix':prefix}
  if marker:params['marker']=marker
  root=ET.fromstring(urllib.request.urlopen('https://overturemapswestus2.blob.core.windows.net/release?'+urllib.parse.urlencode(params),timeout=30).read())
  files.extend(el.text for el in root.findall('.//Blob/Url'));marker=root.findtext('NextMarker')
  if not marker:return files
def norm(name):return re.sub(r'[^\w]','',name.casefold())
RELEVANT={'restaurant','cafe','coffee_shop','casual_eatery','fast_food_restaurant','food_court','museum','art_gallery','historic_site','monument','park','beach','tourist_attraction','place_of_worship','temple','church','mosque','viewpoint','garden'}
def compare(features):
 base={'spb':json.loads((ROOT/'lib/city-places.json').read_text()),**json.loads((ROOT/'lib/other-city-places.json').read_text())};food=json.loads((ROOT/'lib/food-places.json').read_text());report={}
 for city,(s,w,n,e) in SAMPLES.items():
  osm=[p for p in base[city]['places']+food[city]['places'] if s<=p['lat']<=n and w<=p['lon']<=e];allrows=[p for p in features if s<=p['lat']<=n and w<=p['lon']<=e];rows=[p for p in allrows if p.get('basic_category') in RELEVANT];matches=[];candidates=[]
  for p in rows:
   nearby=[(distance(p,q),q) for q in osm if abs(p['lat']-q['lat'])<.0015 and abs(p['lon']-q['lon'])<.003]
   scored=[(SequenceMatcher(None,norm(p['name']),norm(q['name'])).ratio(),d,q) for d,q in nearby if d<120];scored.sort(key=lambda x:(-x[0],x[1]));best=scored[0] if scored else None
   if best and best[0]>=.8:matches.append({'overtureId':p['id'],'osmId':best[2]['id'],'name':p['name'],'distanceMeters':round(best[1],1),'nameSimilarity':round(best[0],2),'operatingStatus':p.get('operating_status'),'sources':p.get('sources'),'basicCategory':p.get('basic_category'),'overture':p})
   else:candidates.append(p)
  report[city]={'bounds':[s,w,n,e],'osmCount':len(osm),'overtureCount':len(rows),'allOvertureCategoriesCount':len(allrows),'probableMatches':matches,'unmatchedCandidates':candidates,'note':'Different categories and name languages; unmatched does not mean missing or newly opened. All candidates require review.'}
 return report

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--release',required=True);ap.add_argument('--output',type=Path,required=True);args=ap.parse_args()
 if not re.fullmatch(r'\d{4}-\d{2}-\d{2}\.\d+',args.release):raise SystemExit('Invalid release identifier')
 import duckdb
 c=duckdb.connect();c.execute('LOAD httpfs; SET threads=4; SET http_timeout=30; SET http_retries=1;')
 files=list_files(args.release);print('Reading',len(files),'files using spatial filter',flush=True)
 features=[]
 for city,(s,w,n,e) in SAMPLES.items():
  print('Querying pilot',city,flush=True)
  sql=f'SELECT id,names."primary" AS name,bbox.xmin AS lon,bbox.ymin AS lat,basic_category,confidence,operating_status,sources,websites FROM read_parquet(?) WHERE bbox.xmin BETWEEN {w} AND {e} AND bbox.ymin BETWEEN {s} AND {n}'
  result=c.execute(sql,[files]);columns=[x[0] for x in result.description];rows=[dict(zip(columns,row)) for row in result.fetchall()];features.extend(rows);print(city,len(rows),'records',flush=True)
 report={'release':args.release,'comparedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'automaticImport':False,'cities':compare(features)};atomic_json(args.output,report)
 for city,r in report['cities'].items():print(city,'OSM',r['osmCount'],'Overture',r['overtureCount'],'matches',len(r['probableMatches']),'review',len(r['unmatchedCandidates']),flush=True)
if __name__=='__main__':main()
