import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';

const root=fileURLToPath(new URL('../',import.meta.url));
const modules=new Map();
async function moduleUrl(file){
 if(modules.has(file))return modules.get(file);
 let code=await readFile(file,'utf8');
 if(file.endsWith('.json'))code='export default '+code+';';
 else{
  code=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  const references=[...code.matchAll(/from\s+['"](\.[^'"]+)['"]/g)];
  for(const reference of references){
   const path=resolve(dirname(file),reference[1]);
   const url=await moduleUrl(path.endsWith('.json')?path:path+'.ts');
   code=code.replace(reference[0],'from '+JSON.stringify(url));
  }
 }
 const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');modules.set(file,url);return url;
}
const {getCatalog}=await import(await moduleUrl(resolve(root,'lib/catalog.ts')));
const {isWalkStopAvailable}=await import(await moduleUrl(resolve(root,'lib/walk-modes.ts')));
const direct=getCatalog('kurgan','direct');

test('Reviewed 2GIS data wins over Google while absent fields retain earlier sources',()=>{
 const museum=direct.find(p=>p.id==='osm-way-82200885');
 assert.equal(museum.name,museum.twoGis.name);
 assert.equal(museum.openingHours,museum.twoGis.openingHours);
 assert.equal(museum.hoursSource,museum.twoGis.url);
 assert.ok(museum.googleMapsUrl);
 const park=direct.find(p=>p.id==='osm-relation-3175505');
 assert.equal(park.twoGis.openingHours,undefined);
 assert.equal(park.openingHours,'24/7');
});
test('2GIS operational museums clear stale closures; confirmed closures remain unavailable',()=>{
 const reopened=direct.find(p=>p.id==='osm-way-80605952');
 assert.equal(reopened.twoGis.businessStatus,'operational');
 assert.equal(reopened.businessStatus,undefined);
 assert.equal(isWalkStopAvailable(reopened,'direct'),true);
 const closed=direct.find(p=>p.id==='osm-way-80619716');
 assert.equal(closed.businessStatus,'temporarily_closed');
 assert.equal(closed.businessStatusSource,closed.twoGis.url);
 assert.equal(isWalkStopAvailable(closed,'scenic'),false);
});
test('Photograph references and enrichment stay scoped to Kurgan walking modes',async()=>{
 const photos=direct.filter(p=>p.twoGis?.photo);
 assert.equal(photos.length,40);
 for(const place of photos){
  assert.match(place.photo.url,/^\/photos\/kurgan\/2gis\/\d+\.jpg$/);
  if(process.env.TEST_MEDIA_ROOT)assert.ok((await stat(resolve(process.env.TEST_MEDIA_ROOT,'.'+place.photo.url))).size>0);
  assert.match(place.photo.sourceUrl,/^https:\/\/2gis\.ru\/kurgan\/gallery\//);
 }
 for(const [city,mode] of [['kurgan','food'],['kurgan','photo'],['spb','food'],['spb','photo'],['phuket','scenic']])assert.equal(getCatalog(city,mode).some(p=>p.twoGis),false);
 assert.equal(getCatalog('kurgan','scenic').filter(p=>p.twoGis).length,41);
 assert.equal(new Set(direct.map(p=>p.id)).size,direct.length);
});

test('Petersburg 2GIS overwrites supplied facts, adds new places and stays in walking modes',async()=>{
 const spb=getCatalog('spb','direct');
 const enriched=spb.filter(p=>p.twoGis);
 assert.ok(enriched.length>0);
 assert.ok(enriched.some(p=>p.id.startsWith('2gis-')));
 assert.ok(enriched.some(p=>!p.id.startsWith('2gis-')));
 for(const p of enriched){
  assert.equal(p.name,p.twoGis.name);
  assert.equal(p.lat,p.twoGis.lat);assert.equal(p.lon,p.twoGis.lon);
  for(const field of ['address','phone','website','openingHours','photo'])if(p.twoGis[field]!==undefined)assert.deepEqual(p[field],p.twoGis[field]);
  if(p.twoGis.openingHours)assert.equal(p.hoursSource,p.twoGis.url);
  if(p.twoGis.photo&&process.env.TEST_MEDIA_ROOT)assert.ok((await stat(resolve(process.env.TEST_MEDIA_ROOT,'.'+p.photo.url))).size>0);
 }
 assert.equal(new Set(spb.map(p=>p.id)).size,spb.length);
 assert.deepEqual(getCatalog('spb','scenic'),spb);
 assert.ok(getCatalog('spb','food').every(p=>!p.twoGis));
 assert.ok(getCatalog('spb','photo').every(p=>!p.twoGis));
});
