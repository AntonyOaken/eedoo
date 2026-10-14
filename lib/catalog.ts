import CITY from './city-places.json';
import FOOD from './food-places.json';
import SEED from './seed-details.json';
import CORRECTIONS from './catalogue-corrections.json';
import {applyCorrections,type CatalogueCorrection} from './catalogue-corrections';
import {PLACES,distance,inPetersburg,type Place} from './places';
const food=(id:CityId)=>(FOOD[id].places as Place[]).filter(p=>inCity(p,getCity(id)));

const details=SEED as Record<string,Partial<Place>>;
export const CATALOG_DATE=CITY.updatedAt;
const spbFood=food('spb'),foodIds=new Set(spbFood.map(p=>p.id));
const rows=(CITY.places as Place[]).filter(p=>inPetersburg(p)&&!foodIds.has(p.id));
const baseSpb:Place[]=[...PLACES.map(p=>{
 const enrichment=rows.filter(row=>distance(row,p)<170&&(row.name.toLowerCase().includes(p.name.toLowerCase())||p.name.toLowerCase().includes(row.name.toLowerCase()))).sort((a,b)=>distance(a,p)-distance(b,p))[0];
 return {...enrichment,...p,...details[p.id],osmId:enrichment?.id,priority:10};
}),...rows.filter(row=>!PLACES.some(p=>distance(row,p)<150&&(row.name.toLowerCase().includes(p.name.toLowerCase())||p.name.toLowerCase().includes(row.name.toLowerCase())))),...spbFood];

const corrections=CORRECTIONS as Record<string,CatalogueCorrection>;
export const CATALOG:Place[]=applyCorrections(baseSpb,corrections);
import OTHER from './other-city-places.json';
import GOOGLE_KURGAN from './kurgan-google-places.json';
import TWO_GIS_KURGAN from './kurgan-2gis-places.json';
import TWO_GIS_SPB from './spb-2gis-places.json';
import type {WalkMode} from './walk-modes';
import {getCity,inCity,type CityId} from './cities';
export function getCatalog(id:CityId,mode:WalkMode='direct'):Place[]{
 if(id==='spb'){
  if(!['direct','scenic'].includes(mode))return CATALOG;
  return [...applyCorrections(CATALOG,TWO_GIS_SPB.corrections as Record<string,CatalogueCorrection>,{matchSourceIds:false}),...(TWO_GIS_SPB.places as Place[]).filter(p=>inCity(p,getCity('spb')))];
 }
 const city=getCity(id),venues=food(id),ids=new Set(venues.map(p=>p.id));
 const base=applyCorrections([...(OTHER[id].places as Place[]).filter(p=>inCity(p,city)&&!ids.has(p.id)),...venues],corrections);
 if(id!=='kurgan'||!['direct','scenic'].includes(mode))return base;
 const google=[...applyCorrections(base,GOOGLE_KURGAN.corrections as Record<string,CatalogueCorrection>),...(GOOGLE_KURGAN.places as Place[]).filter(p=>inCity(p,city)&&!ids.has(p.id))];
 // Reviewed local 2GIS facts are authoritative for Kurgan; missing fields keep earlier values.
 return [...applyCorrections(google,TWO_GIS_KURGAN.corrections as Record<string,CatalogueCorrection>),...(TWO_GIS_KURGAN.places as Place[]).filter(p=>inCity(p,city)&&!ids.has(p.id))];
}
export function defaultEnd(id:CityId):Place{if(id==='spb')return getCatalog(id).find(p=>p.id==='hermitage')!;const city=getCity(id),rows=getCatalog(id);const matching=rows.filter(p=>p.name.toLowerCase().includes(city.defaultDestination));return matching.find(p=>p.category==='Музей')||matching[0]||rows.find(p=>distance(p,city.example)>300&&distance(p,city.example)<3000)||city.example;}
