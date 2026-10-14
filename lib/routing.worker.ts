import {createLocalRouter,type GraphSnapshot} from './local-routing';import {buildWalk} from './routing';import {buildAlternativesWithRouter} from './alternatives';import type {CityId} from './cities';
const scope=self as unknown as {onmessage:((e:MessageEvent)=>void)|null;postMessage:(value:unknown)=>void};
const routers=new Map<CityId,Promise<ReturnType<typeof createLocalRouter>>>();
function router(city:CityId){
 if(!['spb','kurgan','phuket'].includes(city))throw new Error('Выберите город из доступных.');
 if(!routers.has(city)){const promise=fetch('/vendor/walking-graphs/'+city+'-20261005.json',{signal:AbortSignal.timeout(20000)}).then(async r=>{if(!r.ok)throw new Error('Не удалось загрузить сеть улиц.');return createLocalRouter(await r.json() as GraphSnapshot);}).catch(e=>{routers.delete(city);throw e;});routers.set(city,promise);}
 return routers.get(city)!;
}
let queue=Promise.resolve();
scope.onmessage=({data})=>{queue=queue.then(async()=>{try{const calc=await router(data.city),p=data.payload;const value=data.task==='path'?calc([p.start,p.end]):data.task==='walk'?await buildWalk(p.start,p.end,p.mode,calc,p.catalog):data.task==='alternatives'?await buildAlternativesWithRouter(p.start,p.end,p.primary,calc,p.catalog):(()=>{throw new Error('Неизвестный расчёт.');})();scope.postMessage({id:data.id,value});}catch(e){scope.postMessage({id:data.id,error:e instanceof Error?e.message:'Не удалось построить маршрут.'});}});};
