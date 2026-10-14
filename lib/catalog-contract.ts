import {CITIES,getCity,inCity,type CityId} from './cities';
import {WALK_MODES,type WalkMode} from './walk-modes';
import type {Place} from './places';
export type CatalogSnapshot={format:1;source:string;cities:Record<CityId,Record<WalkMode,Place[]>>};
export function validateSnapshot(value:unknown):asserts value is CatalogSnapshot{
 const data=value as CatalogSnapshot;
 if(data?.format!==1||typeof data.source!=='string'||!data.source||data.source.length>200)throw new Error('Invalid catalog manifest');
 for(const city of CITIES)for(const mode of WALK_MODES){
  const rows=data.cities?.[city.id]?.[mode];
  if(!Array.isArray(rows)||!rows.length||rows.length>100000)throw new Error('Missing or oversized catalog: '+city.id+'/'+mode);
  const ids=new Set<string>();
  for(const row of rows){
   if(typeof row.id!=='string'||!row.id||row.id.length>200||ids.has(row.id)||typeof row.name!=='string'||!row.name.trim()||row.name.length>500||!inCity(row,getCity(city.id)))throw new Error('Invalid place in '+city.id+'/'+mode);
   ids.add(row.id);
  }
 }
}
export function thinPlace(p:Place):Place{return {id:p.id,name:p.name,lat:p.lat,lon:p.lon,category:p.category,priority:p.priority,hasPhoto:!!p.photo,minutes:p.minutes,businessStatus:p.businessStatus,openingHours:p.openingHours};}
export type Bounds=[number,number,number,number];
export function boundsForShape(shape:number[][],meters=2000):Bounds{
 if(shape.length<2||shape.length>100000||shape.some(p=>p.length!==2||p.some(v=>!Number.isFinite(v))))throw new Error('Invalid route shape');
 const b=shape.reduce((b,p)=>[Math.min(b[0],p[0]),Math.min(b[1],p[1]),Math.max(b[2],p[0]),Math.max(b[3],p[1])],[90,180,-90,-180]);
 const lat=meters/110000,lon=lat/Math.max(.05,Math.cos(Math.max(Math.abs(b[0]),Math.abs(b[2]))*Math.PI/180));
 return [b[0]-lat,b[1]-lon,b[2]+lat,b[3]+lon];
}

