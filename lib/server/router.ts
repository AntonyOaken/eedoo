import {cached,cacheKey} from './cache';import type {Place} from '../places';import type {RouteCalculator} from '../routing';
export type RouteResult=ReturnType<RouteCalculator>;
let failures=0,openUntil=0;
export function decodeShape(s:string){let i=0,lat=0,lon=0;const shape:number[][]=[];while(i<s.length){const read=()=>{let b,shift=0,result=0;do{if(i>=s.length||shift>30)throw new Error('Invalid router shape');b=s.charCodeAt(i++)-63;result|=(b&31)<<shift;shift+=5;}while(b>=32);return result&1?~(result>>1):result>>1;};lat+=read();lon+=read();shape.push([lat/1e6,lon/1e6]);}return shape;}
async function segment(points:Place[]):Promise<RouteResult>{
 const endpoint=process.env.VALHALLA_URL;if(!endpoint)throw new Error('VALHALLA_URL is required');
 if(openUntil>Date.now())throw new Error('Router circuit open');
 return cached(cacheKey('route-v1',{endpoint,points:points.map(p=>[p.lat,p.lon])}),3600,async()=>{
  try{
   const url=new URL('/route',endpoint),payload={locations:points.map(p=>({lat:p.lat,lon:p.lon,type:'break',radius:100})),costing:'pedestrian',costing_options:{pedestrian:{walking_speed:4.5}},units:'kilometers',language:'ru-RU'};
   url.searchParams.set('json',JSON.stringify(payload));
   const response=await fetch(url,{signal:AbortSignal.timeout(5000),headers:{'X-Client-Id':'poputi-self-hosted'}});
   if(!response.ok)throw new Error('Router unavailable');
   const data=await response.json(),trip=data.trip;
   if(!trip?.legs?.length||!Number.isFinite(trip.summary?.length)||!Number.isFinite(trip.summary?.time))throw new Error('Invalid router result');
   const result={shape:trip.legs.flatMap((l:{shape:string})=>decodeShape(l.shape)),distance:trip.summary.length*1000,walkingMinutes:Math.ceil(trip.summary.time/60)};
   if(result.shape.length<2||result.distance<=0)throw new Error('Invalid path');
   failures=0;return result;
  }catch(e){if(++failures>=3){openUntil=Date.now()+15000;failures=0;}throw e;}
 });
}
export async function route(points:Place[]):Promise<RouteResult>{
 const shape:number[][]=[];let distance=0,walkingMinutes=0;
 for(let i=0;i<points.length-1;i+=9){const r=await segment(points.slice(i,i+10));shape.push(...r.shape.slice(i?1:0));distance+=r.distance;walkingMinutes+=r.walkingMinutes;}
 return {shape,distance,walkingMinutes};
}

