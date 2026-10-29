import {distance,type Place} from './places';
import {placesForMode,isWalkStopAvailable,emptyModeNote} from './walk-modes';
import type {RouteCalculator,Walk} from './routing';

type Path=ReturnType<RouteCalculator>;
type Calculate=(points:Place[])=>Path|Promise<Path>;
export const SCENIC_LIMITS={step:500,corridor:800,ratio:1.4,extra:2000,spacing:180,backtrack:80} as const;
export const scenicBudget=(baseDistance:number)=>Math.min(baseDistance*SCENIC_LIMITS.ratio,baseDistance+SCENIC_LIMITS.extra);
const point=(p:number[],id='search'):Place=>({id,name:'Точка пути',lat:p[0],lon:p[1]});
function lengths(shape:number[][]){const out=[0];for(let i=1;i<shape.length;i++)out.push(out[i-1]+distance(point(shape[i-1]),point(shape[i])));return out;}

// Progress is measured in metres along the reference, including within an edge.
function project(p:Place,shape:number[][],cumulative:number[]){
 let best=Infinity,progress=0;const cos=Math.cos(p.lat*Math.PI/180);
 for(let i=1;i<shape.length;i++){
  const a=shape[i-1],b=shape[i],dx=(b[1]-a[1])*cos,dy=b[0]-a[0];
  const t=Math.max(0,Math.min(1,((p.lon-a[1])*cos*dx+(p.lat-a[0])*dy)/(dx*dx+dy*dy||1)));
  const d=distance(p,{lat:a[0]+dy*t,lon:a[1]+(b[1]-a[1])*t});
  if(d<best){best=d;progress=cumulative[i-1]+t*(cumulative[i]-cumulative[i-1]);}
 }
 return {distance:best,progress};
}
function originAt(path:Path,at:number,cumulative:number[]){
 const total=cumulative.at(-1)||1;let i=1;while(i<cumulative.length-1&&cumulative[i]<at)i++;
 const t=Math.max(0,Math.min(1,(at-cumulative[i-1])/(cumulative[i]-cumulative[i-1]||1)));
 const a=path.shape[i-1],b=path.shape[i],p=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
 return {p:point(p),prefix:[...path.shape.slice(0,i),p],distance:path.distance*Math.min(1,at/total),minutes:path.walkingMinutes*Math.min(1,at/total)};
}

// Search from each accepted stop, advancing along its remaining route through
// empty areas. Every proposal reserves the complete pedestrian return to B.
export async function buildScenicWalk(start:Place,end:Place,base:Path,calculate:Calculate,catalog:Place[],discouragedIds:Iterable<string>=[]):Promise<Walk>{
 const referenceLengths=lengths(base.shape),referenceTotal=referenceLengths.at(-1)||0;
 if(base.shape.length<2||!referenceTotal)throw new Error('Не удалось построить пешеходный путь.');
 const budget=scenicBudget(base.distance),discouraged=new Set(discouragedIds);
 const candidates=placesForMode(catalog,'scenic').filter(p=>isWalkStopAvailable(p,'scenic')&&distance(p,start)>70&&distance(p,end)>100)
  .map(p=>({p,...project(p,base.shape,referenceLengths)})).filter(c=>c.distance<=SCENIC_LIMITS.corridor);
 const corridorCache=new Map<string,number>();
 const inCorridor=(shape:number[][])=>{
  // Include vertices and intermediate samples, so a legal POI cannot send the
  // street route around a river outside the permitted reference corridor.
  for(let i=0;i<shape.length;i++){
   const a=shape[Math.max(0,i-1)],b=shape[i],steps=Math.max(1,Math.ceil(distance(point(a),point(b))/50));
   for(let j=0;j<=steps;j++){
    const p=point([a[0]+(b[0]-a[0])*j/steps,a[1]+(b[1]-a[1])*j/steps]);
    const key=p.lat.toFixed(6)+','+p.lon.toFixed(6);let d=corridorCache.get(key);
    if(d===undefined){d=project(p,base.shape,referenceLengths).distance;corridorCache.set(key,d);}
    if(d>SCENIC_LIMITS.corridor)return false;
   }
  }
  return true;
 };
 const routeCache=new Map<string,Promise<Path>>();
 const route=(a:Place,b:Place)=>{const key=[a.lat,a.lon,b.lat,b.lon].join(',');if(!routeCache.has(key))routeCache.set(key,Promise.resolve().then(()=>calculate([a,b])));return routeCache.get(key)!;};
 const used=new Set<string>(),stops:Place[]=[];let remaining=base,shape:number[][]=[[start.lat,start.lon]],walked=0,minutes=0,progress=0;
 const maxStops=Math.min(20,Math.max(3,Math.ceil(base.distance/700)));
 const section=(at:number)=>Math.min(maxStops-1,Math.floor(at/referenceTotal*maxStops));
 const occupiedSections=new Set<number>();
 for(let n=0;n<maxStops;n++){
  await new Promise<void>(resolve=>setTimeout(resolve,0));
  const tailLengths=lengths(remaining.shape),tailTotal=tailLengths.at(-1)||0;
  let best:{p:Place;progress:number;leg:Path;tail:Path;origin:ReturnType<typeof originAt>;score:number}|undefined;
  for(let at=0;at<tailTotal-100&&!best;at+=350){
   const origin=originAt(remaining,at,tailLengths),originProgress=project(origin.p,base.shape,referenceLengths).progress;
   const ranked=candidates.filter(c=>!used.has(c.p.id)&&!occupiedSections.has(section(c.progress))&&c.progress>=Math.max(progress,originProgress)-SCENIC_LIMITS.backtrack&&c.progress<=originProgress+900&&distance(c.p,origin.p)<=SCENIC_LIMITS.step&&!stops.some(s=>distance(s,c.p)<SCENIC_LIMITS.spacing))
    .map(c=>({...c,score:(c.p.priority||1)*100-distance(c.p,origin.p)-Math.max(0,originProgress-c.progress)*2-(discouraged.has(c.p.id)?600:0)}))
    .sort((a,b)=>b.score-a.score||a.p.id.localeCompare(b.p.id)).slice(0,6);
   for(const c of ranked){
    try{
     const leg=await route(origin.p,c.p);if(leg.distance>SCENIC_LIMITS.step)continue;
     const tail=await route(c.p,end),total=walked+origin.distance+leg.distance+tail.distance;
     if(total>budget||!inCorridor(leg.shape)||!inCorridor(tail.shape))continue;
     const added=Math.max(0,origin.distance+leg.distance+tail.distance-remaining.distance);
     // Penalise actual retracing as well as backwards reference progress.
     let repeated=0;const committedLengths=lengths(shape);
     for(let i=1;i<leg.shape.length;i++){const a=point(leg.shape[i-1]),b=point(leg.shape[i]);if(shape.length>1&&project(point([(a.lat+b.lat)/2,(a.lon+b.lon)/2]),shape,committedLengths).distance<25)repeated+=distance(a,b);}
     const diversity=stops.some(s=>s.category===c.p.category)?0:60;
     const score=c.score-added*.8-repeated*2+diversity;
     if(!best||score>best.score)best={p:c.p,progress:c.progress,leg,tail,origin,score};
    }catch{/* An inaccessible candidate must not discard previous good stops. */}
   }
  }
  if(!best)break;
  shape.push(...best.origin.prefix.slice(1),...best.leg.shape.slice(1));
  walked+=best.origin.distance+best.leg.distance;minutes+=best.origin.minutes+best.leg.walkingMinutes;
  remaining=best.tail;stops.push(best.p);used.add(best.p.id);occupiedSections.add(section(best.progress));progress=Math.max(progress,best.progress);
 }
 shape.push(...remaining.shape.slice(1));
 return {shape,distance:walked+remaining.distance,walkingMinutes:Math.ceil(minutes+remaining.walkingMinutes),mode:'scenic',stops,
  stopMinutes:stops.reduce((sum,p)=>sum+(p.minutes||5),0),extraMinutes:Math.max(0,Math.ceil(minutes+remaining.walkingMinutes)-base.walkingMinutes),
  scenicBase:base,...(!stops.length?{note:emptyModeNote('scenic')}:{})};
}
