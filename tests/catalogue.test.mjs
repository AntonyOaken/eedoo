import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../lib/catalogue-corrections.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {applyCorrections}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const original={id:'osm-node-1',name:'Кафе',lat:55.44,lon:65.34,openingHours:'09:00-18:00',dataUpdatedAt:'2026-10-05'};
test('Verified correction survives newer imported data without mutating snapshots',()=>{
 const correction={patch:{openingHours:'10:00-20:00'},checkedAt:'2026-10-04',verifiedFields:['openingHours'],reason:'Official site'};
 const refreshed={...original,openingHours:'08:00-17:00',dataUpdatedAt:'2026-10-06'};
 for(const row of [original,refreshed]){
  const result=applyCorrections([row],{[row.id]:correction})[0];
  assert.equal(result.openingHours,'10:00-20:00');assert.equal(result.dataUpdatedAt,row.dataUpdatedAt);assert.equal(result.checkedAt,'2026-10-04');assert.deepEqual(result.verifiedFields,['openingHours']);
 }
 assert.equal(original.openingHours,'09:00-18:00');
});
test('A closure tombstone remains hidden after refresh and unknown corrections are ignored',()=>{
 assert.deepEqual(applyCorrections([original],{[original.id]:{hidden:true,reason:'Confirmed closure'}}),[]);
 assert.deepEqual(applyCorrections([original],{missing:{hidden:true,reason:'Other place'}}),[original]);
});
test('Incorrect imported field can be removed without marking other fields verified',()=>{
 const result=applyCorrections([original],{[original.id]:{removeFields:['openingHours'],reason:'Incorrect hours'}})[0];
 assert.equal(result.openingHours,undefined);assert.equal(result.checkedAt,undefined);assert.equal(original.openingHours,'09:00-18:00');
});

test('Source-ID corrections also apply to curated landmarks and keep their visible ID',()=>{
 const curated={...original,id:'curated',osmId:original.id};
 assert.deepEqual(applyCorrections([curated],{[original.id]:{hidden:true,reason:'Confirmed source closure'}}),[]);
 const corrected=applyCorrections([curated],{[original.id]:{patch:{openingHours:'24/7'},reason:'Source check'},curated:{patch:{name:'Новое название'},reason:'Editorial name'}})[0];
 assert.equal(corrected.id,'curated');assert.equal(corrected.openingHours,'24/7');assert.equal(corrected.name,'Новое название');
});

test('ID-specific duplicate removal preserves a curated landmark sharing its source ID',()=>{
 const landmark={...original,id:'landmark',osmId:original.id};
 const rows=applyCorrections([landmark,original],{[original.id]:{hidden:true,reason:'Duplicate'},landmark:{patch:{name:'Название 2ГИС'},reason:'2GIS'}},{matchSourceIds:false});
 assert.equal(rows.length,1);assert.equal(rows[0].id,'landmark');assert.equal(rows[0].name,'Название 2ГИС');assert.equal(rows[0].osmId,original.id);
});
