import {distance,type Place} from './places';
// Local OSM aliases used only as search hints, never as Google's factual data.
const searchNames:Record<string,string>={
 'osm-way-1020885012':'Phuket Thai Hua Museum',
 'osm-node-6174607589':'Shrine of the Serene Light',
 'osm-way-135966212':'Phuket Philatelic Museum',
 'osm-way-1233476540':'Museum Phuket',
};
export function googlePlaceQuery(place:Place):string{
 const name=searchNames[place.id]||place.aliases?.find(n=>/[a-z]{3}/i.test(n))||place.name;
 return `${name} Phuket Thailand`.slice(0,200);
}
export function googleMapsLink(place:Place):string{
 return 'https://www.google.com/maps/search/?'+new URLSearchParams({api:'1',query:googlePlaceQuery(place)});
}
export type GoogleCandidate={id?:string;location?:{lat:number|(()=>number);lng:number|(()=>number)}};
export function candidateDistance(place:Place,candidate:GoogleCandidate):number|null{
 const loc=candidate.location;if(!loc)return null;
 const lat=typeof loc.lat==='function'?loc.lat():loc.lat,lon=typeof loc.lng==='function'?loc.lng():loc.lng;
 return Number.isFinite(lat)&&Number.isFinite(lon)?distance(place,{lat,lon}):null;
}
export function canRememberMatch(place:Place,candidate:GoogleCandidate):boolean{
 const meters=candidateDistance(place,candidate);
 return typeof candidate.id==='string'&&/^[A-Za-z0-9_-]{5,200}$/.test(candidate.id)&&meters!==null&&meters<=250;
}
export const googleIdStorageKey=(place:Place)=>'poputi-google-place-id-v1:'+place.id;
