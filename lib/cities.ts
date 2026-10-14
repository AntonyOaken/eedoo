import type {Place} from './places';
export type CityId='spb'|'kurgan'|'phuket';
export type City={id:CityId;name:string;searchName:string;timeZone:string;center:[number,number];bounds:[number,number,number,number];zoom:number;example:Place;defaultDestination:string;searchExample:string};
export const CITIES:City[]=[
 {id:'spb',timeZone:'Europe/Moscow',name:'Санкт-Петербург',searchName:'Санкт-Петербург',center:[59.9375,30.319],bounds:[59.70,29.50,60.20,30.75],zoom:14,example:{id:'hotel',name:'Гостиница «Астория»',lat:59.93136,lon:30.30874},defaultDestination:'hermitage',searchExample:'Русский музей'},
 {id:'kurgan',timeZone:'Asia/Yekaterinburg',name:'Курган',searchName:'Курган Россия',center:[55.441,65.344],bounds:[55.35,65.18,55.55,65.48],zoom:14,example:{id:'kurgan-center',name:'Центр Кургана · пример старта',lat:55.441,lon:65.344},defaultDestination:'декабрист',searchExample:'Музей декабристов'},
 {id:'phuket',timeZone:'Asia/Bangkok',name:'Пхукет',searchName:'Phuket Thailand',center:[7.8846,98.3895],bounds:[7.74,98.25,8.21,98.47],zoom:15,example:{id:'phuket-center',name:'Центр Пхукет-тауна · пример старта',lat:7.8846,lon:98.3895},defaultDestination:'chinpracha',searchExample:'Chinpracha House'}
];
export function getCity(id:unknown):City {const city=CITIES.find(c=>c.id===id);if(!city)throw new Error('Выберите Санкт-Петербург, Курган или Пхукет.');return city;}
export function inCity(p:Pick<Place,'lat'|'lon'>,city:City){const [s,w,n,e]=city.bounds;return Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&p.lat>=s&&p.lat<=n&&p.lon>=w&&p.lon<=e;}
export function cityAt(p:Pick<Place,'lat'|'lon'>){return CITIES.find(city=>inCity(p,city));}
