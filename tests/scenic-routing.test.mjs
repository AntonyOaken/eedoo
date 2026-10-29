import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import ts from 'typescript';

const directory=await mkdtemp(join(tmpdir(),'eedoo-scenic-'));
for(const name of ['places','walk-modes','scenic-routing']){
 const source=(await readFile(new URL('../lib/'+name+'.ts',import.meta.url),'utf8')).replace(/(['"])(\.\/[\w-]+)\1/g,'$1$2.mjs$1');
 await writeFile(join(directory,name+'.mjs'),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
}
after(()=>rm(directory,{recursive:true,force:true}));
const {buildScenicWalk,scenicBudget}=await import('file://'+join(directory,'scenic-routing.mjs'));
const {distance}=await import('file://'+join(directory,'places.mjs'));
const place=(id,x,y=0,priority=10)=>({id,name:id,lon:x/111195,lat:y/111195,priority,category:'Парк',minutes:5});
const path=points=>{
 let meters=0;const shape=[[points[0].lat,points[0].lon]];
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],d=distance(a,b),steps=Math.max(1,Math.ceil(d/40));meters+=d;
  for(let j=1;j<=steps;j++)shape.push([a.lat+(b.lat-a.lat)*j/steps,a.lon+(b.lon-a.lon)*j/steps]);
 }
 return {shape,distance:meters,walkingMinutes:Math.ceil(meters/75)};
};
const start=place('start',0),end=place('end',2200);

test('Search moves from a chosen stop and reaches places beyond the old 500 m corridor',async()=>{
 const rows=[place('a',450,300),place('b',760,600),place('c',1150,600),place('d',1600,300),place('outside',1000,900,999)];
 const calls=[];const calculate=points=>{calls.push(points.map(p=>p.id));return path(points);};
 const base=path([start,end]),walk=await buildScenicWalk(start,end,base,calculate,rows);
 assert(walk.stops.some(p=>p.id==='b'),'second stop must be discoverable from the first stop');
 assert(calls.some(ids=>ids[0]==='search'&&ids[1]==='b'));
 assert(!walk.stops.some(p=>p.id==='outside'));
 assert(walk.distance<=scenicBudget(base.distance));
 assert(walk.shape.every(p=>Math.abs(p[0]*111195)<=800.01));
 assert.deepEqual(walk.shape.at(-1),[end.lat,end.lon]);
 assert.equal(new Set(walk.stops.map(p=>p.id)).size,walk.stops.length);
 for(const stop of walk.stops)assert(walk.shape.some(p=>distance(stop,{lat:p[0],lon:p[1]})<1));
});

test('Checks walking access rather than accepting a place across an impassable obstacle',async()=>{
 const near=place('across-river',350,100,999),good=place('reachable',700,50);
 const calculate=points=>{const result=path(points);return points.at(-1).id===near.id?{...result,distance:700}:result;};
 const walk=await buildScenicWalk(start,end,path([start,end]),calculate,[near,good]);
 assert(!walk.stops.some(p=>p.id===near.id));assert(walk.stops.some(p=>p.id===good.id));
});

test('Reserves the complete return to the destination before accepting a stop',async()=>{
 const good=place('good',350,150),bad=place('long-return',750,200,999);
 const calculate=points=>{const result=path(points);return points[0].id===bad.id?{...result,distance:10000}:result;};
 const base=path([start,end]),walk=await buildScenicWalk(start,end,base,calculate,[good,bad]);
 assert(walk.stops.some(p=>p.id===good.id));assert(!walk.stops.some(p=>p.id===bad.id));
 assert(walk.distance<=scenicBudget(base.distance));
});

test('Rejects street geometry outside the reference corridor even when the POI is inside',async()=>{
 const bad=place('bridge-detour',350,100,999),good=place('good',900,100);
 const calculate=points=>points.at(-1).id===bad.id?path([points[0],place('outside',350,850),bad]):path(points);
 // Keep its reported walking length short to isolate the geometry restriction.
 const walk=await buildScenicWalk(start,end,path([start,end]),points=>{
  const result=calculate(points);return points.at(-1).id===bad.id?{...result,distance:400}:result;
 },[bad,good]);
 assert(!walk.stops.some(p=>p.id===bad.id));assert(walk.stops.some(p=>p.id===good.id));
});

test('Continues searching along the remaining path after a long empty area',async()=>{
 const finish=place('finish',4000),late=place('late',3200,150);
 const walk=await buildScenicWalk(start,finish,path([start,finish]),path,[late]);
 assert.deepEqual(walk.stops.map(p=>p.id),['late']);
});

test('Keeps a valid direct path when candidates are absent or inaccessible',async()=>{
 const base=path([start,end]);
 for(const rows of [[],[place('unreachable',350,100)]]){
  const walk=await buildScenicWalk(start,end,base,()=>{throw new Error('No path');},rows);
  assert.equal(walk.distance,base.distance);assert.deepEqual(walk.shape,base.shape);assert.deepEqual(walk.stops,[]);
 }
 assert.equal(scenicBudget(1000),1400);assert.equal(scenicBudget(10000),12000);
});

test('Excludes food and closed museums and can propose different stops within the same limits',async()=>{
 const a=place('a',350,100),b=place('b',350,-100);
 const food={...place('cafe',200,0,999),category:'Кафе'},closed={...place('museum',300,0,999),category:'Музей',businessStatus:'temporarily_closed'};
 const base=path([start,end]);
 const first=await buildScenicWalk(start,end,base,path,[a,b,food,closed]);
 const second=await buildScenicWalk(start,end,base,path,[a,b,food,closed],first.stops.map(p=>p.id));
 assert.equal(first.stops[0].id,'a');assert.equal(second.stops[0].id,'b');
 for(const walk of [first,second]){assert(!walk.stops.some(p=>[food.id,closed.id].includes(p.id)));assert(walk.distance<=scenicBudget(base.distance));}
});
