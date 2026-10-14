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
const {mapPlacesAlongRoute}=await import(await moduleUrl(resolve(root,'lib/routing.ts')));
const place=(id,lat,lon)=>({id,name:id,lat,lon});
const straight=[[59.93,30.30],[59.93,30.32]];
test('Keeps small street markers and hides off-route places, including within the viewport',()=>{
 const rows=[place('on',59.93,30.31),place('facade',59.9303,30.31),place('other-street',59.931,30.31),place('far',59.95,30.31)];
 assert.deepEqual(mapPlacesAlongRoute(rows,straight).map(p=>p.id),['on','facade']);
});
test('Uses the actual turns, not a straight line or bounding rectangle',()=>{
 const shape=[[59.93,30.30],[59.93,30.32],[59.94,30.32]];
 const rows=[place('first-street',59.93,30.31),place('after-turn',59.935,30.3203),place('diagonal',59.935,30.31)];
 assert.deepEqual(mapPlacesAlongRoute(rows,shape).map(p=>p.id),['first-street','after-turn']);
});
test('Does not duplicate route stops, start or finish as small markers',()=>{
 const rows=['start','stop','finish','extra'].map(id=>place(id,59.93,30.31));
 assert.deepEqual(mapPlacesAlongRoute(rows,straight,['start','stop','finish']).map(p=>p.id),['extra']);
});
test('Recomputes markers for the selected alternative route',()=>{
 const rows=[place('lower',59.93,30.31),place('upper',59.94,30.31)];
 assert.deepEqual(mapPlacesAlongRoute(rows,straight).map(p=>p.id),['lower']);
 assert.deepEqual(mapPlacesAlongRoute(rows,[[59.94,30.30],[59.94,30.32]]).map(p=>p.id),['upper']);
});
test('Empty and single-point geometry cannot expose all map markers',()=>{
 assert.deepEqual(mapPlacesAlongRoute([place('extra',59.93,30.31)],[]),[]);
 assert.deepEqual(mapPlacesAlongRoute([place('extra',59.93,30.31)],[[59.93,30.31]]),[]);
});
