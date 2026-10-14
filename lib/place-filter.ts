import type {Place} from './places';
export function categoryMatches(place:Place,categories:readonly string[]):boolean{
 return categories.length===0||categories.includes(place.category||'Достопримечательность');
}
const labels:Record<string,string>={'История':'Исторические места','Пляж':'Пляжи','Памятник':'Памятники','Музей':'Музеи','Парк':'Парки','Храм':'Храмы','Собор':'Соборы','Мост':'Мосты','Дворец':'Дворцы','Архитектура':'Архитектура','Набережная':'Набережные','Площадь':'Площади','Смотровая площадка':'Смотровые площадки','Галерея':'Галереи','Достопримечательность':'Другие достопримечательности'};
export const categoryLabel=(category:string)=>labels[category]||category;
