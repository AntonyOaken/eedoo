/** Public 2GIS collection through documented cua_repl APIs.
 * Run awaited batches, checkpoint after EVERY card, never background promises.
 * Only DOM-observed links and content. No HTTP or frontend state access.
 */
import { Buffer } from 'node:buffer';
import { readFile, writeFile, rename, stat, mkdir, copyFile } from 'node:fs/promises';

const rawCardDOM = () => {
  const h = document.querySelector('h1');
  const all = document.body.innerText;
  const text = h ? all.slice(all.indexOf(h.innerText)).split('Нашли ошибку в данных?')[0] : all;
  const links = [...document.querySelectorAll('a[href]')];
  return {
    url: location.href.split('?')[0], name: h?.innerText.trim(), text,
    route: links.find(a => a.innerText === 'Маршрут')?.href,
    links: links.filter(a => /^(tel:|mailto:)/.test(a.href) || /^[\wа-яА-Я.-]+\.[a-zа-я]{2,}(?:\/|$)/.test(a.innerText) || ['ВКонтакте','Telegram','WhatsApp','Instagram','YouTube','Max'].includes(a.innerText)).map(a => ({text:a.innerText.trim(),url:a.href})),
    addresses: links.filter(a => /\/spb\/geo\/\d+/.test(a.href)).map(a => a.innerText),
    photos: [...document.querySelectorAll('[role=img][style]')].flatMap(e => [...e.style.backgroundImage.matchAll(/url\("([^"\n]+)"\)/g)].map(m => m[1])).filter(s => s.includes('photo.2gis.com')),
    gallery: links.find(a => /\/gallery\//.test(a.href))?.href,
    info: links.find(a => a.innerText === 'Инфо')?.href,
    rubricNames: links.filter(a=>/\/rubricId\//.test(a.href)).map(a=>a.innerText.trim()).filter(Boolean),
  };
};
const unwrapLink = value => {
  let s = value;
  if (s.startsWith('https://link.2gis.ru/4.2/')) {
    try { s = Buffer.from(decodeURIComponent(s.split('/').pop()),'base64').toString('utf8').split('\n')[0]; }
    catch { return ''; }
  }
  if (/link\.2gis\.ru\/1\.2\//.test(s) && s.includes('?http')) s = s.slice(s.indexOf('?')+1);
  return s;
};
const checkBlock = async tab => {
  const body = await tab.playwright.evaluate(() => document.body?.innerText || '');
  if (/Verify you are human|не робот|Вы робот|проверку безопасности|Доступ ограничен|Checking your browser/i.test(body)) throw Error('Site verification block');
};
const navigate = async(tab,url) => {
  try { await tab.goto(url); }
  catch(e) {
    // Navigation can finish after the browser reports a protocol deadline.
    // Continue only from the same observed URL and a readable visible page.
    if(!/timed out|timeout/i.test(String(e)) || (await tab.url())!==url)throw e;
    await tab.playwright.domSnapshot();
    await checkBlock(tab);
  }
};
export const collect2GisCard = async(c,tab) => {
  if ((await tab.url()) !== c.url) await navigate(tab,c.url);
  await tab.playwright.domSnapshot();
  await checkBlock(tab);
  await tab.playwright.getByRole('heading',{level:1}).waitFor({state:'visible',timeoutMs:10000});
  const statuses = await tab.playwright.evaluate(() => document.body.innerText.split(/[\n\u200b]/).map(s=>s.trim()).filter(s=>/^(?:Сегодня|Ежедневно|Откроется|Круглосуточно)/.test(s)));
  for (const status of statuses.slice(0,1)) {
    const toggle = tab.playwright.getByText(status,{exact:true});
    if (await toggle.count() === 1) { await toggle.click(); await tab.playwright.domSnapshot(); }
  }
  const ph = tab.playwright.getByRole('button',{name:/^Показать телефон/});
  if (await ph.count() === 1) { await ph.click(); await tab.playwright.domSnapshot(); }
  const o = await tab.playwright.evaluate(rawCardDOM);
  const candidateId=c.url.split('/').pop();
  const observedId=o.url.split('/').pop();
  const relatedIds=new Set((c.relatedIds||[]).map(item=>String(item.id)));
  if (!o.name || (observedId !== candidateId && !relatedIds.has(observedId))) throw Error('Observed card identity disagrees with candidate');
  if(observedId!==candidateId){o.observedUrl=o.url;o.url=c.url;}
  Object.assign(o,{category:c.category,searchUrl:c.searchUrl,coordinates:c.coordinates,observedAt:new Date().toISOString()});
  o.links.forEach(l=>l.url=unwrapLink(l.url));
  await checkBlock(tab);
  if (o.info) {
    try {
      if((await tab.url())!==o.info)await navigate(tab,o.info);
      await tab.playwright.domSnapshot();
      await tab.playwright.getByText('В справочнике',{exact:true}).waitFor({state:'visible',timeoutMs:8000});
      const info=await tab.playwright.evaluate(rawCardDOM);
      if(![candidateId,observedId].includes(info.url.match(/\/(?:firm|geo)\/(\d+)/)?.[1]))throw Error('Info card identity disagrees with candidate');
      const structuredStart=info.text.search(/(?:Способы оплаты|Доступная среда|В справочнике|Инфраструктура)\n/);
      o.infoText=structuredStart>=0 ? info.text.slice(structuredStart) : ''; o.rubricNames=info.rubricNames; o.photos=[...new Set([...o.photos,...info.photos])];
    } catch(e) {
      await checkBlock(tab);
      o.infoError=String(e).slice(0,200);
    }
  }
  const src = o.photos.at(-1);
  if (src) {
    try {
      await navigate(tab,src); await tab.playwright.domSnapshot();
      const img=tab.playwright.getByRole('img').first();
      await img.waitFor({state:'visible',timeoutMs:8000});
      o.download=await img.downloadMedia({timeoutMs:12000});
      o.photo={url:src,sourceUrl:o.gallery||o.url,author:'Фото из 2ГИС'};
    } catch(e) { await checkBlock(tab); o.photoError=String(e).slice(0,200); }
  } else if(o.gallery) {
    try {
      await navigate(tab,o.gallery); await tab.playwright.domSnapshot();
      const owner=tab.playwright.locator('label[title="От владельца"]');
      if(await owner.count()) { await owner.click(); await tab.playwright.domSnapshot(); }
      const emptyGallery=tab.playwright.getByRole('button',{name:'Добавьте сюда фото и видео!',exact:true});
      await tab.playwright.getByRole('img',{name:'Фото',exact:true}).or(emptyGallery).first().waitFor({state:'visible',timeoutMs:12000});
      if(await emptyGallery.count()===1) {
        o.photoAvailability='not-provided';
      } else {
      const img=tab.playwright.getByRole('img',{name:'Фото',exact:true}).last();
      await img.waitFor({state:'visible',timeoutMs:12000});
      const imageUrl=await img.getAttribute('src');
      o.download=await img.downloadMedia({timeoutMs:12000});
      o.photo={url:imageUrl,sourceUrl:await tab.url(),author:await tab.playwright.evaluate(()=>document.body.innerText.includes('Фотография от владельца')?'Владелец':'Фото из 2ГИС')};
      }
    } catch(e) { await checkBlock(tab); o.photoError=String(e).slice(0,200); }
  }
  if(o.download) {
    const deadline=Date.now()+5000;
    let available=false;
    do {
      available=await stat(o.download).then(s=>s.size>0).catch(()=>false);
      if(available)break;
      await new Promise(resolve=>setTimeout(resolve,250));
    } while(Date.now()<deadline);
    if(!available){o.photoError='Browser download returned a missing or empty file';delete o.download;}
    else {
      // Preserve the image outside temporary browser download folders.
      const directory='/home/oai/share/spb-photo-checkpoints';
      await mkdir(directory,{recursive:true});
      const checkpoint=directory+'/'+c.url.split('/').pop()+'.jpg';
      try {await copyFile(o.download,checkpoint);o.download=checkpoint;}
      catch(e){o.photoError='Could not checkpoint browser photo: '+String(e).slice(0,160);delete o.download;}
    }
  }
  return o;
};
const saveJSON=async(path,value)=>{
  const temp=path+'.tmp-'+Date.now()+'-'+Math.random().toString(36).slice(2);
  await writeFile(temp,JSON.stringify(value,null,2)+'\n');
  try { await rename(temp,path); } catch (e) { if(e.code!=='ENOENT')throw e; await writeFile(path,JSON.stringify(value,null,2)+'\n'); }
};
export const collect2GisBatch = async(root,tab,count=5,onProgress=()=>{})=>{
  const discovery=JSON.parse(await readFile(root+'/docs/spb-2gis-discovery.json','utf8'));
  const observations=JSON.parse(await readFile(root+'/docs/spb-2gis-observations.json','utf8'));
  const results=[];
  const objectId=url=>new URL(url).pathname.match(/\/(?:firm|geo)\/(\d+)/)?.[1];
  const done=new Set(observations.map(o=>objectId(o.url)));
  discovery.detailPending=discovery.detailPending.filter(c=>!done.has(objectId(c.url)));
  for(let i=0;i<count && discovery.detailPending.length;i++) {
    const candidate=discovery.detailPending[0];
    try {
      const card=await collect2GisCard(candidate,tab);
      observations.push(card);
      // Persist observation before removing from queue. A restart reconciles duplicates.
      await saveJSON(root+'/docs/spb-2gis-observations.json',observations);
      discovery.detailPending.shift();
      for(const [field,error] of [['assetPending',card.photoError],['infoPending',card.infoError]]) {
        discovery[field]=(discovery[field]||[]).filter(item=>objectId(item.url)!==objectId(card.url));
        if(error)discovery[field].push({url:card.url,name:card.name,error,gallery:card.gallery});
      }
      discovery.errors=(discovery.errors||[]).filter(item=>objectId(item.url)!==objectId(card.url));
      discovery.status='partial'; discovery.pausedReason='Awaited batches; checkpoint saved after each card. No background process.';
      discovery.lastCheckpointAt=new Date().toISOString();
      await saveJSON(root+'/docs/spb-2gis-discovery.json',discovery);
      const result={name:card.name,remaining:discovery.detailPending.length,photo:!!card.download,photoError:card.photoError};
      results.push(result); onProgress(result);
    } catch(e) {
      discovery.status='paused'; discovery.pausedReason=String(e).slice(0,400);
      discovery.lastCheckpointAt=new Date().toISOString();
      await saveJSON(root+'/docs/spb-2gis-discovery.json',discovery);
      throw e;
    }
  }
  return results;
};

const parallelState = new Map();
const collectionState = async root => {
  if(!parallelState.has(root)) parallelState.set(root, {
    discovery:JSON.parse(await readFile(root+'/docs/spb-2gis-discovery.json','utf8')),
    observations:JSON.parse(await readFile(root+'/docs/spb-2gis-observations.json','utf8')),
  });
  return parallelState.get(root);
};
export const collect2GisParallelBatch = async(root,tabs,onProgress=()=>{})=>{
  const {discovery,observations}=await collectionState(root);
  const results=[];
  const objectId=url=>new URL(url).pathname.match(/\/(?:firm|geo)\/(\d+)/)?.[1];
  const done=new Set(observations.map(o=>objectId(o.url)));
  discovery.detailPending=discovery.detailPending.filter(c=>!done.has(objectId(c.url)));
  const candidates=discovery.detailPending.slice(0,tabs.length);
  const collected=await Promise.allSettled(candidates.map((candidate,i)=>collect2GisCard(candidate,tabs[i])));
  let batchError;
  for(let i=0;i<candidates.length;i++) {
    const candidate=candidates[i];
    try {
      if(collected[i].status!=="fulfilled")throw collected[i].reason;
      const card=collected[i].value;
      observations.push(card);
      // Persist observation before removing from queue. A restart reconciles duplicates.
      await saveJSON(root+'/docs/spb-2gis-observations.json',observations);
      discovery.detailPending=discovery.detailPending.filter(c=>objectId(c.url)!==objectId(candidate.url));
      for(const [field,error] of [['assetPending',card.photoError],['infoPending',card.infoError]]) {
        discovery[field]=(discovery[field]||[]).filter(item=>objectId(item.url)!==objectId(card.url));
        if(error)discovery[field].push({url:card.url,name:card.name,error,gallery:card.gallery});
      }
      discovery.errors=(discovery.errors||[]).filter(item=>objectId(item.url)!==objectId(card.url));
      discovery.status='partial'; discovery.pausedReason='Awaited batches; checkpoint saved after each card. No background process.';
      discovery.lastCheckpointAt=new Date().toISOString();
      await saveJSON(root+'/docs/spb-2gis-discovery.json',discovery);
      const result={name:card.name,remaining:discovery.detailPending.length,photo:!!card.download,photoError:card.photoError};
      results.push(result); onProgress(result);
    } catch(e) {
      discovery.status='paused'; discovery.pausedReason=String(e).slice(0,400);
      discovery.lastCheckpointAt=new Date().toISOString();
      await saveJSON(root+'/docs/spb-2gis-discovery.json',discovery);
      batchError ||= e;
    }
  }
  if(batchError) {
    discovery.status='paused'; discovery.pausedReason=String(batchError).slice(0,400);
    await saveJSON(root+'/docs/spb-2gis-discovery.json',discovery);
    throw batchError;
  }
  return results;
};

/** Retry specific checkpointed cards without adding duplicate observations. */
export const retry2GisParallelBatch = async(root,tabs,urls)=>{
  const {discovery,observations}=await collectionState(root);
  const id=url=>new URL(url).pathname.match(/\/(?:firm|geo)\/(\d+)/)?.[1];
  const candidates=urls.slice(0,tabs.length).map(url=>discovery.cards.find(c=>id(c.url)===id(url)));
  if(candidates.some(c=>!c))throw Error('Retry requires a saved discovery candidate');
  const collected=await Promise.allSettled(candidates.map((c,i)=>collect2GisCard(c,tabs[i])));
  const results=[];
  let batchError;
  for(let i=0;i<candidates.length;i++) {
    if(collected[i].status!=='fulfilled'){batchError ||= collected[i].reason;continue;}
    const card=collected[i].value;
    const index=observations.findIndex(o=>id(o.url)===id(card.url));
    if(index<0)throw Error('Retry card must already have a saved observation');
    observations[index]={...observations[index],...card};
    for(const field of ['photoError','infoError'])if(!card[field])delete observations[index][field];
    await saveJSON(root+'/docs/spb-2gis-observations.json',observations);
    for(const [field,error] of [['assetPending',card.photoError],['infoPending',card.infoError]]) {
      discovery[field]=(discovery[field]||[]).filter(item=>id(item.url)!==id(card.url));
      if(error)discovery[field].push({url:card.url,name:card.name,error,gallery:card.gallery});
    }
    discovery.lastCheckpointAt=new Date().toISOString();
    discovery.status='partial'; discovery.pausedReason='Awaited retry batch; observations saved before queue changes.';
    await saveJSON(root+'/docs/spb-2gis-discovery.json',discovery);
    results.push({name:card.name,photo:!!card.download,photoError:card.photoError,infoError:card.infoError});
  }
  if(batchError){
    discovery.status='paused';discovery.pausedReason=String(batchError).slice(0,400);
    await saveJSON(root+'/docs/spb-2gis-discovery.json',discovery);
    throw batchError;
  }
  return results;
};
