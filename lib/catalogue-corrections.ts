import type {Place} from './places';
export type CatalogueCorrection={
 patch?:Partial<Omit<Place,'id'>>;
 removeFields?:(keyof Omit<Place,'id'>)[];
 hidden?:boolean;
 checkedAt?:string;
 verifiedFields?:string[];
 reason:string;
};
/** Corrections live outside imported snapshots and are always applied last. */
export function applyCorrections(rows:Place[],corrections:Record<string,CatalogueCorrection>,{matchSourceIds=true}:{matchSourceIds?:boolean}={}):Place[]{
 return rows.flatMap(place=>{
  const keys=[...new Set([...(matchSourceIds?[place.osmId]:[]),place.id].filter((key):key is string=>!!key))];
  let next:Place={...place};
  for(const key of keys){
   const correction=corrections[key];if(!correction)continue;if(correction.hidden)return [];
   next={...next,...correction.patch,id:place.id};
   for(const field of correction.removeFields||[])delete next[field];
   if(correction.checkedAt){next.checkedAt=correction.checkedAt;next.verifiedFields=correction.verifiedFields||[];}
  }
  return [next];
 });
}
