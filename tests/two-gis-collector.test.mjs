import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collect2GisParallelBatch, retry2GisParallelBatch } from '../scripts/collect-spb-2gis.browser.js';

const candidate = id => ({name:'Дом '+id,url:'https://2gis.ru/spb/geo/'+id,category:'Достопримечательность',coordinates:{lat:59.94,lon:30.31}});
const readableTab = c => ({
  url:async()=>c.url,
  playwright:{
    domSnapshot:async()=>'',
    evaluate:async fn => fn.toString().includes('const h =')
      ? {...c,text:c.name,photos:[],links:[],addresses:[],rubricNames:[]}
      : fn.toString().includes('.split(') ? [] : c.name,
    getByRole:()=>({waitFor:async()=>{},count:async()=>0}),
  },
});

test('an explicitly empty gallery resolves photo retry without attempting a download',async()=>{
  const root=await mkdtemp(join(tmpdir(),'2gis-empty-gallery-'));
  const c=candidate('3');let current=c.url;
  const tab=readableTab(c);
  tab.url=async()=>current;
  tab.goto=async url=>{current=url;};
  const evaluate=tab.playwright.evaluate;
  tab.playwright.evaluate=async fn=>fn.toString().includes('const h =')
    ? {...await evaluate(fn),gallery:'https://2gis.ru/spb/gallery/geo/3'}
    : evaluate(fn);
  tab.playwright.locator=()=>({count:async()=>0});
  tab.playwright.getByRole=(role,options)=>{
    if(role==='img')return {or:()=>({first:()=>({waitFor:async()=>{}})})};
    return {waitFor:async()=>{},count:async()=>options?.name==='Добавьте сюда фото и видео!'?1:0};
  };
  try {
    await mkdir(join(root,'docs'));
    await writeFile(join(root,'docs/spb-2gis-discovery.json'),JSON.stringify({cards:[c],detailPending:[],assetPending:[{url:c.url,error:'old photo timeout'}],infoPending:[],errors:[]}));
    await writeFile(join(root,'docs/spb-2gis-observations.json'),JSON.stringify([{...c,photoError:'old photo timeout'}]));
    await retry2GisParallelBatch(root,[tab],[c.url]);
    const [observation]=await json(join(root,'docs/spb-2gis-observations.json'));
    assert.equal(observation.photoAvailability,'not-provided');
    assert.equal(observation.photoError,undefined);
    assert.deepEqual((await json(join(root,'docs/spb-2gis-discovery.json'))).assetPending,[]);
  } finally {await rm(root,{recursive:true,force:true});}
});
const json = async path => JSON.parse(await readFile(path,'utf8'));

test('a failed first tab keeps later successful observations and their queue changes',async()=>{
  const root=await mkdtemp(join(tmpdir(),'2gis-collector-'));
  const a=candidate('1'),b=candidate('2');
  try {
    await mkdir(join(root,'docs'));
    await writeFile(join(root,'docs/spb-2gis-discovery.json'),JSON.stringify({cards:[a,b],detailPending:[a,b],assetPending:[],infoPending:[],errors:[]}));
    await writeFile(join(root,'docs/spb-2gis-observations.json'),'[]');
    const failing={url:async()=>undefined,goto:async()=>{throw Error('mock navigation failure');}};
    await assert.rejects(collect2GisParallelBatch(root,[failing,readableTab(b)]),/mock navigation failure/);
    const observations=await json(join(root,'docs/spb-2gis-observations.json'));
    const queue=await json(join(root,'docs/spb-2gis-discovery.json'));
    assert.deepEqual(observations.map(o=>o.url),[b.url]);
    assert.deepEqual(queue.detailPending.map(c=>c.url),[a.url]);
    assert.equal(queue.status,'paused');
    await retry2GisParallelBatch(root,[readableTab(b)],[b.url]);
    assert.equal((await json(join(root,'docs/spb-2gis-observations.json'))).length,1);
    assert.deepEqual((await json(join(root,'docs/spb-2gis-discovery.json'))).detailPending.map(c=>c.url),[a.url]);
  } finally {await rm(root,{recursive:true,force:true});}
});
