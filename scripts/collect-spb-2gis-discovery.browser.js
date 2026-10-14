/** Continue the public search via observed pagination links. No guessed URLs.
 * Keyboard navigation avoids map clicks while 2GIS changes its layout.
 * Only place facts in DOM link URLs are retained, never analytics payloads.
 */
import { Buffer } from 'node:buffer';
import { readFile, writeFile, rename } from 'node:fs/promises';
const saveJSON=async(path,value)=>{const temp=path+'.tmp-'+Date.now()+'-'+Math.random().toString(36).slice(2);await writeFile(temp,JSON.stringify(value,null,2)+'\n');try { await rename(temp,path); } catch (e) { if(e.code!=='ENOENT')throw e; await writeFile(path,JSON.stringify(value,null,2)+'\n'); }};
const searchDOM=()=>{
  const links=[...document.querySelectorAll('a[href]')];
  return {
    url:location.href,
    count:document.querySelector('h2')?.innerText,
    body:document.body.innerText.slice(0,800),
    cards:links.filter(a=>/^\/(?:spb\/)?(?:firm|geo)\/\d+$/.test(new URL(a.href).pathname) && new URL(a.href).searchParams.has('stat')).map(a=>({name:a.innerText.trim(),text:a.parentElement.parentElement.innerText,url:a.href})),
    pages:links.filter(a=>/^\d+$/.test(a.innerText.trim())&&/\/page\/\d+/.test(a.href)).map(a=>({text:a.innerText.trim(),url:a.href})),
  };
};
export const collectDiscoveryBatch=async(root,tab,count=15,onProgress=()=>{},direction=1)=>{
  const path=root+'/docs/spb-2gis-discovery.json';
  const q=JSON.parse(await readFile(path,'utf8'));
  const done=new Set(q.pages.map(p=>p.url));
  const known=new Set(q.cards.map(c=>c.url));
  const results=[];
  for(let i=0;i<count;i++) {
    await tab.playwright.domSnapshot();
    const dom=await tab.playwright.evaluate(searchDOM);
    if(/Verify you are human|не робот|Вы робот|Доступ ограничен|Checking your browser/i.test(dom.body))throw Error('Site verification block');
    const actualPage=+(dom.url.match(/\/page\/(\d+)/)?.[1]||1);
    const entry=q.pending.find(p=>+(p.url.match(/\/page\/(\d+)/)?.[1]||1)===actualPage);
    if(!entry)throw Error('Current page does not match observed discovery frontier');
    const cards=dom.cards.map(c=>{
      const u=new URL(c.url);
      let facts={};
      try {const stat=JSON.parse(Buffer.from(u.searchParams.get('stat'),'base64').toString('utf8'));const item=stat.placeItem||{};facts={coordinates:item.geoPosition,rubric:item.mainRubric,relatedIds:item.hybridEntities};}catch{}
      u.search='';
      return {...c,url:u.href,category:entry.category,searchUrl:entry.url,...facts};
    });
    if(cards.length===0)throw Error('No DOM-observed search cards; page not recorded');
    let added=0;
    for(const c of cards)if(!known.has(c.url)){q.cards.push(c);q.detailPending.push(c);known.add(c.url);added++;}
    q.pages.push({url:entry.url,category:entry.category,count:dom.count?.replace(/\D/g,''),cardIds:cards.map(c=>c.url.split('/').pop()),pages:dom.pages.map(p=>p.url),observedAt:new Date().toISOString()});
    done.add(entry.url);
    q.pending=q.pending.filter(p=>p.url!==entry.url);
    for(const p of dom.pages)if(+p.text>actualPage&&!done.has(p.url)&&!q.pending.some(item=>item.url===p.url))q.pending.push({url:p.url,category:entry.category});
    q.status='partial';q.lastCheckpointAt=new Date().toISOString();q.pausedReason='Awaited batches; checkpoint saved after each search page and card. No background process.';
    await saveJSON(path,q);
    const result={page:actualPage,newCards:added,totalCards:q.cards.length};results.push(result);onProgress(result);
    const next=dom.pages.filter(p=>+p.text===actualPage+direction)[0];
    if(!next)break;
    if(next){
      const previousCard=dom.cards[Math.floor(dom.cards.length/2)];
      await tab.playwright.getByRole('link',{name:next.text,exact:true}).press('Enter');await tab.playwright.waitForURL('**/page/'+next.text+'**',{timeoutMs:5000});
      if(previousCard) await tab.playwright.locator('a[href*="'+new URL(previousCard.url).pathname+'?stat="]').waitFor({state:'hidden',timeoutMs:10000});
    }
  }
  return results;
};
