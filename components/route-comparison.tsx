'use client';
import {Check,Clock,Route,LoaderCircle,MapPin} from 'lucide-react';
import {RadioGroup,RadioGroupItem} from '@/components/ui/radio-group';
import {comparison,totalMinutes,type RouteOption} from '@/lib/alternatives';
import type {Place} from '@/lib/places';
const time=(m:number)=>m>=60?`${Math.floor(m/60)} ч${m%60?' '+m%60+' мин':''}`:`${m} мин`;
const km=(meters:number)=>(meters/1000).toFixed(1).replace('.',',')+' км';
const signed=(value:number,format:(value:number)=>string)=>Math.abs(value)<.5?'без изменений':(value>0?'+':'−')+format(Math.abs(value));
export function RouteComparison({options,selectedId,loading,onSelect,onPlace,isHighlighted}: {options:RouteOption[];selectedId:string;loading:boolean;onSelect:(option:RouteOption)=>void;onPlace:(place:Place)=>void;isHighlighted?:(place:Place)=>boolean}){
 const primary=options[0]?.walk;if(!primary)return null;
 return <section className="route-comparison" aria-label="Сравнение маршрутов"><div className="comparison-heading"><h2>Варианты прогулки</h2>{loading&&<LoaderCircle size={18} className="spin"/>}</div>{loading&&<p className="caption" role="status">Ищем альтернативные пути…</p>}
 <RadioGroup value={selectedId} onValueChange={id=>{const option=options.find(o=>o.id===id);if(option)onSelect(option);}} aria-label="Выберите маршрут" className="route-options">
 {options.map(option=>{const delta=comparison(option,primary);const selected=selectedId===option.id;return <div key={option.id} className={'route-option '+(selected?'selected':'')}>
 <label htmlFor={'route-'+option.id} className="route-option-label"><div><strong>{option.title}</strong><span>{selected?<><Check size={13}/>На карте</>:'Нажмите, чтобы показать на карте'}</span></div><RadioGroupItem value={option.id} id={'route-'+option.id}/></label>
 <div className="option-stats"><span><Route size={15}/><strong>{km(option.walk.distance)}</strong></span><span><Clock size={15}/><strong>{time(totalMinutes(option.walk))}</strong><small>с остановками</small></span></div>
 <p className="option-walking">{time(option.walk.walkingMinutes)} ходьбы · {option.walk.stopMinutes} мин на остановки</p>
 {option.id!=='primary'&&<p className="option-delta">К основному: {signed(delta.distance,value=>value<100?Math.round(value)+' м':km(value))} · {signed(delta.totalMinutes,time)}<span>{delta.newPlaces.length?`Новых мест: ${delta.newPlaces.length}`:'Другой путь к тем же местам'}</span></p>}
 <p className="option-preview">{option.walk.stops.slice(0,3).map(p=>p.name).join(' · ')}{option.walk.stops.length>3?` · ещё ${option.walk.stops.length-3}`:''}</p><details className="option-places"><summary><MapPin size={14}/>Места по пути · {option.walk.stops.length}</summary><div>{option.walk.stops.map(place=><button key={place.id} className={isHighlighted&&!isHighlighted(place)?'is-muted':''} onClick={()=>onPlace(place)}>{place.name}</button>)}{!option.walk.stops.length&&<p>В каталоге нет мест рядом с этим путём.</p>}</div></details>
 {option.via.length>0&&<p className="option-via">Через: {option.via.map(p=>p.name).join(' · ')}</p>}
 </div>;})}</RadioGroup>
 {!loading&&options.length===1&&<p className="caption" role="status">Для этих точек пока не найдено отличающихся пешеходных вариантов. Основной маршрут доступен.</p>}
 </section>;
}
