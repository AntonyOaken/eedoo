"""Import public, DOM-observed 2GIS facts, including previously unknown places.

No live requests. Search discoveries and detailed card observations remain
separate, so discovery coverage cannot be mistaken for detailed verification.
Only identity matches overwrite existing records; every supplied 2GIS fact wins.
"""
import argparse
import importlib.util
import json
import math
import re
import unicodedata
from pathlib import Path
from urllib.parse import unquote, urlsplit, urlunsplit
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('kurgan_import', ROOT/'scripts/import-kurgan-2gis.py')
shared = importlib.util.module_from_spec(spec)
spec.loader.exec_module(shared)
clean = shared.clean
DAYS, DAY = shared.DAYS, shared.DAY

def parse_hours(text):
    """Keep breaks, multiple intervals, overnight hours and all seven weekdays."""
    lines = [clean(s) for s in text.replace('\u200b', '\n').splitlines()]
    week = {}
    for i, line in enumerate(lines[:-1]):
        group = re.fullmatch('('+'|'.join(DAY)+r')(?:\s*[—–-]\s*('+'|'.join(DAY)+'))?', line)
        if not group:
            continue
        value = lines[i+1]
        ranges = re.findall(r'(\d{2}:\d{2})\s*[–—-]\s*(\d{2}:\d{2})', value)
        hours = ','.join(a+'-'+b for a,b in ranges) if ranges else ('off' if value in ['Выходной','Закрыто'] else '00:00-24:00' if value == 'Круглосуточно' else None)
        if hours is None:
            continue
        if len(ranges)==1 and i+2<len(lines) and lines[i+2].startswith('Перерыв'):
            hours = shared.intervals(value, lines[i+2])
        start, end = DAYS.index(DAY[group[1]]), DAYS.index(DAY[group[2] or group[1]])
        for d in range(start, end+1):
            week[DAYS[d]] = hours
    if len(week)==7:
        return '; '.join(d+' '+week[d] for d in DAYS)
    # Today's hours and partial weeks must never become a weekly schedule.
    return shared.parse_hours(text)

def key(url):
    m = re.fullmatch(r'https://2gis\.ru/(?:[a-z-]+/)?(firm|geo)/(\d+)(?:/tab/info)?', url.split('?')[0])
    if not m:
        raise ValueError('Unrecognised observed card URL')
    return m[2]

def inside(lat, lon):
    return 59.70 <= lat <= 60.20 and 29.50 <= lon <= 30.75

def distance(a,b):
    return math.hypot(a['lat']-b['lat'],(a['lon']-b['lon'])*math.cos(math.radians((a['lat']+b['lat'])/2))) * 111195

def norm(name):
    name = unicodedata.normalize('NFKC',name).lower().replace('ё','е')
    name = re.sub(r'\b(?:государственный|санкт[ -]петербургский|имени|им|музей|памятник)\b', '', name)
    return re.sub(r'[^\w]+', ' ', name).strip()

GENERIC = {'доходный дом','жилой дом','дом','музей','парк','сквер','сад','часовня','храм','церковь','памятник','мост','здание','мемориальная доска','фонтан','скульптура','без названия'}

def identity_matches(f, originals):
    name = norm(f['name'])
    if not name or name in GENERIC or len(name)<4:
        return []
    matches = []
    for p in originals:
        gap = distance(f,p)
        if gap>180:
            continue
        aliases = [norm(s) for s in [p['name'],*p.get('aliases',[])]]
        exact = name in aliases
        phrase = len(name)>=9 and any(len(n)>=9 and (name in n or n in name) for n in aliases)
        # No proximity-only or fuzzy-name merge. Nearby different objects survive.
        if exact and gap<=120 or phrase and gap<=85:
            matches.append((p,gap))
    return sorted(matches,key=lambda item:(-item[0].get('priority',0),item[1],item[0]['id']))

def category_for(c):
    lines = [clean(line).lower() for line in c.get('text','').replace('\u200b','\n').splitlines() if clean(line)]
    label = lines[1] if len(lines)>1 else ''
    if 'интересные здания' in label: return 'Архитектура'
    if 'исторический комплекс' in label: return 'История'
    if 'культурное пространство' in label: return 'Городское пространство'
    if 'галере' in label or c.get('rubric')=='190': return 'Галерея'
    # The observed card type takes precedence over a mixed search category.
    if 'театр' in label: return 'Достопримечательность'
    if any(word in label for word in ['церковь','собор','храм','мечеть','синагога']): return 'Храм'
    if 'музе' in label: return 'Музей'
    if c.get('category') in ['Музей','Парк']:
        return c['category']
    text = clean(c.get('text','')).lower()
    if 'жилой дом' in text or 'интересные здания' in text or 'дворец' in text:
        return 'Архитектура'
    if any(word in text for word in ['мемориальная доска','памятник','скульптура','монумент']):
        return 'Памятник'
    if any(word in text for word in ['церковь','собор','храм','мечеть','синагога']):
        return 'Храм'
    if 'мост' in text:
        return 'Мост'
    if 'галере' in text:
        return 'Галерея'
    if 'смотров' in text:
        return 'Смотровая площадка'
    if 'набережная' in c.get('name','').lower():
        return 'Набережная'
    return 'Достопримечательность'

def website(url):
    p = urlsplit(url)
    if p.scheme not in ['http','https'] or not p.netloc or p.netloc.endswith('2gis.ru'):
        return None
    return urlunsplit((p.scheme,p.netloc,p.path,'',''))

def observed_facts(c, o, date, asset_dir):
    source = o or c
    source_url = source['url'].split('?')[0]
    id_ = key(source_url)
    coords = c.get('coordinates') or (o or {}).get('coordinates')
    if o and o.get('route'):
        route = re.search(r'\|([\d.]+),([\d.]+);(\d+)',unquote(o['route']))
        if route:
            if route[3]!=id_:
                raise ValueError('Route and card identity disagree')
            coords = {'lat':float(route[2]),'lon':float(route[1])}
    if not coords or not inside(coords['lat'],coords['lon']):
        raise ValueError('Outside supported Petersburg territory' if coords else 'No observed coordinates')
    name = clean(source['name'])
    text = source.get('text','')
    discovery_text = clean(c.get('text',''))
    if 'Ленинградская область' in discovery_text and 'Санкт-Петербург' not in discovery_text:
        raise ValueError('Leningrad region locality, outside Petersburg')
    labels = [clean(line).lower() for line in (text if o else discovery_text).replace('\u200b','\n').splitlines() if clean(line)]
    label = clean(o['rubricNames'][0]).lower() if o and o.get('rubricNames') else (labels[1] if len(labels)>1 else '')
    if any(word in label for word in ['ресторан','кафе','кофейн','пивовар','магазин','клиника','лечебно','стоматолог','медицинский центр','салон красоты','банк','страхов','турагент','туроператор','гостиниц','отель','ателье по пошиву','продажа чая']):
        raise ValueError('Commercial venue from mixed search results, outside walking collection')
    if name not in clean(text):
        raise ValueError('Heading and body disagree')
    f = dict(id=id_,url=source_url,checkedAt=date,name=name,**coords,category=category_for({**c,'text':name+'\n'+o['rubricNames'][0]+'\n'+text if o and o.get('rubricNames') else text}),observationLevel='card' if o else 'search')
    addresses = (o or {}).get('addresses',[])
    addresses = [clean(a) for a in addresses if re.search(r',\s*\d',clean(a))]
    if addresses:
        f['address'] = addresses[0] if 'Санкт-Петербург' in addresses[0] else addresses[0]+', Санкт-Петербург'
    else:
        # Search results expose addresses directly; locality-only text isn't an address.
        for address_text in [text, c.get('text','')]:
            lines = [clean(line) for line in address_text.replace('\u200b','\n').splitlines()]
            for index,line in enumerate(lines):
                if re.search(r',\s*\d',line) and 'Санкт-Петербург' in ' '.join(lines[index:index+3]):
                    f['address'] = line if 'Санкт-Петербург' in line else line+', Санкт-Петербург'
                    break
            if 'address' in f:
                break
    score = re.search(r'\n([1-5](?:[.,]\d)?)\n(?:Подтверждён\n\((\d+)\)|(\d[\d ]*) оцен)',text)
    if score:
        f['rating'] = float(score[1].replace(',','.'))
        f['reviewCount'] = int((score[2] or score[3]).replace(' ',''))
    if o:
        links = o.get('links',[])
        phones = list(dict.fromkeys(l['url'].removeprefix('tel:') for l in links if l['url'].startswith('tel:')))
        emails = list(dict.fromkeys(l['url'].removeprefix('mailto:') for l in links if l['url'].startswith('mailto:')))
        sites = list(dict.fromkeys(website(l['url']) for l in links if re.match(r'^[\wа-яА-Я.-]+\.[a-zа-я]{2,}(?:/|$)',l['text']) and website(l['url'])))
        social = [{**l,'url':website(l['url']) or l['url']} for l in links if l['text'] in ['ВКонтакте','Telegram','WhatsApp','Instagram','YouTube','Max'] and l['url'].startswith(('http://','https://'))]
        if phones: f.update(phone=phones[0],phones=phones)
        if emails: f['emails'] = emails
        if sites: f.update(website=sites[0],websites=sites)
        if social: f['socialLinks'] = social
        if 'Временно не работает' in text:
            f['businessStatus'] = 'temporarily_closed'
        elif 'Закрыто навсегда' in text:
            f['businessStatus'] = 'permanently_closed'
        hours = parse_hours(text)
        if hours:
            f['openingHours'] = hours
            f.setdefault('businessStatus','operational')
        notes = re.findall(r'(?:^|\u200b)(касса:[^\n\u200b]+|администрация:[^\n\u200b]+|санитарный день:[^\n\u200b]+|(?:летний|зимний) период:[^\n\u200b]+|по предварительной записи[^\n\u200b]*)',text,re.M)
        if notes: f['hoursNote'] = '; '.join(dict.fromkeys(clean(n) for n in notes))
        if o.get('featuresText'):
            f['featuresText'] = o['featuresText']
        info = o.get('infoText','')
        if info and 'В справочнике' in info:
            tail = info.split('В справочнике')[0].split('Фото')[-1]
            # Structured service/accessibility facts; don't copy long editorial prose.
            features = []
            headings = ['Музеи','Доступная среда','Инфраструктура','Аттракционы','Прокат','Лыжные трассы','Доступность']
            stop = '|'.join([*headings,'Способы оплаты','В справочнике','Транспорт','Премия 2ГИС','Здание','Досуг','Значимые достопримечательности','Актуальность данных'])
            for heading in headings:
                groups = re.findall(r'(?:^|\n)'+heading+r'\n(.*?)(?=\n(?:'+stop+r')\n|$)',tail,re.S)
                for group in groups:
                    for value in group.replace('\u200b','\n').splitlines():
                        value = clean(value).lstrip('• ').strip()
                        if value and len(value)<100 and not value.isdigit(): features.append(value)
            if features: f['featuresText'] = ' · '.join(dict.fromkeys(features))
        if o.get('photo'):
            image_path = Path(o['download'].replace('/home/oai/share','/workspace/scratch',1)) if o.get('download') else None
            saved_asset = asset_dir/(id_+'.jpg')
            if image_path and image_path.exists():
                with Image.open(image_path) as image:
                    image = ImageOps.exif_transpose(image).convert('RGB')
                    image.thumbnail((1024,1024),Image.Resampling.LANCZOS)
                    image.save(saved_asset,quality=82,optimize=True,progressive=True)
            if saved_asset.exists():
                f['photo'] = dict(url='/photos/spb/2gis/'+id_+'.jpg',sourceUrl=o['photo']['sourceUrl'],originalUrl=o['photo']['url'],author=(o['photo'].get('author') or 'Фото из 2ГИС')+' · 2ГИС')
    return f

def make_patch(f, original=None):
    ignored = {'id','url','checkedAt','rating','reviewCount','businessStatus','observationLevel'}
    patch = {k:v for k,v in f.items() if k not in ignored}
    patch.update(twoGis=f,dataSource='2ГИС',dataUpdatedAt=f['checkedAt'])
    if original:
        patch['aliases'] = list(dict.fromkeys([*original.get('aliases',[]),original['name']]))
    if f.get('openingHours'): patch['hoursSource'] = f['url']
    if f.get('businessStatus') in ['temporarily_closed','permanently_closed']:
        patch.update(businessStatus=f['businessStatus'],businessStatusSource=f['url'])
    return patch

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--discoveries',required=True)
    p.add_argument('--observations',required=True)
    p.add_argument('--baseline',required=True)
    p.add_argument('--date',required=True)
    args = p.parse_args()
    discovery = json.loads(Path(args.discoveries).read_text())
    observations = json.loads(Path(args.observations).read_text())
    originals = json.loads(Path(args.baseline).read_text())
    originals = [p for p in originals if p.get('category') not in ['Кафе','Ресторан','Бар','Кофейня','Фастфуд','Еда']]
    manual_file = ROOT/'docs/spb-2gis-matches.json'
    manual = json.loads(manual_file.read_text()) if manual_file.exists() else {}
    detailed = {key(o['url']):o for o in observations if o.get('name')}
    cards = {}
    for c in discovery['cards']:
        id_ = key(c['url'])
        previous = cards.get(id_)
        if previous:
            # Merge duplicate search hits without discarding coordinates or a useful category.
            c = {**previous,**{k:v for k,v in c.items() if v is not None}}
            if previous.get('category') in ['Музей','Парк']: c['category'] = previous['category']
        cards[id_] = c
    for id_,o in detailed.items():
        cards.setdefault(id_,dict(o))
    assets = ROOT/'public/photos/spb/2gis'
    assets.mkdir(parents=True,exist_ok=True)
    corrections,places,audit = {},[],[]
    claimed = {}
    for id_,c in cards.items():
        try:
            f = observed_facts(c,detailed.get(id_),args.date,assets)
            explicit = manual.get(id_)
            if explicit and explicit.get('exclude'):
                raise ValueError(explicit['exclude'])
            if explicit and explicit.get('category'): f['category'] = explicit['category']
            if explicit and explicit.get('description'): f['description'] = explicit['description']
            if explicit and explicit.get('targetId'):
                matches = [(p,distance(f,p)) for p in originals if p['id']==explicit['targetId']]
                if not matches or matches[0][1]>explicit.get('maxDistance',250):
                    raise ValueError('Reviewed match no longer agrees with coordinates')
            else:
                matches = identity_matches(f,originals)
            # Branches with a different 2GIS ID cannot silently overwrite one target.
            if matches and matches[0][0]['id'] in claimed:
                prior = claimed[matches[0][0]['id']]
                if distance(f,prior)<30 and norm(f['name'])==norm(prior['name']):
                    audit.append(dict(sourceUrl=f['url'],name=f['name'],result='duplicate_2gis',canonicalTwoGisId=prior['id']))
                    continue
                matches = []
            original = matches[0][0] if matches else None
            patch = make_patch(f,original)
            verified = [k for k in f if k not in ['id','url','checkedAt','observationLevel']]
            remove = ['businessStatus','businessStatusSource'] if f.get('businessStatus')=='operational' else []
            if original:
                target = original['id']
                corrections[target] = dict(patch=patch,removeFields=remove,checkedAt=args.date,verifiedFields=verified,reason='2GIS source takes precedence for all observed fields; identity matched by name/alias and coordinates')
                claimed[target] = f
                # Collapse clear OSM duplicate representations, keeping the stable chosen ID.
                for duplicate,gap in matches[1:]:
                    if norm(duplicate['name'])==norm(original['name']) and distance(duplicate,original)<40 and duplicate['id'] not in claimed:
                        corrections[duplicate['id']] = dict(hidden=True,reason='Duplicate representation of '+target+'; 2GIS '+f['url'])
                for duplicate_id in (explicit or {}).get('duplicateIds',[]):
                    duplicate = next((p for p in originals if p['id']==duplicate_id),None)
                    if not duplicate or duplicate_id==target or distance(f,duplicate)>350:
                        raise ValueError('Reviewed duplicate does not agree with identity/coordinates')
                    corrections[duplicate_id] = dict(hidden=True,reason='Reviewed duplicate representation of '+target+'; 2GIS '+f['url'])
                result = 'updated'
            else:
                target = '2gis-'+id_
                places.append(dict(id=target,**patch,minutes=7 if f['category']=='Музей' else 5,priority=7 if f['category']=='Музей' else 5,checkedAt=args.date,verifiedFields=verified))
                result = 'added'
            audit.append(dict(sourceUrl=f['url'],name=f['name'],result=result,targetId=target,observationLevel=f['observationLevel'],fields=verified,matchDistance=round(matches[0][1],1) if matches else None))
        except (ValueError,OSError) as e:
            audit.append(dict(sourceUrl=c['url'],name=c.get('name'),result='excluded',reason=str(e)))
    complete = discovery.get('discoveryComplete') is True and not discovery.get('pending') and not discovery.get('detailPending') and not discovery.get('errors') and not discovery.get('assetPending') and not discovery.get('infoPending')
    summary = dict(checkedAt=args.date,status='completed' if complete else 'partial',discoveredCards=len(cards),detailedCardsChecked=len(detailed),updatedPlaces=sum(not c.get('hidden') for c in corrections.values()),newPlaces=len(places),duplicateRepresentationsHidden=sum(bool(c.get('hidden')) for c in corrections.values()),photosStored=sum('photo' in c.get('patch',{}) for c in corrections.values())+sum('photo' in p for p in places),schedulesStored=sum('openingHours' in c.get('patch',{}) for c in corrections.values())+sum('openingHours' in p for p in places),discoveryFrontierPages=len(discovery.get('pending',[])),detailCardsRemaining=len(discovery.get('detailPending',[])),errors=discovery.get('errors',[]),discoveryStatus=discovery.get('discoveryStatus','partial'),assetCardsRemaining=len(discovery.get('assetPending',[])),infoCardsRemaining=len(discovery.get('infoPending',[])),observations=audit)
    (ROOT/'lib/spb-2gis-places.json').write_text(json.dumps(dict(updatedAt=args.date,corrections=corrections,places=places),ensure_ascii=False,indent=2)+'\n')
    (ROOT/'docs/spb-2gis-audit.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:v for k,v in summary.items() if k not in ['observations','errors']},ensure_ascii=False))

if __name__=='__main__': main()
