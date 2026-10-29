'use client';

import {useEffect, useRef, useState} from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import {ArrowLeft, ArrowRight, Clock, Footprints, Info, Landmark, LoaderCircle, Route} from 'lucide-react';
import {totalMinutes, type RouteOption} from '@/lib/alternatives';
import type {Place} from '@/lib/places';

const time=(m:number)=>m>=60?`${Math.floor(m/60)} ч${m%60?' '+m%60+' мин':''}`:`${m} мин`;
const km=(m:number)=>m<1000?`${Math.round(m)} м`:`${(m/1000).toFixed(1).replace('.',',')} км`;

export function RouteDetailsCarousel({options, selectedId, loading, onPreview, onPlace, isHighlighted}: {
 options:RouteOption[];
 selectedId:string;
 loading:boolean;
 onPreview:(option:RouteOption)=>void;
 onPlace:(place:Place)=>void;
 isHighlighted:(place:Place)=>boolean;
}) {
 const [viewport, api]=useEmblaCarousel({align:'start', loop:false, containScroll:'trimSnaps'});
 const [index,setIndex]=useState(Math.max(0,options.findIndex(option=>option.id===selectedId)));
 const selected=useRef(selectedId);selected.current=selectedId;
 useEffect(()=>{
  if(!api)return;
  const sync=()=>{
   const next=api.selectedScrollSnap();setIndex(next);
   const option=options[next];
   if(option&&option.id!==selected.current)onPreview(option);
  };
  api.on('select',sync);
  return()=>{api.off('select',sync);};
 },[api,options,onPreview]);
 useEffect(()=>{
  if(!api)return;
  const next=Math.max(0,options.findIndex(option=>option.id===selectedId));
  if(api.selectedScrollSnap()!==next)api.scrollTo(next,true);
  setIndex(next);
 },[api,options,selectedId]);
 return <section className="route-detail-carousel" aria-label="Подробные варианты прогулки" aria-roledescription="карусель">
  <div className="route-detail-heading"><h1>Варианты прогулки</h1><span aria-live="polite">{index+1} из {options.length}</span>{loading&&<LoaderCircle size={17} className="spin" aria-label="Ищем варианты"/>}</div>
  <div className="route-detail-viewport" ref={viewport}>
   <div className="route-detail-track">{options.map((option,i)=><article key={option.id} className="route-detail-slide" role="group" aria-roledescription="маршрут" aria-label={`${i+1} из ${options.length}: ${option.title}`} inert={i!==index||undefined}>
    <div className="route-detail-scroll" key={option.id}>
     <h2>{option.title}</h2>
     <div className="stats"><div><Clock size={18}/><strong>{time(totalMinutes(option.walk))}</strong><span>с остановками</span></div><div><Route size={18}/><strong>{km(option.walk.distance)}</strong><span>пешком</span></div><div><Footprints size={18}/><strong>≈ {Math.round(option.walk.distance/.72).toLocaleString('ru-RU')}</strong><span>шагов</span></div></div>
     <p className="route-detail-summary"><Landmark size={17}/>{option.walk.stops.length} мест · {time(option.walk.walkingMinutes)} ходьбы{option.walk.stopMinutes?` + ${option.walk.stopMinutes} мин на остановки`:''}</p>
     {option.walk.note&&<p className="caption">{option.walk.note}</p>}
     <div className="stop-list">{option.walk.stops.map((place,n)=><button type="button" key={place.id} className={'stop'+(!isHighlighted(place)?' is-muted':'')} onClick={()=>onPlace(place)}><span className="stop-num">{n+1}</span><div><strong>{place.name}</strong><span>{place.category||'Место'} · около {place.minutes||5} мин</span></div><Info size={17}/></button>)}</div>
     {!option.walk.stops.length&&<p className="caption">В каталоге пока нет мест по этому пути. Попробуйте другой финиш.</p>}
    </div>
   </article>)}</div>
  </div>
  {options.length>1&&<><button type="button" className="route-page-arrow previous" aria-label="Предыдущий маршрут" disabled={index===0} onClick={()=>api?.scrollPrev()}><ArrowLeft size={20}/></button><button type="button" className="route-page-arrow next" aria-label="Следующий маршрут" disabled={index===options.length-1} onClick={()=>api?.scrollNext()}><ArrowRight size={20}/></button></>}
  <p className="route-swipe-hint">{options.length>1?'Листайте маршруты влево и вправо':loading?'Подбираем другие варианты…':'Других отличающихся вариантов пока нет'}</p>
 </section>;
}
