"""Import reviewed visible 2GIS observations. No network or live-card requests.

Explicit identity matches are reviewed separately; unknown cards stay out of the
catalogue until reviewed. Complete weekly schedules only, never today's status.
"""
import argparse
import json
import math
import re
from pathlib import Path
from urllib.parse import unquote
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
DAY = dict(zip(['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'], DAYS))
DAY.update(dict(zip(['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'], DAYS)))

def clean(s):
    return s.replace('\u200b', '').replace('\xa0', ' ').strip()

def intervals(times, pause=None):
    matches = re.findall(r'(\d{2}:\d{2})[–-](\d{2}:\d{2})', times)
    if not matches:
        return 'off' if times == 'Выходной' else None
    start, end = matches[0]
    if pause:
        split = re.search(r'(\d{2}:\d{2})[–-](\d{2}:\d{2})', pause)
        if split and start < split[1] < split[2] < end:
            return f'{start}-{split[1]},{split[2]}-{end}'
    return f'{start}-{end}'

def parse_hours(text):
    lines = [clean(line) for line in text.splitlines()]
    weekly = {}
    for i, line in enumerate(lines[:-1]):
        group = re.fullmatch(r'(' + '|'.join(DAY) + r')(?: — (' + '|'.join(DAY) + r'))?', line)
        if not group:
            continue
        hours = intervals(lines[i+1], lines[i+2] if i+2 < len(lines) and lines[i+2].startswith('Перерыв ') else None)
        if hours is None:
            continue
        start = DAYS.index(DAY[group[1]])
        end = DAYS.index(DAY[group[2]]) if group[2] else start
        for day in DAYS[start:end+1]:
            weekly[day] = hours
    if len(weekly) == 7:
        return '; '.join(f'{day} {weekly[day]}' for day in DAYS)
    daily = re.search(r'Ежедневно\s+с\s+(\d{2}:\d{2})\s+до\s+(\d{2}:\d{2})(?:, обед\s+c\s+(\d{2}:\d{2})\s+до\s+(\d{2}:\d{2}))?', clean(text))
    if daily:
        hours = intervals(f'{daily[1]}-{daily[2]}', f'{daily[3]}-{daily[4]}' if daily[3] else None)
        return f'Mo-Su {hours}'
    if re.search(r'\bКруглосуточно\b', text):
        return '24/7'

def facts(o, date, category, asset_dir):
    route = re.search(r'\|([\d.]+),([\d.]+);([\d]+)', unquote(o.get('route') or ''))
    if not route:
        raise ValueError('No observed route coordinates')
    lon, lat = map(float, route.groups()[:2])
    url = o['url']
    if not re.fullmatch(r'https://2gis.ru/kurgan/(?:firm|geo)/\d+', url) or url.rsplit('/', 1)[1] != route[3]:
        raise ValueError('Card URL and route identity disagree')
    if not (55.35 <= lat <= 55.55 and 65.18 <= lon <= 65.48):
        raise ValueError('Outside Kurgan')
    name = clean(o['name'])
    text = o['text']
    if name not in clean(text):
        raise ValueError('Visible heading and body disagree')
    f = dict(id=route[3], url=url, checkedAt=date, name=name, lat=lat, lon=lon, category=category)
    addresses = [a for a in o.get('addresses', []) if re.search(r',\s*\d', clean(a))]
    if addresses:
        f['address'] = clean(addresses[0]) + ', Курган'
    elif route[3] == '1407903164531228':
        f['address'] = 'Улица Максима Горького, 127/4, Курган'
    if o.get('phones'):
        f['phone'] = o['phones'][0].removeprefix('tel:')
    websites = [l['text'] for l in o.get('links', []) if re.match(r'^[\wа-яА-Я.-]+\.[a-zа-я]{2,}(?:/|$)', l['text'])]
    if websites:
        f['website'] = 'https://' + websites[0].rstrip('/')
    elif route[3] == '1407903164531228':
        f['website'] = 'https://komo45.ru'
    after = clean(text).split(name, 1)[-1]
    score = re.search(r'\n([1-5](?:\.\d)?)\n(?:Подтверждён\n\((\d+)\)|(\d+) оцен)', after)
    if score:
        f['rating'], f['reviewCount'] = float(score[1]), int(score[2] or score[3])
    if 'Временно не работает' in text:
        f['businessStatus'] = 'temporarily_closed'
    elif 'Закрыто навсегда' in text:
        f['businessStatus'] = 'permanently_closed'
    hours = parse_hours(text)
    if hours:
        f['openingHours'] = hours
        if 'businessStatus' not in f:
            f['businessStatus'] = 'operational'
    notes = re.findall(r'(?:^|\u200b)(касса:[^\n\u200b]+|администрация:[^\n\u200b]+|санитарный день:[^\n\u200b]+|(?:летний|зимний) период:[^\n\u200b]+|экскурсии[^\n\u200b]*|по предварительной записи[^\n\u200b]*)', text, re.M)
    if notes:
        f['hoursNote'] = '; '.join(dict.fromkeys(clean(n) for n in notes))
    if o.get('photo') and (o.get('download') or (asset_dir/f'{route[3]}.jpg').exists()):
        if o.get('download'):
            image_path = Path(o['download'].replace('/home/oai/share', '/workspace/scratch', 1))
            with Image.open(image_path) as image:
                image = ImageOps.exif_transpose(image).convert('RGB')
                image.thumbnail((1400, 1400))
                image.save(asset_dir / f'{route[3]}.jpg', quality=86, optimize=True)
        f['photo'] = dict(url=f'/photos/kurgan/2gis/{route[3]}.jpg', sourceUrl=o['photo']['sourceUrl'], originalUrl=o['photo']['url'], author=(o['photo'].get('author') or 'Фото из 2ГИС') + ' · 2ГИС')
    return f

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('observations')
    parser.add_argument('--date', required=True)
    args = parser.parse_args()
    matches = json.loads((ROOT/'docs/kurgan-2gis-matches.json').read_text())
    other = json.loads((ROOT/'lib/other-city-places.json').read_text())['kurgan']['places']
    google = json.loads((ROOT/'lib/kurgan-google-places.json').read_text())
    originals = {p['id']: {**p, **google['corrections'].get(p['id'], {}).get('patch', {})} for p in other}
    originals.update({p['id']: p for p in google['places']})
    asset_dir = ROOT/'public/photos/kurgan/2gis'
    asset_dir.mkdir(parents=True, exist_ok=True)
    corrections, places, audit = {}, [], []
    observations = {o['url']: o for o in json.loads(Path(args.observations).read_text())}
    for url, o in observations.items():
        match = matches.get(url)
        if not match:
            audit.append(dict(sourceUrl=url, name=o.get('name'), result='Not identity-reviewed; not imported'))
            continue
        try:
            f = facts(o, args.date, match['category'], asset_dir)
            target_id = match.get('id')
            original = originals.get(target_id)
            if target_id and not original:
                raise ValueError('Unknown target ID')
            if original:
                gap = math.hypot(f['lat']-original['lat'], (f['lon']-original['lon'])*math.cos(math.radians(f['lat']))) * 111195
                if gap > match.get('maxDistance', 110):
                    raise ValueError(f'Coordinate mismatch: {gap:.0f}m')
            patch = {k: v for k, v in f.items() if k not in ['id', 'url', 'checkedAt', 'rating', 'reviewCount', 'businessStatus']}
            if match.get('displayName'):
                patch['name'] = match['displayName']
            patch['twoGis'] = f
            if 'openingHours' in f:
                patch['hoursSource'] = url
            if f.get('businessStatus') in ['temporarily_closed', 'permanently_closed']:
                patch['businessStatus'] = f['businessStatus']
                patch['businessStatusSource'] = url
            remove = ['businessStatus', 'businessStatusSource'] if f.get('businessStatus') == 'operational' else []
            verified = [k for k in f if k not in ['id', 'url', 'checkedAt']]
            if original:
                patch['aliases'] = list(dict.fromkeys([*original.get('aliases', []), original['name']]))
                corrections[target_id] = dict(patch=patch, removeFields=remove, checkedAt=args.date, verifiedFields=verified, reason='Identity reviewed against name, address and route coordinates; 2GIS takes precedence for Kurgan')
                result = 'Updated'
            else:
                places.append(dict(id='2gis-'+f['id'], **patch, minutes=7 if f['category']=='Музей' else 5, priority=8 if f['category']=='Музей' else 5, checkedAt=args.date, verifiedFields=verified, dataSource='2ГИС', dataUpdatedAt=args.date))
                result = 'Added'
            audit.append(dict(sourceUrl=url, name=f['name'], result=result, targetId=target_id or '2gis-'+f['id'], fields=verified))
        except (ValueError, OSError) as error:
            audit.append(dict(sourceUrl=url, name=o.get('name'), result=str(error)))
    output = dict(updatedAt=args.date, corrections=corrections, places=places)
    (ROOT/'lib/kurgan-2gis-places.json').write_text(json.dumps(output, ensure_ascii=False, indent=2)+'\n')
    summary = dict(checkedAt=args.date, cardsChecked=len(observations), updatedPlaces=len(corrections), newPlaces=len(places), photosStored=sum('photo' in c['patch'] for c in corrections.values())+sum('photo' in p for p in places), schedulesStored=sum('openingHours' in c['patch'] for c in corrections.values())+sum('openingHours' in p for p in places), observations=audit)
    (ROOT/'docs/kurgan-2gis-audit.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2)+'\n')
    print({k:v for k,v in summary.items() if k!='observations'})

if __name__ == '__main__':
    main()
