'use client';
import {Check,Clock,Route,LoaderCircle,MapPin} from 'lucide-react';
import {comparison,totalMinutes,type RouteOption} from '@/lib/alternatives';
import type {Place} from '@/lib/places';
const time=(m:number)=>m>=60?`${Math.floor(m/60)} ч${m%60?' '+m%60+' мин':''}`:`${m} мин`;
const km=(meters:number)=>(meters/1000).toFixed(1).replace('.',',')+' км';
const signed=(value:number,format:(value:number)=>string)=>Math.abs(value)<.5?'без изменений':(value>0?'+':'−')+format(Math.abs(value));
export function RouteComparison({options,selectedId,loading,onSelect}: {options:RouteOption[];selectedId:string;loading:boolean;onSelect:(option:RouteOption)=>void;onPlace?:(place:Place)=>void;isHighlighted?:(place:Place)=>boolean}){
 const primary=options[0]?.walk;if(!primary)return null;
 return <section className="route-comparison" aria-label="Сравнение маршрутов"><div className="comparison-heading"><h2>Варианты прогулки</h2>{loading&&<LoaderCircle size={18} className="spin" aria-label="Ищем варианты"/>}</div>
 <div role="group" aria-label="Выберите маршрут" className="route-options">
 {options.map(option=>{const delta=comparison(option,primary);const selected=selectedId===option.id;return <button type="button" key={option.id} className={'route-option route-choice '+(selected?'selected':'')} aria-pressed={selected} onClick={()=>onSelect(option)}>
 <span className="route-choice-heading"><strong>{option.title}</strong><span className="route-choice-check" aria-hidden="true">{selected&&<Check size={15}/>}</span></span>
 <span className="option-stats"><span><Route size={14}/><strong>{km(option.walk.distance)}</strong></span><span><Clock size={14}/><strong>{time(totalMinutes(option.walk))}</strong></span><span><MapPin size={14}/><strong>{option.walk.stops.length} мест</strong></span></span>
 <span className="option-preview">{option.walk.stops.slice(0,3).map(p=>p.name).join(' · ')||'Прямой пешеходный маршрут'}{option.walk.stops.length>3?` · ещё ${option.walk.stops.length-3}`:''}</span>
 {option.id!=='primary'&&<span className="option-delta">К основному: {signed(delta.distance,value=>value<100?Math.round(value)+' м':km(value))} · {signed(delta.totalMinutes,time)}</span>}
 </button>;})}</div>
 {!loading&&options.length===1&&<p className="caption">Других отличающихся пешеходных вариантов пока нет.</p>}
 </section>;
}
