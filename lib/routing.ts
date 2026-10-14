import {distance,type Place} from './places';
import {placesForMode,isFoodPlace,isWalkStopAvailable,emptyModeNote,type WalkMode} from './walk-modes';
export type RouteCalculator=(points:Place[])=>{shape:number[][];distance:number;walkingMinutes:number};
export type AsyncRouteCalculator=(points:Place[])=>Promise<ReturnType<RouteCalculator>>;
export type NearbyFood=Place & {distanceFromRoute:number};
export type Walk = {shape: number[][]; distance: number; walkingMinutes: number; stopMinutes: number; stops: Place[]; extraMinutes: number; mode: WalkMode; nearbyFood?:NearbyFood[]; note?: string};
// Project landmarks onto every segment, rather than a straight line between endpoints.
export function proximity(p:Place,shape:number[][]) {let best=Infinity,order=0;const cos=Math.cos(p.lat*Math.PI/180);for(let i=1;i<shape.length;i++){const a={lat:shape[i-1][0],lon:shape[i-1][1]},b={lat:shape[i][0],lon:shape[i][1]};const dx=(b.lon-a.lon)*cos,dy=b.lat-a.lat;const t=Math.max(0,Math.min(1,((p.lon-a.lon)*cos*dx+(p.lat-a.lat)*dy)/(dx*dx+dy*dy||1)));const d=distance(p,{lat:a.lat+dy*t,lon:a.lon+(b.lon-a.lon)*t});if(d<best){best=d;order=i+t;}}return {distance:best,order};}
// Small map markers represent places on the streets of the selected route.
// Keep this corridor narrow; the 500 m scenic detour radius is for stop selection.
export const MAP_ROUTE_CORRIDOR_METERS=50;
export function mapPlacesAlongRoute(catalog:Place[],shape:number[][],excludedIds:Iterable<string>=[]):Place[]{
 if(shape.length<2)return [];
 const excluded=new Set(excludedIds);
 const bounds=shape.reduce((b,p)=>[Math.min(b[0],p[0]),Math.min(b[1],p[1]),Math.max(b[2],p[0]),Math.max(b[3],p[1])],[90,180,-90,-180]);
 const latPad=MAP_ROUTE_CORRIDOR_METERS/110000;
 const lonPad=latPad/Math.max(.01,Math.cos(Math.max(Math.abs(bounds[0]),Math.abs(bounds[2]))*Math.PI/180));
 return catalog.filter(p=>!excluded.has(p.id)&&p.lat>=bounds[0]-latPad&&p.lat<=bounds[2]+latPad&&p.lon>=bounds[1]-lonPad&&p.lon<=bounds[3]+lonPad&&proximity(p,shape).distance<=MAP_ROUTE_CORRIDOR_METERS);
}
// Food venues are discoveries beside the actual polyline, not route waypoints.
export function nearbyFoodAlongRoute(catalog:Place[],shape:number[][]):NearbyFood[]{
 if(shape.length<2)return [];
 const bounds=shape.reduce((b,p)=>[Math.min(b[0],p[0]),Math.min(b[1],p[1]),Math.max(b[2],p[0]),Math.max(b[3],p[1])],[90,180,-90,-180]);
 return catalog.filter(p=>isFoodPlace(p)&&p.lat>=bounds[0]-.006&&p.lat<=bounds[2]+.006&&p.lon>=bounds[1]-.013&&p.lon<=bounds[3]+.013).map(p=>({p,...proximity(p,shape)})).filter(c=>c.distance<=500).sort((a,b)=>a.order-b.order||a.distance-b.distance).map(c=>({...c.p,distanceFromRoute:Math.round(c.distance)}));
}
type Candidate={p:Place;distance:number;order:number};
// Select a useful stop in each part of the path instead of filling the first
// four slots near the hotel. Distance-based spacing also avoids adjacent plaques.
export function distributeStops(candidates:Candidate[],shape:number[][],count:number):Candidate[]{
 const lengths=[0];for(let i=1;i<shape.length;i++)lengths.push(lengths[i-1]+distance({lat:shape[i-1][0],lon:shape[i-1][1]},{lat:shape[i][0],lon:shape[i][1]}));
 const total=lengths.at(-1)||1;const progress=(c:Candidate)=>{const index=Math.min(lengths.length-1,Math.max(0,Math.floor(c.order)-1));return lengths[index];};
 const chosen:Candidate[]=[];
 for(let slot=0;slot<count;slot++){
  const available=candidates.filter(c=>progress(c)>=total*slot/count&&progress(c)<=total*(slot+1)/count&&!chosen.some(s=>distance(s.p,c.p)<180));
  available.sort((a,b)=>(b.p.priority||1)*100-b.distance-((a.p.priority||1)*100-a.distance));
  if(available[0])chosen.push(available[0]);
 }
 return chosen.sort((a,b)=>a.order-b.order);
}
export async function buildWalk(start:Place,end:Place,mode:WalkMode,calculate:RouteCalculator|AsyncRouteCalculator,catalog:Place[]):Promise<Walk> {
 const compute=calculate;
 const base=await compute([start,end]);
 if(mode==='food'){const nearbyFood=nearbyFoodAlongRoute(catalog,base.shape);return {...base,mode,stops:[],stopMinutes:0,extraMinutes:0,nearbyFood,...(!nearbyFood.length?{note:emptyModeNote(mode)}:{})};}
 const bounds=base.shape.reduce((b:number[],p:number[])=>[Math.min(b[0],p[0]),Math.min(b[1],p[1]),Math.max(b[2],p[0]),Math.max(b[3],p[1])],[90,180,-90,-180]);
 const candidates=placesForMode(catalog,mode).filter(p=>isWalkStopAvailable(p,mode)&&p.lat>bounds[0]-.006&&p.lat<bounds[2]+.006&&p.lon>bounds[1]-.013&&p.lon<bounds[3]+.013&&distance(p,start)>70&&distance(p,end)>100).map(p=>({p,...proximity(p,base.shape)}));
 const count=mode==='photo'?Math.min(8,Math.max(3,Math.ceil(base.distance/900))):Math.min(20,Math.max(3,Math.ceil(base.distance/700)));
 if(mode==='direct') {const stops=distributeStops(candidates.filter(c=>c.distance<100),base.shape,count).map(c=>c.p);return {...base,mode,stops,stopMinutes:stops.reduce((s,p)=>s+(p.minutes||5),0),extraMinutes:0};}
 const eligible=distributeStops(candidates.filter(c=>c.distance<=500),base.shape,count);
 let stops=eligible.map(c=>c.p);let result=base;let note:string|undefined;
 const budget=Math.min(base.distance*1.65+400,base.distance+2400);
 if(stops.length) {try{result=await compute([start,...stops,end]);}catch{result=base;stops=[];note='Некоторые остановки недоступны пешком. Построили короткий маршрут.';}if(result.distance>budget){stops=distributeStops(candidates.filter(c=>c.distance<100),base.shape,count).map(c=>c.p);try{result=stops.length?await compute([start,...stops,end]):base;}catch{result=base;stops=[];}}if(result.distance>budget){stops=[];result=base;note='Подходящие остановки требуют слишком большого крюка. Оставили короткий маршрут.';}}
 if(!stops.length&&!note)note=emptyModeNote(mode);
 return {...result,mode,stops,stopMinutes:stops.reduce((s,p)=>s+(p.minutes||5),0),extraMinutes:Math.max(0,result.walkingMinutes-base.walkingMinutes),note};
}
