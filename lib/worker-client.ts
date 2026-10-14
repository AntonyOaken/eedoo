import type {CityId} from './cities';import type {Place} from './places';import type {Walk} from './routing';import type {WalkMode} from './walk-modes';import type {RouteOption} from './alternatives';import {requestCorridor} from './catalog-client';
let worker:Worker|undefined,sequence=0;
const pending=new Map<number,{resolve:(value:any)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
function reset(message:string){worker?.terminate();worker=undefined;for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error(message));}pending.clear();}
function call<T>(task:string,city:CityId,payload:unknown):Promise<T>{
 if(typeof Worker==='undefined')return Promise.reject(new Error('Браузер не поддерживает локальный маршрутизатор.'));
 if(!worker){worker=new Worker(new URL('./routing.worker.ts',import.meta.url));worker.onmessage=({data})=>{const p=pending.get(data.id);if(!p)return;clearTimeout(p.timer);pending.delete(data.id);data.error?p.reject(new Error(data.error)):p.resolve(data.value);};worker.onerror=()=>reset('Не удалось загрузить локальный маршрутизатор. Повторите попытку.');}
 return new Promise<T>((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>reset('Расчёт маршрута занял слишком много времени. Повторите попытку.'),60000);pending.set(id,{resolve,reject,timer});worker!.postMessage({id,task,city,payload});});
}
export async function localWalk(start:Place,end:Place,mode:WalkMode,city:CityId){
 const path=await call<{shape:number[][]}>('path',city,{start,end});const catalog=await requestCorridor(city,mode,path.shape);
 return call<Walk>('walk',city,{start,end,mode,catalog});
}
export async function buildAlternatives(start:Place,end:Place,primary:Walk,city:CityId):Promise<RouteOption[]>{
 if(primary.mode==='food')return [{id:'primary',title:'Основной маршрут',walk:primary,via:[]}];
 const catalog=await requestCorridor(city,primary.mode,primary.shape);return call<RouteOption[]>('alternatives',city,{start,end,primary,catalog});
}
