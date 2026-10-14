import type {Place} from './places';
import type {CityId} from './cities';import type {WalkMode} from './walk-modes';import type {Bounds} from './catalog-contract';
import {siteJson} from './client-api';
export type CatalogMeta={revision:string;tileUrl:string;tileAttribution:string;cities:{id:CityId;counts:number;defaultEnd:Place}[]};
export const requestMetadata=()=>siteJson<CatalogMeta>('/api/catalog/meta');
export async function requestViewport(city:CityId,mode:WalkMode,bounds:Bounds,signal?:AbortSignal){
 const rows:Place[]=[];let after='',revision='';
 do{const params=new URLSearchParams({city,mode,bounds:bounds.join(','),after,revision});
 const page=await siteJson<{places:Place[];after:string;revision:string}>('/api/catalog/viewport?'+params,{signal});
 rows.push(...page.places);after=page.after;revision=page.revision;
 if(rows.length>100000)throw new Error('Слишком много мест. Приблизьте карту.');
 }while(after);return rows;
}
export const requestPlace=(city:CityId,mode:WalkMode,id:string)=>siteJson<Place>('/api/catalog/place?'+new URLSearchParams({city,mode,id}));
export const requestCorridor=(city:CityId,mode:WalkMode,shape:number[][])=>siteJson<Place[]>('/api/catalog/corridor',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({city,mode,shape})});
export const requestNearby=(city:CityId,center:Place)=>siteJson<(Place&{distanceFromPoint:number})[]>('/api/catalog/nearby?'+new URLSearchParams({city,lat:String(center.lat),lon:String(center.lon)}));
