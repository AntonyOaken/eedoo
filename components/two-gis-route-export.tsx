'use client';
import {useEffect,useState} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {twoGisFullRoute,twoGisRouteParts} from '@/lib/two-gis-route';
import type {Place} from '@/lib/places';
import type {Walk} from '@/lib/routing';
import type {CityId} from '@/lib/cities';

export function TwoGisRouteExport({start,end,walk,city}:{start:Place;end:Place;walk:Walk;city:CityId}){
 const [open,setOpen]=useState(false),[iphone,setIphone]=useState(false);
 useEffect(()=>{setIphone(/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1));},[]);
 const parts=iphone?twoGisFullRoute(start,end,walk.stops,city):twoGisRouteParts(start,end,walk.stops,city);
 if(!parts.length)return null;
 return <div className="two-gis-export">
  {parts.length===1?<a className="two-gis-open" href={parts[0].url} target="_blank" rel="noopener noreferrer"><img className="two-gis-logo" src="/brands/2gis.svg" alt="" width={24} height={24}/>Открыть в 2ГИС</a>:<button className="two-gis-open" onClick={()=>setOpen(true)}><img className="two-gis-logo" src="/brands/2gis.svg" alt="" width={24} height={24}/>Открыть в 2ГИС</button>}
  <Dialog open={open} onOpenChange={setOpen}><DialogContent className="two-gis-dialog"><DialogTitle>Открыть в 2ГИС</DialogTitle><DialogDescription>2ГИС построит свой пеший путь между выбранными местами. Прогулка разделена на части, чтобы 2ГИС сохранил все остановки и финиш. Открывайте их по порядку.</DialogDescription><div className="two-gis-parts">{parts.map((part,index)=><a key={part.url} href={part.url} target="_blank" rel="noopener noreferrer"><strong>Часть {index+1} из {parts.length}</strong><span>{part.points[0].name} → {part.points.at(-1)!.name}</span></a>)}</div></DialogContent></Dialog>
 </div>;
}
