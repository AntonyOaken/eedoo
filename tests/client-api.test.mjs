import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import ts from 'typescript';
const temporary=await mkdtemp(join(tmpdir(),'poputi-regression-'));
for(const file of ['google-places','place-filter','nearby-food','catalogue-corrections','places','routing','geocoding','client-api','catalog','poi-details','local-routing','walking-graph-data','alternatives','cities','graph-loader','kurgan-graph-data','phuket-graph-data','walk-modes']) {
 const source=await readFile(new URL('../lib/'+file+'.ts',import.meta.url),'utf8');
 const withExtensions=source.replace(/(['"])(\.\/[\w-]+)\1/g,'$1$2.mjs$1').replace(/\.json(['"])/g,'.json.mjs$1');
 await writeFile(join(temporary,file+'.mjs'),ts.transpileModule(withExtensions,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
}
for(const name of ['kurgan-google-places','catalogue-corrections','city-places','seed-details','other-city-places','food-places'])await writeFile(join(temporary,name+'.json.mjs'),'export default '+await readFile(new URL('../lib/'+name+'.json',import.meta.url),'utf8')+';');
const {requestWalk,requestSearch,siteJson}=await import('file://'+join(temporary,'client-api.mjs'));
const {HOTEL,HERMITAGE}=await import('file://'+join(temporary,'places.mjs'));
const {installGraph}=await import('file://'+join(temporary,'graph-loader.mjs'));
const localRoute=installGraph('spb',await import('file://'+join(temporary,'walking-graph-data.mjs')));
for(const city of ['kurgan','phuket'])installGraph(city,await import('file://'+join(temporary,city+'-graph-data.mjs')));
const {CITIES,cityAt,inCity,getCity}=await import('file://'+join(temporary,'cities.mjs'));
const {getCatalog,defaultEnd}=await import('file://'+join(temporary,'catalog.mjs'));
const nativeFetch=globalThis.fetch;
after(async()=>{globalThis.fetch=nativeFetch;await rm(temporary,{recursive:true,force:true});});
function encode(points){let previous=[0,0],text='';for(const point of points)point.forEach((p,i)=>{const value=Math.round(p*1e6);let delta=value-previous[i];previous[i]=value;delta=delta<0?~(delta<<1):delta<<1;while(delta>=32){text+=String.fromCharCode((32|(delta&31))+63);delta>>=5;}text+=String.fromCharCode(delta+63);});return text;}
const routingData={trip:{legs:[{shape:encode([[HOTEL.lat,HOTEL.lon],[59.936,30.312],[HERMITAGE.lat,HERMITAGE.lon]])}],summary:{length:1.442,time:1320}}};

test('HTML access-denied response builds a real street route with every network request blocked',async()=>{
 let calls=0;
 globalThis.fetch=async(url)=>{calls++;if(String(url).startsWith('/api/'))return new Response('<!DOCTYPE html><title>Sign in</title>',{status:401,headers:{'content-type':'text/html'}});throw new TypeError('Failed to fetch');};
 const result=await requestWalk(HOTEL,HERMITAGE,'direct');
 assert(result.distance>900&&result.distance<3000);assert(result.shape.length>10);assert(result.walkingMinutes>10);assert(result.stops.length>0);assert.equal(calls,1);
});
test('HTML with status 200 is not parsed as JSON',async()=>{
 globalThis.fetch=async()=>new Response('<!DOCTYPE html>Login',{headers:{'content-type':'text/html'}});
 await assert.rejects(siteJson('/api/walk'),{name:'SiteApiUnavailable'});
});
test('Search uses the same fallback without platform credentials',async()=>{
 let calls=0;
 globalThis.fetch=async(url,options)=>{calls++;if(String(url).startsWith('/api/'))return new Response('<!DOCTYPE html>',{status:403,headers:{'content-type':'text/html'}});assert(String(url).startsWith('https://photon.komoot.io/api/'));assert(!options.headers);return Response.json({features:[{properties:{osm_id:123,name:'Эрмитаж'},geometry:{coordinates:[30.315,59.939]}}]});};
 const results=await requestSearch('Невский 123');assert.equal(results[0].name,'Эрмитаж');assert.equal(calls,2);
});
test('Server failure falls back locally while validation errors stay meaningful',async()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({error:'Сервис маршрутов временно недоступен.'},{status:503});};
 const walk=await requestWalk(HOTEL,HERMITAGE,'direct');assert(walk.shape.length>10);assert.equal(calls,1);
 globalThis.fetch=async()=>Response.json({error:'Выберите другую точку.'},{status:400});
 await assert.rejects(requestWalk(HOTEL,HERMITAGE,'direct'),{message:'Выберите другую точку.'});
});
test('Full network failure builds both walking modes including the final part of a long route',async()=>{
 globalThis.fetch=async()=>{throw new TypeError('Failed to fetch');};
 const end={id:'smolny-offline',name:'Смольный собор',lat:59.9489,lon:30.3954};
 const direct=await requestWalk(HOTEL,end,'direct'),scenic=await requestWalk(HOTEL,end,'scenic');
 for(const walk of [direct,scenic]){assert(walk.distance>5000&&walk.distance<10000);assert(walk.shape.length>100);assert(walk.stops.length>4);assert(walk.stops.some(p=>p.lon>30.365));assert.deepEqual(walk.shape[0],[HOTEL.lat,HOTEL.lon]);assert.deepEqual(walk.shape.at(-1),[end.lat,end.lon]);}
 assert(scenic.distance>=direct.distance-100);assert(scenic.distance<=direct.distance+2400);
});
test('Successful server calculation is returned without a fallback',async()=>{
 const expected={distance:1800,shape:[[59.93,30.3]],walkingMinutes:27,stopMinutes:5,stops:[],extraMinutes:4,mode:'scenic'};
 let calls=0;globalThis.fetch=async()=>{calls++;return Response.json(expected);};
 assert.deepEqual(await requestWalk(HOTEL,HERMITAGE,'scenic'),expected);assert.equal(calls,1);
});

const {distributeStops}=await import('file://'+join(temporary,'routing.mjs'));
const {CATALOG}=await import('file://'+join(temporary,'catalog.mjs'));
const {formatHours,ticketLabel,safeUrl}=await import('file://'+join(temporary,'poi-details.mjs'));
test('Long routes include stops in the final third rather than just the first four',()=>{
 const shape=Array.from({length:31},(_,i)=>[59.9+i*.003,30.2]);
 const candidates=Array.from({length:29},(_,i)=>({p:{id:'p'+i,name:'Sight '+i,lat:shape[i+1][0],lon:30.2001,priority:5},distance:5,order:i+2}));
 const selected=distributeStops(candidates,shape,12);
 assert(selected.length>4);assert(selected.some(c=>c.order>20));assert(selected[0].order<10);
 assert(selected.every((c,i)=>i===0||c.order>selected[i-1].order));
});
test('City catalogue covers northern, southern and western districts and has verified details',()=>{
 assert(CATALOG.length>3000);assert(CATALOG.some(p=>p.lat>60.05));assert(CATALOG.some(p=>p.lat<59.8));assert(CATALOG.some(p=>p.lon<29.9));
 assert(CATALOG.filter(p=>p.openingHours).length>300);assert(CATALOG.filter(p=>p.photo).length>=18);
 const isaac=CATALOG.find(p=>p.id==='isaac');assert(isaac.charge.includes('550'));assert(isaac.hoursSource.startsWith('https://'));assert(isaac.photo.sourceUrl.includes('commons.wikimedia.org'));
});
test('Missing admission data does not become a fabricated ticket price',()=>{
 assert.equal(ticketLabel({fee:'yes'}),'Вход платный · цена не указана');assert.equal(ticketLabel({}),'Стоимость не указана');assert.equal(formatHours('Mo-Fr 10:00-18:00; Sa-Su off'),'пн-пт 10:00-18:00 ·  сб-вс закрыто');
});
test('Scenic routes are split before reaching the public service location limit',async()=>{
 const start={...HOTEL,lat:59.9308};const end={id:'smolny',name:'Смольный',lat:59.9489,lon:30.3954};
 const shape=Array.from({length:81},(_,i)=>[start.lat+(end.lat-start.lat)*i/80,start.lon+(end.lon-start.lon)*i/80]);
 const batches=[];
 globalThis.fetch=async(url)=>{const payload=JSON.parse(new URL(String(url)).searchParams.get('json'));batches.push(payload.locations);assert(payload.locations.length<=10);return Response.json({trip:{legs:[{shape:encode(shape)}],summary:{length:batches.length===1?6.5:3.5,time:4000}}});};
 const {buildWalk}=await import('file://'+join(temporary,'routing.mjs'));
 const result=await buildWalk(start,end,'scenic');assert(result.stops.length>8);assert(batches.length>=3);assert.equal(batches[1].at(-1).lat,batches[2][0].lat);assert.equal(batches[1].at(-1).lon,batches[2][0].lon);
});


test('Offline routes cross the Neva on a mapped bridge and reject disconnected water points',()=>{
 const fortress={id:'fortress',name:'Петропавловская крепость',lat:59.95,lon:30.3167};
 const walk=localRoute([HOTEL,fortress]);assert(walk.distance>2500&&walk.distance<7000);assert(walk.shape.length>50);
 // The direct route uses Palace Bridge, not a straight line across the water.
 assert(walk.shape.some(p=>p[0]>59.9402&&p[0]<59.9424&&p[1]>30.306&&p[1]<30.31));
 const gulf={id:'gulf',name:'Вода',lat:59.92,lon:29.97};
 assert.throws(()=>localRoute([HOTEL,gulf]),/пешеходного пути/);
});

const {buildAlternatives,comparison,totalMinutes}=await import('file://'+join(temporary,'alternatives.mjs'));
test('Alternatives are selected for actual endpoints and preserve comparable totals',async()=>{
 const {buildWalk}=await import('file://'+join(temporary,'routing.mjs'));
 const end={id:'smolny-alternatives',name:'Смольный собор',lat:59.9489,lon:30.3954};
 const original=await buildWalk(HOTEL,end,'scenic',localRoute);const before=JSON.stringify(original);
 const options=await buildAlternatives(HOTEL,end,original);
 assert(options.length>=2&&options.length<=3);assert.equal(JSON.stringify(original),before);assert.strictEqual(options[0].walk,original);
 for(const alternative of options.slice(1)){
  assert(alternative.id.startsWith('via-'));assert(!alternative.via.some(p=>p.name.includes('Благовещенский')));
  assert.deepEqual(alternative.walk.shape[0],[HOTEL.lat,HOTEL.lon]);assert.deepEqual(alternative.walk.shape.at(-1),[end.lat,end.lon]);
  assert.equal(alternative.walk.stopMinutes,alternative.walk.stops.reduce((sum,p)=>sum+(p.minutes||5),0));
  const delta=comparison(alternative,original);assert.equal(delta.distance,alternative.walk.distance-original.distance);assert.equal(delta.totalMinutes,totalMinutes(alternative.walk)-totalMinutes(original));
  assert.equal(new Set(alternative.walk.stops.map(p=>p.id)).size,alternative.walk.stops.length);
 }
});
test('Three cities build pedestrian routes and city-specific alternatives with blocked network',async()=>{
 globalThis.fetch=async()=>{throw new TypeError('Failed to fetch');};
 for(const city of CITIES){
  const start=city.example,end=defaultEnd(city.id);assert.notEqual(start.id,end.id);
  const direct=await requestWalk(start,end,'direct',city.id),scenic=await requestWalk(start,end,'scenic',city.id);
  for(const walk of [direct,scenic]){assert(walk.distance>80);assert(walk.shape.length>5);assert(walk.walkingMinutes>0);assert.deepEqual(walk.shape[0],[start.lat,start.lon]);assert.deepEqual(walk.shape.at(-1),[end.lat,end.lon]);assert(walk.stops.every(p=>inCity(p,city)));}
  const options=await buildAlternatives(start,end,direct,city.id);assert(options.length>=2&&options.length<=3,city.name+' alternatives');
  for(const option of options){assert(option.walk.distance>0);assert(option.walk.stops.every(p=>inCity(p,city)));}
 }
});
test('Geolocation detects each supported area and rejects unsupported cities',()=>{
 for(const city of CITIES)assert.equal(cityAt(city.example)?.id,city.id);
 assert.equal(cityAt({lat:7.897,lon:98.299})?.id,'phuket');
 for(const point of [{lat:60.17,lon:24.94},{lat:55.75,lon:37.61},{lat:NaN,lon:30}])assert.equal(cityAt(point),undefined);
 assert.throws(()=>getCity('moscow'),/Выберите/);
});
test('Endpoints in different cities are rejected before any route request',async()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('Unexpected fetch');};
 await assert.rejects(requestWalk(HOTEL,defaultEnd('kurgan'),'direct','spb'),/в выбранном городе/);assert.equal(calls,0);
});
test('Catalogue searches are scoped to selected city and accept Phuket English names',async()=>{
 globalThis.fetch=async()=>new Response('<!DOCTYPE html>',{status:401,headers:{'content-type':'text/html'}});
 const kurgan=await requestSearch('декабрист','kurgan'),phuket=await requestSearch('Chinpracha','phuket');
 assert(kurgan.length>0);assert(phuket.length>0);
 assert(kurgan.every(p=>inCity(p,getCity('kurgan'))));assert(phuket.every(p=>inCity(p,getCity('phuket'))));
 assert(getCatalog('phuket').some(p=>p.category==='Пляж'));assert(getCatalog('phuket').some(p=>p.category==='Храм'));
});

const {isFoodPlace,isPhotoPlace,placesForMode}=await import('file://'+join(temporary,'walk-modes.mjs'));
test('Food mode preserves the A-to-B route and lists every nearby venue in each city',async()=>{
 globalThis.fetch=async()=>{throw new TypeError('Failed to fetch');};
 const {nearbyFoodAlongRoute}=await import('file://'+join(temporary,'routing.mjs'));
 for(const city of CITIES){
  const start=city.example,end=defaultEnd(city.id),catalog=getCatalog(city.id);
  const direct=await requestWalk(start,end,'direct',city.id),walk=await requestWalk(start,end,'food',city.id);
  assert.deepEqual(walk.shape,direct.shape);assert.equal(walk.distance,direct.distance);assert.equal(walk.walkingMinutes,direct.walkingMinutes);
  assert.equal(walk.stops.length,0);assert.equal(walk.stopMinutes,0);assert.equal(walk.extraMinutes,0);
  assert(walk.nearbyFood.length>1,city.name+' nearby food');assert(walk.nearbyFood.every(isFoodPlace));
  assert.deepEqual(walk.nearbyFood,nearbyFoodAlongRoute(catalog,walk.shape));
  assert(walk.nearbyFood.every(p=>p.distanceFromRoute>=0&&p.distanceFromRoute<=500));
  const options=await buildAlternatives(start,end,walk,city.id);assert.equal(options.length,1);assert.strictEqual(options[0].walk,walk);
  assert.equal(new Set(catalog.map(p=>p.id)).size,catalog.length);
 }
});
test('Food corridor follows a curved polyline, includes endpoints and never caps or spaces venues',async()=>{
 const {buildWalk}=await import('file://'+join(temporary,'routing.mjs'));
 const shape=[[59.93,30.30],[59.95,30.30],[59.95,30.34]],start={id:'a',name:'A',lat:59.93,lon:30.30},end={id:'b',name:'B',lat:59.95,lon:30.34};
 const venue=(id,lat,lon)=>({id,name:id,category:'Кафе',lat,lon});
 const catalog=[venue('at-start',start.lat,start.lon),venue('at-end',end.lat,end.lon),venue('curve',59.94,30.3001),venue('inside-499',59.95-499/111195,30.325),venue('outside-501',59.95-501/111195,30.325),venue('shortcut-only',59.94,30.32),...Array.from({length:30},(_,i)=>venue('adjacent-'+i,59.95,30.315+i*.00001))];
 let calls=0;
 const walk=await buildWalk(start,end,'food',points=>{calls++;assert.deepEqual(points,[start,end]);return {shape,distance:4500,walkingMinutes:60};},catalog);
 assert.equal(calls,1);assert.deepEqual(walk.shape,shape);assert.equal(walk.distance,4500);assert.equal(walk.walkingMinutes,60);assert.equal(walk.stopMinutes,0);
 const ids=walk.nearbyFood.map(p=>p.id);assert.equal(ids.length,34);
 for(const id of ['at-start','at-end','curve','inside-499'])assert(ids.includes(id));
 for(const id of ['outside-501','shortcut-only'])assert(!ids.includes(id));
});
test('Photo routes still visit themed stops and include photo stop times in each city',async()=>{
 globalThis.fetch=async()=>{throw new TypeError('Failed to fetch');};
 for(const city of CITIES){
  const start=city.example,end=defaultEnd(city.id),walk=await requestWalk(start,end,'photo',city.id);
  assert(walk.stops.length>0,city.name);assert(walk.stops.every(isPhotoPlace));
  assert.equal(walk.stopMinutes,walk.stops.length*8);
  assert.deepEqual(walk.shape[0],[start.lat,start.lon]);assert.deepEqual(walk.shape.at(-1),[end.lat,end.lon]);
  for(const option of await buildAlternatives(start,end,walk,city.id))assert(option.walk.stops.every(isPhotoPlace));
 }
});
test('Themed modes report no matches instead of substituting unrelated sights',async()=>{
 const {buildWalk}=await import('file://'+join(temporary,'routing.mjs'));
 const unrelated=[{id:'plaque',name:'Мемориальная доска',lat:59.936,lon:30.312,category:'Памятник',priority:4}];
 for(const mode of ['food','photo']){const walk=await buildWalk(HOTEL,HERMITAGE,mode,localRoute,unrelated);assert.equal(walk.stops.length,0);assert.equal(walk.stopMinutes,0);assert(walk.note.includes('500 м'));}
});
test('Regular sightseeing modes exclude food venues from their stop selection',async()=>{
 globalThis.fetch=async()=>{throw new TypeError('Failed to fetch');};
 for(const mode of ['direct','scenic']){const walk=await requestWalk(HOTEL,HERMITAGE,mode);assert(walk.stops.every(p=>!isFoodPlace(p)));}
});

test('Nearby food uses only a center, excludes outside-radius venues, and works in every city without network',async()=>{
 const {foodNearPoint}=await import('file://'+join(temporary,'nearby-food.mjs'));
 const {distance}=await import('file://'+join(temporary,'places.mjs'));
 globalThis.fetch=async()=>{throw new Error('Nearby search must not fetch or build a route');};
 const center={id:'center',name:'Точка',lat:0,lon:0};
 const row=(id,meters,category='Кафе')=>({id,name:id,lat:meters/6371000*180/Math.PI,lon:0,category});
 const result=foodNearPoint([row('far',501),row('near',100),row('edge',499.99),row('museum',20,'Музей'),row('closer',50)],center);
 assert.deepEqual(result.map(p=>p.id),['closer','near','edge']);assert.deepEqual(result.map(p=>p.distanceFromPoint),[50,100,500]);
 for(const city of CITIES){const food=foodNearPoint(getCatalog(city.id),city.example);assert(food.length>0);assert(food.every(p=>distance(p,city.example)<=500));assert(food.every((p,i)=>!i||p.distanceFromPoint>=food[i-1].distanceFromPoint));}
 assert.throws(()=>foodNearPoint([],{...center,lat:NaN}));
});

test('Category highlighting supports multiple types and reset without removing places',async()=>{
 const {categoryMatches}=await import('file://'+join(temporary,'place-filter.mjs'));
 const places=[{category:'Музей'},{category:'Памятник'},{category:'Парк'},{}];
 assert.deepEqual(places.map(p=>categoryMatches(p,[])),[true,true,true,true]);
 assert.deepEqual(places.map(p=>categoryMatches(p,['Музей','Памятник'])),[true,true,false,false]);
 assert.equal(categoryMatches({},['Достопримечательность']),true);
 assert.equal(places.length,4);
});

test('Google matching remembers only IDs of user-selected nearby candidates and rejects moved or unknown locations',async()=>{
 const {canRememberMatch,candidateDistance,googlePlaceQuery,googleMapsLink}=await import('file://'+join(temporary,'google-places.mjs'));
 const place={id:'osm-way-1020885012',name:'Phuket Thai Hua School',lat:7.8856032,lon:98.386868};
 assert.equal(googlePlaceQuery(place),'Phuket Thai Hua Museum Phuket Thailand');
 assert.equal(canRememberMatch(place,{id:'ChIJgoodPlace',location:{lat:()=>place.lat,lng:()=>place.lon}}),true);
 assert.equal(canRememberMatch(place,{id:'ChIJmoved',location:{lat:7.90,lng:98.36}}),false);
 assert.equal(canRememberMatch(place,{id:'ChIJunknown'}),false);
 assert.equal(canRememberMatch(place,{id:'<script>',location:{lat:place.lat,lng:place.lon}}),false);
 assert.equal(candidateDistance(place,{id:'missing'}),null);
 const near=meters=>({id:'ChIJedge',location:{lat:place.lat+meters/6371000*180/Math.PI,lng:place.lon}});
 assert.equal(canRememberMatch(place,near(249)),true);assert.equal(canRememberMatch(place,near(251)),false);
 assert.equal(new URL(googleMapsLink(place)).searchParams.get('query'),'Phuket Thai Hua Museum Phuket Thailand');
});

test('Kurgan Google snapshot is local, mode-scoped and retains complete weekly schedules',()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('Catalog must not fetch Google');};
 const direct=getCatalog('kurgan','direct'),scenic=getCatalog('kurgan','scenic');
 assert.deepEqual(direct,scenic);
 const aviation=direct.find(p=>p.id==='osm-way-176989977');
 assert.equal(aviation.name,'Авиамузей');
 assert.equal(aviation.openingHours,'Mo off; Tu off; We 10:00-16:00; Th 10:00-16:00; Fr 10:00-16:00; Sa 10:00-16:00; Su 10:00-16:00');
 const history=direct.find(p=>p.id==='osm-way-80619716');
 assert(history.openingHours.includes('Tu 10:00-13:00,14:00-18:00'));assert(history.openingHours.endsWith('Su off'));
 const ilizarov=direct.find(p=>p.id==='osm-node-3379998815');
 assert(ilizarov.openingHours.includes('09:00-12:00,12:30-17:00'));
 assert.equal(ilizarov.name,'Музей истории центра академика Г. А. Илизарова');
 assert(direct.some(p=>p.name==='Музей-экспозиция "Аллея Славы"'));
 assert.equal(new Set(direct.map(p=>p.id)).size,direct.length);
 for(const mode of ['food','photo']){
  const base=getCatalog('kurgan',mode);
  assert(!base.some(p=>p.id.startsWith('google-')||p.googleMapsUrl));
  assert.equal(base.find(p=>p.id==='osm-way-176989977').name,'Выставка авиационной техники');
 }
 assert.deepEqual(direct.filter(isFoodPlace),getCatalog('kurgan','food').filter(isFoodPlace));
 assert.equal(calls,0);
});

test('Closed museums stay inspectable on the map but are skipped as suggested walking stops',async()=>{
 const {buildWalk}=await import('file://'+join(temporary,'routing.mjs'));
 const {isWalkStopAvailable}=await import('file://'+join(temporary,'walk-modes.mjs'));
 const museum=getCatalog('kurgan','direct').find(p=>p.id==='osm-way-80657494');
 assert.equal(museum.businessStatus,'temporarily_closed');
 const start={id:'start',name:'А',lat:museum.lat-.005,lon:museum.lon};
 const end={id:'end',name:'Б',lat:museum.lat+.005,lon:museum.lon};
 const open={...museum,id:'open',name:'Открытый музей',lat:museum.lat+.001,businessStatus:undefined};
 const exterior={...museum,id:'facade',category:'История',lat:museum.lat-.001};
 const compute=points=>({shape:points.map(p=>[p.lat,p.lon]),distance:1200,walkingMinutes:16});
 for(const mode of ['direct','scenic']){
  const walk=await buildWalk(start,end,mode,compute,[museum,open,exterior]);
  assert(!walk.stops.some(p=>p.id===museum.id));assert(walk.stops.some(p=>p.id==='open'));
  assert(isWalkStopAvailable(exterior,mode));
 }
});
