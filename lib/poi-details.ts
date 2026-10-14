import type {Place,Photo} from './places';

const DAY_NAMES:Record<string,string>={Mo:'пн',Tu:'вт',We:'ср',Th:'чт',Fr:'пт',Sa:'сб',Su:'вс',PH:'праздники',SH:'школьные каникулы',off:'закрыто',open:'открыто'};
export function formatHours(value?:string){if(!value)return 'Расписание не указано';if(value==='24/7')return 'Круглосуточно';return value.replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH|SH|off|open)\b/g,key=>DAY_NAMES[key]).replace(/;/g,' · ');}
const CUISINES:Record<string,string>={russian:'Русская',italian:'Итальянская',thai:'Тайская',japanese:'Японская',chinese:'Китайская',indian:'Индийская',asian:'Азиатская',seafood:'Морепродукты',pizza:'Пицца',burger:'Бургеры',sandwich:'Сэндвичи',kebab:'Кебаб',coffee_shop:'Кофе',regional:'Местная',international:'Международная',georgian:'Грузинская',vietnamese:'Вьетнамская',mexican:'Мексиканская',vegetarian:'Вегетарианская',ice_cream:'Мороженое',noodle:'Лапша',pasta:'Паста',steak_house:'Стейки',chicken:'Курица',breakfast:'Завтраки'};
export function formatCuisine(value?:string){return value?value.split(';').map(v=>CUISINES[v.trim()]||v.trim()).join(' · '):'Кухня не указана';}
export function ticketLabel(p:Place){if(p.charge)return p.charge;if(p.fee==='no')return 'Вход бесплатный';if(p.fee==='yes')return 'Вход платный · цена не указана';if(['Памятник','Площадь','Набережная','Мост','История'].includes(p.category||''))return 'Осмотр снаружи — без билета';return 'Стоимость не указана';}
export function safeUrl(value?:string){if(!value)return undefined;try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)?url.href:undefined;}catch{return undefined;}}
const clean=(s?:string)=>s?.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").slice(0,250);
async function api(host:string,params:Record<string,string>,signal?:AbortSignal){const url=new URL('/w/api.php',host);url.search=new URLSearchParams({format:'json',formatversion:'2',origin:'*',...params}).toString();const r=await fetch(url,{signal:signal||AbortSignal.timeout(10000)});if(!r.ok)throw new Error('Источник фото недоступен');return r.json() as Promise<any>;}
async function commonsPhoto(file:string):Promise<Photo|undefined>{const d=await api('https://commons.wikimedia.org',{action:'query',prop:'imageinfo',titles:'File:'+file.replace(/^File:/i,''),iiprop:'url|extmetadata',iiurlwidth:'900'});const info=d.query?.pages?.[0]?.imageinfo?.[0];if(!info)return;const meta=info.extmetadata||{};return {url:info.thumburl||info.url,sourceUrl:info.descriptionurl,author:clean(meta.Artist?.value),license:clean(meta.LicenseShortName?.value),licenseUrl:safeUrl(meta.LicenseUrl?.value)};}
const photoCache=new Map<string,Photo|null>();
export async function loadPlacePhoto(p:Place):Promise<Photo|null>{
 if(p.photo)return p.photo;if(photoCache.has(p.id))return photoCache.get(p.id)!;
 let file=p.image?.match(/^(?:File:)?([^/]+\.(?:jpe?g|png|webp))$/i)?.[1];
 try{
  if(!file&&p.wikidata&&/^Q\d+$/.test(p.wikidata)){const d=await api('https://www.wikidata.org',{action:'wbgetentities',ids:p.wikidata,props:'claims'});file=d.entities?.[p.wikidata]?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;}
  if(!file&&p.wikipedia){const split=p.wikipedia.indexOf(':');const language=split>0?p.wikipedia.slice(0,split):'ru';const title=split>0?p.wikipedia.slice(split+1):p.wikipedia;if(/^[a-z]{2,3}$/.test(language)){const d=await api('https://'+language+'.wikipedia.org',{action:'query',prop:'pageimages',titles:title,piprop:'name',redirects:'1'});file=d.query?.pages?.[0]?.pageimage;}}
  const photo=file?await commonsPhoto(file):undefined;if(photo)photoCache.set(p.id,photo);return photo||null;
 }catch{return null;}
}
