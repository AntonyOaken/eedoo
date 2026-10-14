'use client';
import {Info} from 'lucide-react';
import type {NearbyFood} from '@/lib/routing';
import type {FoodAtPoint} from '@/lib/nearby-food';
import {formatCuisine} from '@/lib/poi-details';
export function FoodNearbyList({places,onPlace,nearPoint=false}:{places:(NearbyFood|FoodAtPoint)[];onPlace:(place:NearbyFood|FoodAtPoint)=>void;nearPoint?:boolean}){
 return <section aria-label={nearPoint?"Заведения рядом с точкой":"Заведения рядом с маршрутом"}><div className="section-label">Где поесть · {nearPoint?"в радиусе 500 м":"до 500 м от маршрута"} <span className="count">{places.length}</span></div><div className="food-nearby-list">{places.map((place,index)=><button className="food-nearby-item" key={place.id} onClick={()=>onPlace(place)}><span className="food-map-number">{index+1}</span><div><strong>{place.name}</strong><span>{place.category} · {'distanceFromPoint' in place?place.distanceFromPoint+' м от точки':place.distanceFromRoute+' м от маршрута'}</span>{place.cuisine&&<small>{formatCuisine(place.cuisine)}</small>}</div><Info size={16}/></button>)}</div></section>;
}
