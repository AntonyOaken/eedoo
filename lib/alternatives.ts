import {distance,type Place} from './places';
import {placesForMode,isWalkStopAvailable} from './walk-modes';
import type {CityId} from './cities';
import type {RouteCalculator} from './routing';
import {distributeStops,proximity,type Walk} from './routing';
import {buildScenicWalk,scenicBudget} from './scenic-routing';

export type RouteOption={id:string;title:string;walk:Walk;via:Place[]};
export const primaryOption=(walk:Walk):RouteOption=>({id:'primary',title:'Основной маршрут',walk,via:[]});
export const totalMinutes=(walk:Walk)=>walk.walkingMinutes+walk.stopMinutes;
export function comparison(option:RouteOption,primary:Walk){return {distance:option.walk.distance-primary.distance,walkingMinutes:option.walk.walkingMinutes-primary.walkingMinutes,totalMinutes:totalMinutes(option.walk)-totalMinutes(primary),newPlaces:option.walk.stops.filter(p=>!primary.stops.some(s=>s.id===p.id))};}

function distinct(a:Walk,b:Walk){
 const step=Math.max(1,Math.ceil(a.shape.length/40));let different=0,total=0;
 for(let i=0;i<a.shape.length;i+=step){total++;if(proximity({id:'sample',name:'',lat:a.shape[i][0],lon:a.shape[i][1]},b.shape).distance>120)different++;}
 return different/total>=.18;
}
function finish(start:Place,end:Place,anchors:Place[],required:Place[],primary:Walk,localRoute:RouteCalculator,catalog:Place[]):Walk {
 const path=localRoute([start,...anchors,end]);
 const bounds=path.shape.reduce((b,p)=>[Math.min(b[0],p[0]),Math.min(b[1],p[1]),Math.max(b[2],p[0]),Math.max(b[3],p[1])],[90,180,-90,-180]);
 const candidates=catalog.filter(p=>p.lat>=bounds[0]-.001&&p.lat<=bounds[2]+.001&&p.lon>=bounds[1]-.002&&p.lon<=bounds[3]+.002&&distance(p,start)>100&&distance(p,end)>100&&!required.some(r=>distance(p,r)<150)).map(p=>({p,...proximity(p,path.shape)})).filter(p=>p.distance<60);
 const nearby=distributeStops(candidates,path.shape,Math.min(10,Math.max(3,Math.ceil(path.distance/900)))).map(c=>c.p);
 const stops=[...required,...nearby].sort((a,b)=>proximity(a,path.shape).order-proximity(b,path.shape).order);
 // Visit numbered places in their order along the candidate route.
 const waypoints=[...anchors,...nearby].filter((p,i,all)=>all.findIndex(q=>distance(p,q)<20)===i).sort((a,b)=>proximity(a,path.shape).order-proximity(b,path.shape).order);
 const result=localRoute([start,...waypoints,end]);
 return {...result,stops:stops.sort((a,b)=>proximity(a,result.shape).order-proximity(b,result.shape).order),stopMinutes:stops.reduce((sum,p)=>sum+(p.minutes||5),0),extraMinutes:Math.max(0,result.walkingMinutes-primary.walkingMinutes),mode:primary.mode};
}

export async function buildAlternativesWithRouter(start:Place,end:Place,primary:Walk,localRoute:RouteCalculator,source:Place[]):Promise<RouteOption[]>{
 if(primary.mode==='food')return [primaryOption(primary)];
 const catalog=placesForMode(source,primary.mode).filter(p=>isWalkStopAvailable(p,primary.mode));
 const options=[primaryOption(primary)];
 const add=(option:RouteOption,maxDistance:number)=>{if(option.walk.distance<=maxDistance&&options.every(existing=>distinct(option.walk,existing.walk)))options.push(option);};
 if(primary.mode==='scenic'){
  const base=primary.scenicBase||localRoute([start,end]);
  const discouraged=new Set(primary.stops.map(p=>p.id));
  for(let attempt=0;attempt<2;attempt++){
   const walk=await buildScenicWalk(start,end,base,localRoute,catalog,discouraged);
   const via=walk.stops.find(p=>!primary.stops.some(s=>s.id===p.id));
   add({id:'scenic-'+attempt,title:via?'Через '+via.name:'Другой путь',walk,via:via?[via]:[]},scenicBudget(base.distance));
   walk.stops.forEach(p=>discouraged.add(p.id));
  }
  return options;
 }
 const mainIds=new Set(primary.stops.map(p=>p.id));
 const candidates=catalog.filter(p=>!mainIds.has(p.id)&&distance(p,start)>350&&distance(p,end)>350).map(p=>({p,...proximity(p,primary.shape)})).filter(c=>c.distance>180&&c.distance<(primary.mode==='photo'?500:1800)).sort((a,b)=>((b.p.priority||1)*100-b.distance/4)-((a.p.priority||1)*100-a.distance/4));
 // A bounded set keeps mobile calculation predictable; prefer landmarks over
 // nearby plaques, and do not present nearly identical lines as alternatives.
 for(const candidate of candidates.slice(0,8)){
  if(options.length>=3)break;
  await new Promise<void>(resolve=>setTimeout(resolve,0));
  try{const walk=finish(start,end,[candidate.p],[candidate.p],primary,localRoute,catalog);add({id:'via-'+candidate.p.id,title:'Через '+candidate.p.name,walk,via:[candidate.p]},primary.distance+Math.min(5000,primary.distance*.8+1500));}catch{/* Skip inaccessible places. */}
 }
 return options;
}
