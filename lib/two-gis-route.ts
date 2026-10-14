import type {Place} from './places';
import type {CityId} from './cities';

// The tested web fallback keeps at most ten points, including start and finish.
export const TWO_GIS_MAX_POINTS=10;
export type TwoGisRoutePart={url:string;points:Place[]};
const coordinates=(p:Place)=>`${Number(p.lon.toFixed(6))},${Number(p.lat.toFixed(6))}`;
function routePoints(start:Place,end:Place,stops:Place[]){
 const points=[start,...stops,end].filter((p,i,all)=>i===0||coordinates(p)!==coordinates(all[i-1]));
 if(points.some(p=>!Number.isFinite(p.lat)||!Number.isFinite(p.lon)||Math.abs(p.lat)>90||Math.abs(p.lon)>180))throw new Error('Invalid route coordinates');
 return points;
}
function routePart(points:Place[],city:CityId):TwoGisRoutePart{
 const cityPath=city==='spb'?'/spb':city==='kurgan'?'/kurgan':'';
 return {points,url:`https://2gis.ru${cityPath}/directions/tab/pedestrian/points/${encodeURIComponent(points.map(coordinates).join('|'))}`};
}
// Send the complete itinerary for testing in the installed iPhone app.
export function twoGisFullRoute(start:Place,end:Place,stops:Place[],city:CityId):TwoGisRoutePart[]{
 const points=routePoints(start,end,stops);
 return points.length<2?[]:[routePart(points,city)];
}
export function twoGisRouteParts(start:Place,end:Place,stops:Place[],city:CityId,maxPoints=TWO_GIS_MAX_POINTS):TwoGisRoutePart[]{
 if(!Number.isInteger(maxPoints)||maxPoints<2||maxPoints>TWO_GIS_MAX_POINTS)throw new Error('Invalid route part size');
 const points=routePoints(start,end,stops);
 const parts:TwoGisRoutePart[]=[];
 for(let first=0;first<points.length-1;first+=maxPoints-1){
  const part=points.slice(first,first+maxPoints);
  parts.push(routePart(part,city));
 }
 return parts;
}
