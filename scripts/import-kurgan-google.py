"""Import reviewed, visible Google Maps card observations; performs no network requests."""
import argparse,json,math,re
from pathlib import Path
from urllib.parse import unquote

ROOT=Path(__file__).resolve().parents[1]
DAYS=dict(zip(['понедельник','вторник','среда','четверг','пятница','суббота','воскресенье'],['Mo','Tu','We','Th','Fr','Sa','Su']))
SKIP={'osm-way-81813758','osm-way-181743615','osm-way-235459433','osm-way-73485251','osm-node-1305971742'}
SKIP_NEW={'google-0x9d209e7d3b9aeb','google-0x31e95d91a3fc87da'}
def distance(p,lat,lon):
 return math.hypot(lat-p['lat'],(lon-p['lon'])*math.cos(math.radians((lat+p['lat'])/2)))*111195
def facts(observation,date):
 url=observation['url'];state=observation['state'];m=re.search(r'/maps/place/([^/]+)',url);coords=re.search(r'!3d([\d.-]+)!4d([\d.-]+)',url)
 if not m or not coords:return None
 name=unquote(m[1]).replace('+',' ')
 # The URL and visible card heading must agree: never import an old card during a SPA transition.
 headings=re.findall(r'heading (.*?), Value: 1',state)
 if not headings or name!=headings[-1]:return None
 state=state[state.index('heading '+name+', Value: 1'):]
 lat,lon=map(float,coords.groups())
 if not (55.35<=lat<=55.55 and 65.18<=lon<=65.48):return None
 f={'name':name,'lat':lat,'lon':lon,'googleMapsUrl':url,'googleCheckedAt':date}
 address=re.search(r'button Адрес: ([^\n]+)',state)
 if address:f['address']=address[1].strip()
 phone=re.search(r'button Телефон: ([^\n]+)',state)
 if phone:f['phone']=phone[1].strip()
 website=re.search(r'link Description: Сайт: .*? , Value: ([^\n]+)',state)
 if website:f['website']='https://'+website[1].strip()
 score=re.search(r'image ([\d,]+)-звездочные',state)
 if score:f['googleRating']=float(score[1].replace(',','.'))
 reviews=re.search(r'container ([\d\s\u00a0]+)\s*отзыв',state)
 if reviews:f['googleReviewCount']=int(re.sub(r'\s','',reviews[1]))
 if 'text Закрыто навсегда' in state:f['businessStatus']='permanently_closed'
 elif 'text Временно закрыто' in state:f['businessStatus']='temporarily_closed'
 weekly={}
 for day,intervals in re.findall(r'button (понедельник|вторник|среда|четверг|пятница|суббота|воскресенье),(.*?), Скопировать часы работы',state):
  weekly[day]=intervals.strip()
 if len(weekly)==7:
  if all(v=='24 часа в сутки' for v in weekly.values()):f['openingHours']='24/7'
  else:f['openingHours']='; '.join(DAYS[d]+' '+('off' if weekly[d]=='Закрыто' else '00:00-24:00' if weekly[d]=='24 часа в сутки' else weekly[d].replace('–','-')) for d in DAYS)
 elif re.search(r'button (?:\(collapsed\) Часы работы )?Круглосуточно',state):f['openingHours']='24/7'
 if 'openingHours' in f:f['hoursSource']=url
 category=re.search(r'button Подробнее о раскрытии[^\n]*\n\s*\d+ button ([^\n]+)',state)
 f['googleCategory']=category[1].strip() if category else ''
 return f
def main():
 parser=argparse.ArgumentParser();parser.add_argument('observations');parser.add_argument('--date',required=True);args=parser.parse_args()
 originals=json.loads((ROOT/'lib/other-city-places.json').read_text())['kurgan']['places'];originals={p['id']:p for p in originals}
 observations=json.loads(Path(args.observations).read_text());corrections={};places=[];audit=[];seen={}
 for o in observations:
  key=o['id'];f=facts(o,args.date);reason='Карточка не найдена или не подтверждено соответствие видимого названия и координат'
  if key in SKIP or key in SKIP_NEW:reason='Заведение питания, иной объект или неподтверждённый дубль: исключён из обновления'
  elif f:
   original=originals.get(key)
   gap=distance(original,f['lat'],f['lon']) if original else 0
   allowed=170 if original and original['category'] in ['Парк','Пляж'] else 110 if key=='osm-node-702416567' else 85
   if original and gap>allowed:reason=f'Расхождение координат {round(gap)} м: требуется отдельное подтверждение'
   else:
    identity=re.search(r'!1s([^!]+)',o['url'])[1]
    if identity in seen:
     corrections[key]={'hidden':True,'reason':'Подтверждённый дубль карточки Google Maps','duplicateOf':seen[identity]};reason='Объединён подтверждённый дубль'
    else:
     seen[identity]=key;gc=f.pop('googleCategory');verified=list(f.keys())
     if original:
      patch=f
      if 'музей' in gc.lower() or 'музей' in f['name'].lower():patch['category']='Музей'
      patch['aliases']=list(dict.fromkeys([*original.get('aliases',[]),original['name']]))
      # Hours of a current institution are not visiting hours of a historic facade.
      if original['category']=='История' and not any(t in gc.lower() for t in ['музей','достопримечательност','театр','памятник']) and 'музей' not in f['name'].lower():
       patch['name']=original['name'];patch.pop('openingHours',None);patch.pop('hoursSource',None)
       verified=[v for v in verified if v not in ['openingHours','hoursSource','name']]
      corrections[key]={'patch':patch,'checkedAt':args.date,'verifiedFields':verified,'reason':'Сверено с видимой карточкой Google Maps; источник и дата сохранены'}
      reason='Обновлено по подтверждённой карточке'
     else:
      category='Музей' if 'музей' in f['name'].lower() else 'Площадь' if 'площадь' in f['name'].lower() else 'Парк' if any(t in f['name'].lower() for t in ['парк','остров']) else 'Памятник'
      places.append({'id':key,**f,'category':category,'minutes':7 if category=='Музей' else 5,'priority':8 if category=='Музей' else 5,'checkedAt':args.date,'verifiedFields':verified,'dataSource':'Google Maps','dataUpdatedAt':args.date})
      reason='Добавлена новая достопримечательность'
  audit.append({'id':key,'query':o['query'],'sourceUrl':o['url'],'result':reason})
 output={'updatedAt':args.date,'corrections':corrections,'places':places}
 (ROOT/'lib/kurgan-google-places.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')
 summary={'checkedAt':args.date,'originalPlacesChecked':len(originals),'updatedPlaces':sum('patch' in c for c in corrections.values()),'duplicatesMerged':sum(c.get('hidden',False) for c in corrections.values()),'newPlaces':len(places),'schedulesStored':sum('openingHours' in c.get('patch',{}) for c in corrections.values())+sum('openingHours' in p for p in places),'observations':audit}
 (ROOT/'docs/kurgan-google-audit.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
 print({k:v for k,v in summary.items() if k!='observations'})
if __name__=='__main__':main()
