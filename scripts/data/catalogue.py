"""Refresh complete city snapshots; failed or partial responses never replace live data."""
import argparse, collections, concurrent.futures, datetime, json, math, os, subprocess, tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
BOUNDS={'spb':(59.70,29.50,60.20,30.75),'kurgan':(55.35,65.18,55.55,65.48),'phuket':(7.74,98.25,8.21,98.47)}
CATEGORIES={'museum':'Музей','gallery':'Галерея','viewpoint':'Смотровая площадка','attraction':'Достопримечательность','restaurant':'Ресторан','cafe':'Кафе','fast_food':'Быстрое питание','food_court':'Фудкорт'}
FIELDS={'opening_hours':'openingHours','cuisine':'cuisine','website':'website','contact:website':'website','website:menu':'menuUrl','contact:menu':'menuUrl','wikipedia':'wikipedia','wikidata':'wikidata','image':'image','fee':'fee','charge':'charge','fee:amount':'charge','fee:price':'charge','description:ru':'description','phone':'phone','contact:phone':'phone'}
def unavailable(t):
 if t.get('access') in ('no','private') or t.get('demolished')=='yes':return True
 # An abandoned historic ruin can still be a sightseeing destination.
 operational=t.get('amenity') in ('restaurant','cafe','fast_food','food_court','place_of_worship') or t.get('tourism') in ('museum','gallery')
 return operational and any(t.get(k)=='yes' for k in ('disused','abandoned','closed'))
def compile_snapshot(raw,city,kind):
 if not isinstance(raw.get('elements'),list) or raw.get('remark') or not raw.get('osm3s',{}).get('timestamp_osm_base'):raise ValueError('Incomplete Overpass response')
 stamp=raw['osm3s']['timestamp_osm_base']; places=[];seen=set();skipped=[]
 for e in raw['elements']:
  t=e.get('tags',{});point=e.get('center',e);key=(e['type'],e['id']);name=t.get('name:ru') or (t.get('name:en') if city=='phuket' else None) or t.get('name')
  lat,lon=point.get('lat'),point.get('lon');s,w,n,east=BOUNDS[city]
  if key in seen or not name or not isinstance(lat,(float,int)) or not isinstance(lon,(float,int)) or not(s<=lat<=n and w<=lon<=east):continue
  seen.add(key)
  if unavailable(t):skipped.append({'id':f'osm-{key[0]}-{key[1]}','name':name,'reason':'unavailable'});continue
  if kind=='food':
   if t.get('amenity') not in ('restaurant','cafe','fast_food','food_court'):continue
   cat=CATEGORIES[t['amenity']]; minutes=45 if cat=='Ресторан' else 30 if cat=='Кафе' else 20;priority=8 if cat=='Ресторан' else 7
  else:
   if t.get('tourism') not in ('museum','gallery','viewpoint','attraction') and not (t.get('historic') or t.get('leisure')=='park' or t.get('natural')=='beach' or t.get('amenity')=='place_of_worship'):continue
   cat=CATEGORIES.get(t.get('tourism'),'Достопримечательность')
   if t.get('historic'):cat='Памятник' if t['historic'] in ('monument','memorial') else 'История'
   if t.get('leisure')=='park':cat='Парк'
   if t.get('natural')=='beach':cat='Пляж'
   if t.get('amenity')=='place_of_worship':cat='Храм'
   minutes=7 if cat in ('Музей','Парк','Пляж','Храм') else 5;priority=8 if cat in ('Музей','Парк','Пляж','Храм','Смотровая площадка') else 5 if t.get('wikidata') or t.get('wikipedia') else 1
  p={'id':f'osm-{key[0]}-{key[1]}','name':name,'lat':lat,'lon':lon,'category':cat,'minutes':minutes,'priority':priority,'osmUrl':f'https://www.openstreetmap.org/{key[0]}/{key[1]}','dataSource':'OpenStreetMap','dataUpdatedAt':stamp}
  for tag,field in FIELDS.items():
   if t.get(tag) and field not in p:p[field]=t[tag]
  aliases=list(dict.fromkeys(v for k,v in t.items() if k in ('name','name:en','name:ru','name:th') and v!=name))
  if aliases:p['aliases']=aliases
  places.append(p)
 return {'updatedAt':stamp,'source':'OpenStreetMap / Overpass','license':'ODbL 1.0','places':places},skipped

def query(city,kind,bounds=None):
 box=','.join(map(str,bounds or BOUNDS[city]));sels=['[amenity~"^(restaurant|cafe|fast_food|food_court)$"]'] if kind=='food' else ['[tourism~"^(museum|attraction|gallery|viewpoint)$"]','[historic]','[leisure=park]','[natural=beach]','[amenity=place_of_worship]']
 return '[out:json][timeout:45];('+''.join(f'nwr({box}){s}[~"^name(:ru|:en)?$"~"."];' for s in sels)+');out center tags;'
def fetch_snapshot(city,kind,cache,resume=False):
 dest=cache/f'{city}-{kind}.json'
 if resume and dest.exists():
  raw=json.loads(dest.read_text());compiled,skipped=compile_snapshot(raw,city,kind)
  if compiled['places']:
   print(city,kind,'reuse saved complete response',len(compiled['places']),flush=True);return city,kind,compiled,skipped
 def request(bounds):
  for endpoint in ('https://overpass-api.de/api/interpreter','https://maps.mail.ru/osm/tools/overpass/api/interpreter'):
   r=subprocess.run(['curl','-sSfL','-G','--max-time','35','-H','User-Agent: Poputi/1.0 (+https://poputi.dubrovin2ae.chatgpt.site)','--data-urlencode','data='+query(city,kind,bounds),endpoint],capture_output=True)
   try:
    if r.returncode:raise ValueError(r.stderr.decode()[:100])
    raw=json.loads(r.stdout);compile_snapshot(raw,city,kind);return raw
   except (ValueError,KeyError) as e:print(city,kind,'retry:',str(e)[:100],flush=True)
  return None
 raw=request(BOUNDS[city])
 if raw is None:
  s,w,n,e=BOUNDS[city];tiles=[(a,c,b,d) for a,b in ((s,(s+n)/2),((s+n)/2,n)) for c,d in ((w,(w+e)/2),((w+e)/2,e))];parts=[]
  for i,box in enumerate(tiles):
   part=request(box)
   if part is None:return city,kind,None,[]
   parts.append(part);print(city,kind,'tile',i+1,'of',len(tiles),flush=True)
  raw={'osm3s':{'timestamp_osm_base':min(p['osm3s']['timestamp_osm_base'] for p in parts)},'elements':[el for p in parts for el in p['elements']]}
 compiled,skipped=compile_snapshot(raw,city,kind)
 if not compiled['places']:return city,kind,None,[]
 cache.mkdir(parents=True,exist_ok=True);atomic_json(dest,raw)
 print(city,kind,len(compiled['places']),compiled['updatedAt'],flush=True);return city,kind,compiled,skipped
def atomic_json(path,data):
 path.parent.mkdir(parents=True,exist_ok=True)
 with tempfile.NamedTemporaryFile('w',dir=path.parent,delete=False,encoding='utf8') as tmp:json.dump(data,tmp,ensure_ascii=False,separators=(',',':'));temp=tmp.name
 os.replace(temp,path)
def distance(a,b):
 r=math.pi/180;return math.hypot((a['lon']-b['lon'])*r*math.cos((a['lat']+b['lat'])*r/2),(a['lat']-b['lat'])*r)*6371000

def audit():
 datasets={'spb':json.loads((ROOT/'lib/city-places.json').read_text()),**json.loads((ROOT/'lib/other-city-places.json').read_text())};food=json.loads((ROOT/'lib/food-places.json').read_text());report={}
 for city,base in datasets.items():
  rows=base['places']+food[city]['places']; groups=collections.defaultdict(list);pairs=[]
  for p in rows:groups[p['name'].casefold().strip()].append(p)
  for group in groups.values():
   for i,a in enumerate(group):
    for b in group[i+1:]:
     d=distance(a,b)
     if d<25:pairs.append({'ids':[a['id'],b['id']],'name':a['name'],'distanceMeters':round(d,1)})
  report[city]={'landmarks':len(base['places']),'food':len(food[city]['places']),'sourceDates':{'landmarks':base['updatedAt'],'food':food[city]['updatedAt']},'withHours':sum(bool(p.get('openingHours')) for p in rows),'withPhotoReference':sum(bool(p.get('photo') or p.get('image') or p.get('wikidata') or p.get('wikipedia')) for p in rows),'duplicateCandidates':pairs}
 return report

def main():
 ap=argparse.ArgumentParser();ap.add_argument('command',choices=['refresh','audit']);ap.add_argument('--resume',action='store_true');ap.add_argument('--cache',type=Path,default=ROOT/'.sites-runtime/catalogue-raw');args=ap.parse_args()
 if args.command=='audit':print(json.dumps(audit(),ensure_ascii=False,indent=2));return
 jobs=[(city,kind) for city in BOUNDS for kind in ('places','food')]
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(lambda x:fetch_snapshot(*x,args.cache,args.resume),jobs))
 if any(r[2] is None for r in results):raise SystemExit('Refresh failed; existing catalogue preserved in full.')
 old={'spb':json.loads((ROOT/'lib/city-places.json').read_text()),**json.loads((ROOT/'lib/other-city-places.json').read_text())};oldfood=json.loads((ROOT/'lib/food-places.json').read_text());places={};food={};changes={}
 for city,kind,snap,skipped in results:
  previous=old[city] if kind=='places' else oldfood[city]
  if len(snap['places'])<len(previous['places'])*.8:raise SystemExit(f'{city} {kind}: suspicious drop >20%; existing catalogue preserved.')
  if snap['updatedAt']<previous['updatedAt']:raise SystemExit('Stale source response; existing catalogue preserved.')
  (places if kind=='places' else food)[city]=snap
  before={p['id']:p for p in previous['places']};after={p['id']:p for p in snap['places']}
  changes[f'{city}-{kind}']={'before':len(before),'after':len(after),'added':len(after.keys()-before.keys()),'removed':[{'id':k,'name':before[k]['name']} for k in before.keys()-after.keys()],'excluded':skipped}
 atomic_json(ROOT/'lib/city-places.json',places['spb']);atomic_json(ROOT/'lib/other-city-places.json',{c:places[c] for c in ('kurgan','phuket')});atomic_json(ROOT/'lib/food-places.json',food)
 atomic_json(args.cache/'refresh-report.json',changes);atomic_json(ROOT/'lib/catalogue-audit.json',audit());print(json.dumps(changes,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
