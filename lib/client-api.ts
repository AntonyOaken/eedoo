import type {Place} from './places';import type {Walk} from './routing';import type {WalkMode} from './walk-modes';import {WALK_MODES} from './walk-modes';import type {SearchPlace} from './geocoding';import {getCity,inCity,type CityId} from './cities';import {distance} from './places';
export class SiteApiUnavailable extends Error{constructor(message:string){super(message);this.name='SiteApiUnavailable';}}
export async function siteJson<T>(path:string,options:RequestInit={}):Promise<T>{
 let response:Response;try{response=await fetch(path,{...options,signal:options.signal??AbortSignal.timeout(20000),credentials:'same-origin',headers:{Accept:'application/json',...options.headers}});}catch(e){if(options.signal?.aborted)throw e;throw new SiteApiUnavailable('Не удалось связаться с приложением.');}
 if(!response.headers.get('content-type')?.includes('application/json'))throw new SiteApiUnavailable('Сервис вернул некорректный ответ.');
 const data=await response.json();if(response.status>=500)throw new SiteApiUnavailable('Сервис временно недоступен.');if(!response.ok)throw new Error(data.error||'Запрос не выполнен.');return data as T;
}
export async function requestWalk(start:Place,end:Place,mode:WalkMode,cityId:CityId='spb'):Promise<Walk>{
 const city=getCity(cityId);if(!WALK_MODES.includes(mode)||!inCity(start,city)||!inCity(end,city))throw new Error('Выберите формат прогулки и точки в выбранном городе.');
 if(distance(start,end)<80||distance(start,end)>15000)throw new Error('Выберите точки на расстоянии от 80 м до 15 км.');
 try{return await siteJson<Walk>('/api/walk',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({start,end,mode,city:cityId})});}
 catch(e){if(!(e instanceof SiteApiUnavailable))throw e;const {localWalk}=await import('./worker-client');return localWalk(start,end,mode,cityId);}
}
export const requestSearch=(q:string,city:CityId='spb')=>siteJson<SearchPlace[]>('/api/search?'+new URLSearchParams({q,city}));
