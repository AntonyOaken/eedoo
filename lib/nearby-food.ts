import {distance,type Place} from './places';
import {isFoodPlace} from './walk-modes';
export type FoodAtPoint=Place & {distanceFromPoint:number};
export function foodNearPoint(catalog:Place[],center:Place):FoodAtPoint[]{
 if(!Number.isFinite(center.lat)||!Number.isFinite(center.lon))throw new Error('Укажите точку поиска.');
 return catalog.filter(isFoodPlace).map(place=>({place,meters:distance(place,center)})).filter(row=>row.meters<=500).sort((a,b)=>a.meters-b.meters||a.place.id.localeCompare(b.place.id)).map(row=>({...row.place,distanceFromPoint:Math.round(row.meters)}));
}
