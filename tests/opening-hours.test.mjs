import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

const source=await readFile(new URL('../lib/opening-hours.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {getHoursStatus}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const status=(hours,at,zone='Asia/Yekaterinburg',closure)=>getHoursStatus(hours,zone,new Date(at),closure);

test('Under an hour shows minutes; exactly one hour and longer show the event time',()=>{
 const hours='Mo-Su 09:00-18:00';
 assert.equal(status(hours,'2026-10-06T17:01:00+05:00').detail,'Закроется через 59 мин');
 assert.equal(status(hours,'2026-10-06T17:00:00+05:00').detail,'Закроется в 18:00');
 assert.equal(status(hours,'2026-10-06T08:01:00+05:00').detail,'Откроется через 59 мин');
 assert.equal(status(hours,'2026-10-06T08:00:00+05:00').detail,'Откроется в 09:00');
 assert.equal(status(hours,'2026-10-06T17:59:45+05:00').detail,'Закроется через 1 мин');
 assert.equal(status(hours,'2026-10-06T18:00:00+05:00').detail,'Откроется завтра в 09:00');
 assert.equal(status(hours,'2026-10-06T09:00:00+05:00').label,'Открыто сейчас');
});

test('The same instant uses the place city timezone rather than the visitor timezone',()=>{
 const hours='09:00-18:00',at='2026-10-06T13:30:00Z';
 assert.equal(status(hours,at,'Europe/Moscow').detail,'Закроется в 18:00');
 assert.equal(status(hours,at,'Asia/Yekaterinburg').state,'closed');
 assert.equal(status(hours,at,'Asia/Bangkok').state,'closed');
});

test('Lunch breaks close on time and count down to the next session',()=>{
 const hours='Mo-Fr 09:00-12:00,12:30-17:00; Sa-Su off';
 assert.equal(status(hours,'2026-10-06T11:45:00+05:00').detail,'Закроется через 15 мин');
 assert.equal(status(hours,'2026-10-06T12:00:00+05:00').state,'closed');
 assert.equal(status(hours,'2026-10-06T12:00:00+05:00').detail,'Откроется через 30 мин');
 assert.equal(status(hours,'2026-10-06T12:30:00+05:00').state,'open');
 assert.equal(status(hours,'2026-10-09T17:00:00+05:00').detail,'Откроется в понедельник в 09:00');
});

test('Overnight periods survive midnight, with the correct next-day closing time',()=>{
 const hours='Fr-Sa 20:00-02:00';
 assert.equal(status(hours,'2026-10-09T23:00:00+05:00').detail,'Закроется завтра в 02:00');
 assert.equal(status(hours,'2026-10-10T01:30:00+05:00').detail,'Закроется через 30 мин');
 assert.equal(status(hours,'2026-10-10T02:00:00+05:00').detail,'Откроется в 20:00');
 assert.equal(status('Su 23:00-02:00','2026-10-12T01:30:00+05:00').state,'open');
});

test('Adjacent sessions and round-the-clock hours do not create a false midnight countdown',()=>{
 for(const hours of ['24/7','Mo-Su 00:00-24:00','Mo-Su 09:00-09:00']){
  const result=status(hours,'2026-10-11T23:50:00+05:00');
  assert.equal(result.state,'open');assert.equal(result.detail,'Круглосуточно');assert.equal(result.countdown,undefined);
 }
 assert.equal(status('Mo-Su 09:00-12:00,12:00-18:00','2026-10-06T11:50:00+05:00').detail,'Закроется в 18:00');
});

test('Day overrides and ranges spanning Sunday use the correct weekly schedule',()=>{
 assert.equal(status('Mo-Su 10:00-18:00; We off','2026-10-07T12:00:00+05:00').detail,'Откроется завтра в 10:00');
 assert.equal(status('Th-Mo 11:00-18:00; Tu 11:00-17:00','2026-10-06T16:30:00+05:00').detail,'Закроется через 30 мин');
 assert.equal(status('Mo, We-Fr 10:00-18:00','2026-10-06T10:00:00+05:00').state,'closed');
 assert.equal(status('Mo off; Tu-Sa 10:00-22:00','2026-10-05T20:00:00+05:00').detail,'Откроется завтра в 10:00');
});

test('Confirmed business closures win over normal hours; uncertain schedules stay unknown',()=>{
 assert.deepEqual(status('24/7','2026-10-06T12:00:00Z','Asia/Yekaterinburg','temporarily_closed'),{state:'closed',label:'Закрыто',detail:'Временно закрыто'});
 assert.equal(status('24/7','2026-10-06T12:00:00Z','Asia/Yekaterinburg','permanently_closed').detail,'Закрыто навсегда');
 for(const hours of [undefined,'','по записи','Mo-Su 10:00-18:00; PH off','May-Sep 10:00-18:00','Tu[-1] off','10:00+','09:00-25:00','09:60-18:00','Mo-Su 10:00-18:00 "по записи"'])assert.equal(status(hours,'2026-10-06T12:00:00Z').state,'unknown');
 assert.equal(getHoursStatus('24/7',undefined,new Date()).state,'unknown');
 assert.equal(status('off','2026-10-06T12:00:00Z').state,'closed');
});

test('Every full schedule imported from 2GIS produces a usable current status',async()=>{
 const data=JSON.parse(await readFile(new URL('../lib/kurgan-2gis-places.json',import.meta.url),'utf8'));
 const entries=[...Object.values(data.corrections).map(c=>c.patch),...data.places];
 const schedules=entries.filter(p=>p.twoGis?.openingHours);
 assert.ok(schedules.length>=23);
 for(const place of schedules)assert.notEqual(status(place.openingHours,'2026-10-06T12:26:00+05:00').state,'unknown',place.name);
});
