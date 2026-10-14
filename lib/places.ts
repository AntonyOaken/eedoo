export type Photo = {url:string;sourceUrl:string;author?:string;license?:string;licenseUrl?:string;originalUrl?:string};
export type TwoGisFacts = {id:string;url:string;checkedAt:string;name:string;lat:number;lon:number;category:string;address?:string;phone?:string;website?:string;rating?:number;reviewCount?:number;openingHours?:string;hoursNote?:string;businessStatus?:'operational'|'temporarily_closed'|'permanently_closed';photo?:Photo;observationLevel?:'search'|'card';phones?:string[];emails?:string[];websites?:string[];socialLinks?:{text:string;url:string}[];featuresText?:string;description?:string};
export type Place = { id: string; name: string; lat: number; lon: number; category?: string; description?: string; minutes?: number; wikipedia?:string; wikidata?:string; image?:string; photo?:Photo; openingHours?:string; fee?:string; charge?:string; website?:string; osmUrl?:string; hoursSource?:string; priceSource?:string; checkedAt?:string; priority?:number; hasPhoto?:boolean; aliases?:string[]; cuisine?:string; menuUrl?:string; osmId?:string; phone?:string; dataSource?:string; dataUpdatedAt?:string; verifiedFields?:string[]; address?:string; googleMapsUrl?:string; googleCheckedAt?:string; googleRating?:number; googleReviewCount?:number; businessStatus?:'temporarily_closed'|'permanently_closed'; businessStatusSource?:string; hoursNote?:string; twoGis?:TwoGisFacts };
export const HOTEL: Place = {id:'hotel',name:'Гостиница «Астория»',lat:59.93136,lon:30.30874};
export const HERMITAGE: Place = {id:'hermitage',name:'Эрмитаж',lat:59.93945,lon:30.31505,category:'Музей',description:'Финиш у Зимнего дворца. На посещение музея стоит выделить отдельное время.'};
export const PLACES: Place[] = [
 {id:'isaac',name:'Исаакиевский собор',lat:59.9331,lon:30.3066,category:'Архитектура',minutes:8,description:'Один из главных силуэтов Петербурга. Остановитесь на площади, чтобы рассмотреть купол и колоннаду.'},
 {id:'bronze',name:'Медный всадник',lat:59.93636,lon:30.30229,category:'Памятник',minutes:5,description:'Памятник Петру I на Сенатской площади. Рядом — Нева и вид на Васильевский остров.'},
 {id:'garden',name:'Александровский сад',lat:59.93655,lon:30.3086,category:'Парк',minutes:5,description:'Небольшая зелёная пауза рядом с Адмиралтейством: аллеи, фонтан и скамейки.'},
 {id:'admiralty',name:'Адмиралтейство',lat:59.93715,lon:30.3099,category:'Архитектура',minutes:5,description:'Посмотрите на золотой шпиль с корабликом со стороны Александровского сада.'},
 {id:'palace',name:'Дворцовая площадь',lat:59.93845,lon:30.3156,category:'Площадь',minutes:7,description:'Ансамбль Зимнего дворца, Главного штаба и Александровской колонны. Здесь удобно сделать панорамное фото.'},
 {id:'kazansky',name:'Казанский собор',lat:59.93418,lon:30.32422,category:'Архитектура',minutes:7,description:'Знаменитая колоннада на Невском проспекте. Маршрут ведёт к площади перед собором.'},
 {id:'singer',name:'Дом Зингера',lat:59.93578,lon:30.32567,category:'Архитектура',minutes:5,description:'Рассмотрите стеклянный купол и детали фасада со стороны Невского проспекта.'},
 {id:'saviour',name:'Спас на Крови',lat:59.93972,lon:30.3287,category:'Архитектура',minutes:8,description:'Цветные купола у канала Грибоедова. Остановка снаружи; посещение внутри планируется отдельно.'},
 {id:'russian',name:'Русский музей',lat:59.93751,lon:30.33238,category:'Музей',minutes:5,description:'Михайловский дворец и площадь Искусств. По дороге можно посмотреть дворец снаружи.'},
 {id:'mars',name:'Марсово поле',lat:59.9432,lon:30.3314,category:'Парк',minutes:5,description:'Открытое пространство в центре города, между набережными и садами.'},
 {id:'summer',name:'Летний сад',lat:59.94514,lon:30.33514,category:'Парк',minutes:8,description:'Остановка у южного входа в Летний сад. Время и доступ внутрь зависят от режима работы.'},
 {id:'anichkov',name:'Аничков мост',lat:59.9331,lon:30.3432,category:'Мост',minutes:5,description:'Мост через Фонтанку со скульптурами укротителей коней.'},
 {id:'newholland',name:'Новая Голландия',lat:59.9299,lon:30.2918,category:'Городское пространство',minutes:8,description:'Остановка у входа на остров. Для прогулки по территории можно выделить дополнительное время.'},
 {id:'yusupov',name:'Юсуповский дворец',lat:59.92994,lon:30.2988,category:'Архитектура',minutes:5,description:'Дворец на набережной Мойки. По маршруту можно посмотреть его фасад.'},
 {id:'nicholas',name:'Никольский морской собор',lat:59.92222,lon:30.3005,category:'Архитектура',minutes:7,description:'Голубой собор и отдельная колокольня у Крюкова канала.'},
 {id:'rostral',name:'Ростральные колонны',lat:59.94357,lon:30.30685,category:'Набережная',minutes:7,description:'Стрелка Васильевского острова с открытым видом на Неву и Зимний дворец.'},
 {id:'peter',name:'Петропавловская крепость',lat:59.94845,lon:30.3175,category:'История',minutes:8,description:'Остановка у входа на Заячий остров. Для осмотра самой крепости потребуется больше времени.'},
 HERMITAGE
];
export function inPetersburg(p: Pick<Place,'lat'|'lon'>) {return Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&p.lat>=59.70&&p.lat<=60.20&&p.lon>=29.50&&p.lon<=30.75;}
export function distance(a: Pick<Place,'lat'|'lon'>, b: Pick<Place,'lat'|'lon'>) {const r=Math.PI/180;const x=(b.lon-a.lon)*r*Math.cos((a.lat+b.lat)*r/2),y=(b.lat-a.lat)*r;return Math.sqrt(x*x+y*y)*6371000;}
