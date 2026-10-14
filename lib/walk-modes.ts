import type {Place} from './places';
export type WalkMode='direct'|'scenic'|'food'|'photo';
export const MODE_LABELS:Record<WalkMode,string>={direct:'По пути',scenic:'Не спешу',food:'Покушать',photo:'Красивые фото'};
export const WALK_MODES=Object.keys(MODE_LABELS) as WalkMode[];
export function isFoodPlace(place:Place){return ['Ресторан','Кафе','Быстрое питание','Фудкорт'].includes(place.category||'');}
export function isWalkStopAvailable(place:Place,mode:WalkMode){return !(['direct','scenic'].includes(mode)&&place.category==='Музей'&&!!place.businessStatus);}
export function isPhotoPlace(place:Place){return !isFoodPlace(place)&&(!!place.photo||!!place.hasPhoto||['Смотровая площадка','Архитектура','Парк','Пляж','Площадь','Мост','Храм','История'].includes(place.category||'')||((place.priority||0)>=10&&place.category!=='Памятник'));}
export function placesForMode(catalog:Place[],mode:WalkMode):Place[]{
 if(mode==='food')return catalog.filter(isFoodPlace);
 if(mode==='photo')return catalog.filter(isPhotoPlace).map(p=>({...p,minutes:8}));
 return catalog.filter(p=>!isFoodPlace(p));
}
export function emptyModeNote(mode:WalkMode){return mode==='food'?'В пределах 500 м от пути не найдено заведений из каталога. Попробуйте другой старт или финиш.':mode==='photo'?'В пределах 500 м от пути не найдено доступных мест для фото. Попробуйте другой старт или финиш.':'В каталоге первой версии пока нет интересных мест рядом с этим маршрутом.';}
