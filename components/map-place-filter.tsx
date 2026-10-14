'use client';
import {useId,useState} from 'react';
import {Landmark,ChevronDown,X} from 'lucide-react';
import {Popover,PopoverTrigger,PopoverContent} from '@/components/ui/popover';
import {categoryLabel} from '@/lib/place-filter';

export function MapPlaceFilter({categories,selected,onChange,onOpen}:{categories:string[];selected:string[];onChange:(categories:string[])=>void;onOpen:()=>void}){
 const [open,setOpen]=useState(false);
 const heading=useId();
 return <div className="map-place-filter"><Popover open={open} onOpenChange={value=>{setOpen(value);if(value)onOpen();}}>
  <PopoverTrigger asChild><button className={'map-filter-trigger'+(selected.length?' is-active':'')}>
   <Landmark size={18}/><span>Типы мест</span><small>{selected.length||'Все'}</small><ChevronDown size={16}/>
  </button></PopoverTrigger>
  <PopoverContent align="start" side="bottom" sideOffset={8} collisionPadding={12} className="map-filter-panel" aria-labelledby={heading}>
   <div className="map-filter-heading"><strong id={heading}>Типы мест</strong><button aria-label="Закрыть фильтры" onClick={()=>setOpen(false)}><X size={18}/></button></div>
   <div className="filter-chips"><button aria-pressed={!selected.length} onClick={()=>onChange([])}>Все</button>{categories.map(category=><button key={category} aria-pressed={selected.includes(category)} onClick={()=>onChange(selected.includes(category)?selected.filter(c=>c!==category):[...selected,category])}>{categoryLabel(category)}</button>)}</div>
   <p className="caption" aria-live="polite">{selected.length?'Выбранные типы подсвечены. Остальные — серые.':'Можно выбрать несколько типов мест.'}</p>
  </PopoverContent>
 </Popover></div>;
}
