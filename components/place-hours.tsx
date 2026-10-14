'use client';
import {useEffect,useState} from 'react';
import type {Place} from '@/lib/places';
import {cityAt} from '@/lib/cities';
import {getHoursStatus,parseWeeklyHours} from '@/lib/opening-hours';
import {formatHours} from '@/lib/poi-details';

const WEEKDAYS=['Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'];
function clockTime(minutes:number){
 return `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
}

export function PlaceHours({place}:{place:Place}){
 const [now,setNow]=useState<Date|null>(null);
 useEffect(()=>{
  let timer:ReturnType<typeof setTimeout>;
  const update=()=>{
   clearTimeout(timer);setNow(new Date());
   timer=setTimeout(update,60_000-Date.now()%60_000);
  };
  const resume=()=>{if(document.visibilityState==='visible')update();};
  update();window.addEventListener('focus',update);document.addEventListener('visibilitychange',resume);
  return()=>{clearTimeout(timer);window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',resume);};
 },[]);
 const timeZone=cityAt(place)?.timeZone;
 const status=now?getHoursStatus(place.openingHours,timeZone,now,place.businessStatus):null;
 const week=place.openingHours?parseWeeklyHours(place.openingHours):null;
 const today=now&&timeZone?new Intl.DateTimeFormat('ru-RU',{weekday:'long',timeZone}).format(now):null;
 return <>
  {status&&<div className="poi-hours-status" role="status" aria-live="polite" aria-atomic="true">
   <span className={'poi-hours-badge poi-hours-'+status.state}>{status.label}</span>
   {status.detail&&<p className={status.countdown?'poi-hours-countdown':undefined}>{status.detail}</p>}
  </div>}
  {place.openingHours?<details className="poi-hours-schedule"><summary>Расписание по дням</summary>
   {week?<dl className="poi-hours-week">{week.map((periods,index)=>{
    const isToday=WEEKDAYS[index].toLowerCase()===today;
    return <div key={index} className={'poi-hours-row'+(isToday?' poi-hours-today':'')}>
     <dt>{WEEKDAYS[index]}{isToday&&<small>Сегодня</small>}</dt>
     <dd>{periods.length?periods.map(([start,end],i)=><span key={i}>
      {end-start===1440?'Круглосуточно':`${clockTime(start)}–${clockTime(end>1440?end%1440:end)}`}
      {end>1440&&end-start!==1440&&<small>до следующего дня</small>}
     </span>):<span className="poi-hours-day-off">Выходной</span>}</dd>
    </div>;
   })}</dl>:<div className="poi-hours-other">{place.openingHours.split(';').map((rule,index)=><p key={index}>{formatHours(rule.trim())}</p>)}</div>}
  </details>:<p>{formatHours()}</p>}
 </>;
}
