import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../lib/two-gis-route.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {twoGisRouteParts,twoGisFullRoute}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));

const point=(id,n)=>({id,name:id,lat:59.93+n*.0001,lon:30.30+n*.0001});
const start=point('start',0),end=point('end',21),stops=Array.from({length:20},(_,i)=>point('stop-'+i,i+1));
test('Long routes keep every stop and finish, with overlapping part boundaries',()=>{
 const parts=twoGisRouteParts(start,end,stops,'spb');
 assert(parts.length>1);assert(parts.every(p=>p.points.length<=10));
 const flattened=parts.flatMap((p,i)=>i?p.points.slice(1):p.points);
 assert.deepEqual(flattened,[start,...stops,end]);
 for(let i=1;i<parts.length;i++)assert.equal(parts[i-1].points.at(-1),parts[i].points[0]);
});
test('URL explicitly requests walking and encodes longitude before latitude',()=>{
 const [part]=twoGisRouteParts(start,end,[],'spb');
 assert.equal(new URL(part.url).origin,'https://2gis.ru');
 assert.match(part.url,/\/spb\/directions\/tab\/pedestrian\/points\//);
 assert.equal(decodeURIComponent(part.url.split('/points/')[1]),'30.3,59.93|30.3021,59.9321');
});
test('iPhone sends the complete itinerary in one URL, including every stop and finish',()=>{
 const parts=twoGisFullRoute(start,end,stops,'spb');
 assert.equal(parts.length,1);
 assert.deepEqual(parts[0].points,[start,...stops,end]);
 const encoded=decodeURIComponent(parts[0].url.split('/points/')[1]).split('|');
 assert.equal(encoded.length,22);
 assert.equal(encoded.at(-1),'30.3021,59.9321');
});
test('The tested ten-point cap splits the twelve-point Smolny case into two parts',()=>{
 const parts=twoGisRouteParts(start,end,stops.slice(0,10),'spb');
 assert.deepEqual(parts.map(p=>p.points.length),[10,3]);
 assert.equal(parts.at(-1).points.at(-1),end);
});
test('Export follows selected alternative stops and deduplicates consecutive coordinates only',()=>{
 const stop=point('via',4),duplicate={...stop,id:'duplicate'};
 const [part]=twoGisRouteParts(start,end,[stop,duplicate,start],'kurgan');
 assert.deepEqual(part.points,[start,stop,start,end]);
 assert.match(part.url,/\/kurgan\/directions/);
});
test('Rejects invalid coordinates or an unsupported part size',()=>{
 assert.throws(()=>twoGisRouteParts({...start,lat:NaN},end,[],'spb'));
 assert.throws(()=>twoGisRouteParts(start,end,[],'spb',12));
});
