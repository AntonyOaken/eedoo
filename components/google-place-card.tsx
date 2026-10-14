'use client';
import {useEffect,useRef,useState} from 'react';
import {ExternalLink,LoaderCircle} from 'lucide-react';
import type {Place} from '@/lib/places';
import {googlePlaceQuery,googleMapsLink,googleIdStorageKey,canRememberMatch,candidateDistance,type GoogleCandidate} from '@/lib/google-places';
import {loadGooglePlaces} from '@/lib/google-places-loader';
type GoogleElement=HTMLElement & {places?:GoogleCandidate[];place?:GoogleCandidate|string;locationBias?:unknown;textQuery?:string;maxResultCount?:number};
export function GooglePlaceCard({place,onReady}:{place:Place;onReady:(ready:boolean)=>void}){
 const host=useRef<HTMLDivElement>(null);
 const [status,setStatus]=useState<'loading'|'choose'|'ready'|'missing'|'error'|'empty'>('loading');
 const [notice,setNotice]=useState(''),[reload,setReload]=useState(0),[matched,setMatched]=useState(false);
 useEffect(()=>{
  let active=true,timer:ReturnType<typeof setTimeout>|undefined;
  const controller=new AbortController();const cleanups:(()=>void)[]=[];
  setStatus('loading');setNotice('');setMatched(false);onReady(false);
  const listen=(el:HTMLElement,name:string,fn:EventListener)=>{el.addEventListener(name,fn);cleanups.push(()=>el.removeEventListener(name,fn));};
  const fail=()=>{if(active){clearTimeout(timer);setStatus('error');onReady(false);}};
  const armTimeout=()=>{clearTimeout(timer);timer=setTimeout(fail,15000);};
  void (async()=>{
   try{
    const response=await fetch('/api/google-places/config',{signal:controller.signal,cache:'no-store'});
    if(!response.ok)throw new Error('config unavailable');
    const config=await response.json() as {enabled?:boolean;apiKey?:string};if(!active)return;
    if(!config.enabled||typeof config.apiKey!=='string'){setStatus('missing');return;}
    await loadGooglePlaces(config.apiKey);if(!active||!host.current)return;
    await new Promise<void>((resolve,reject)=>{
     const deadline=setTimeout(()=>reject(new Error('Google components unavailable')),15000);
     Promise.all([customElements.whenDefined('gmp-place-search'),customElements.whenDefined('gmp-place-details')]).then(()=>{clearTimeout(deadline);resolve();},error=>{clearTimeout(deadline);reject(error);});
    });
    if(!active||!host.current)return;
    const container=host.current;container.replaceChildren();
    const content=()=>document.createElement('gmp-place-all-content');
    const showDetails=(id:string)=>{
     if(!active)return;setStatus('loading');setMatched(true);armTimeout();
     const card=document.createElement('gmp-place-details') as GoogleElement;
     const request=document.createElement('gmp-place-details-place-request');request.setAttribute('place',id);
     card.appendChild(request);card.appendChild(content());
     listen(card,'gmp-load',()=>{if(active){clearTimeout(timer);const rendered=card.place;if(rendered&&typeof rendered!=='string'){const meters=candidateDistance(place,rendered);if(meters!==null&&meters>250)setNotice(`Место в Google находится примерно в ${Math.round(meters)} м от точки маршрута. Проверьте адрес: объект мог переехать.`);}setStatus('ready');onReady(true);}});
     listen(card,'gmp-error',fail);container.replaceChildren(card);
    };
    let saved:string|null=null;try{saved=localStorage.getItem(googleIdStorageKey(place));}catch{}
    if(saved&&/^[A-Za-z0-9_-]{5,200}$/.test(saved)){showDetails(saved);return;}
    const search=document.createElement('gmp-place-search') as GoogleElement;search.setAttribute('selectable','');
    const request=document.createElement('gmp-place-text-search-request') as GoogleElement;
    // Use original catalogue coordinates only as a query bias. Do not move OSM markers to Google results.
    request.locationBias={lat:place.lat,lng:place.lon};request.maxResultCount=3;
    search.appendChild(request);search.appendChild(content());
    listen(search,'gmp-load',()=>{if(!active)return;clearTimeout(timer);setStatus(search.places?.length?'choose':'empty');});
    listen(search,'gmp-error',fail);
    listen(search,'gmp-select',((event:Event & {place?:GoogleCandidate})=>{
     const candidate=event.place;if(!candidate?.id||!active)return;
     if(canRememberMatch(place,candidate)){
      // Store only the Google Place ID, which is exempt from content caching restrictions.
      try{localStorage.setItem(googleIdStorageKey(place),candidate.id);}catch{}
      setNotice('');
     }else{
      const meters=candidateDistance(place,candidate);
      setNotice(meters===null?'Координаты совпадения не подтверждены. Проверьте адрес.':`Это место примерно в ${Math.round(meters)} м от точки нашего маршрута. Проверьте адрес: место могло переехать или оказаться другим объектом.`);
     }
     showDetails(candidate.id);
    }) as EventListener);
    container.appendChild(search);armTimeout();request.textQuery=googlePlaceQuery(place);
   }catch{if(active&&!controller.signal.aborted)fail();}
  })();
  return()=>{active=false;controller.abort();clearTimeout(timer);cleanups.forEach(fn=>fn());host.current?.replaceChildren();};
 },[place,reload,onReady]);
 return <section className="google-place-section" aria-label="Сведения Google Maps">
  <div className="google-place-heading"><strong>Google Maps</strong>{matched&&<button onClick={()=>{try{localStorage.removeItem(googleIdStorageKey(place));}catch{}setReload(n=>n+1);}}>Другое совпадение</button>}</div>
  {status==='loading'&&<p className="google-place-status" role="status"><LoaderCircle size={17} className="spin"/>Загружаем сведения Google…</p>}
  {status==='choose'&&<p className="caption">Выберите нужное место по названию и адресу. Совпадение запомним на этом устройстве.</p>}
  {status==='missing'&&<p className="caption">Сведения Google пока не подключены. Посмотреть место можно в Google Maps.</p>}
  {status==='error'&&<p className="caption" role="status">Не удалось загрузить сведения Google. Ниже доступны сведения каталога. <button className="google-retry" onClick={()=>setReload(n=>n+1)}>Повторить</button></p>}
  {status==='empty'&&<p className="caption">Google не нашёл совпадений. Проверьте место по ссылке.</p>}
  {notice&&<p className="google-match-notice" role="status">{notice}</p>}
  <div ref={host} className="google-place-widget" hidden={status==='error'||status==='missing'||status==='empty'}/>
  <a className="poi-website" href={googleMapsLink(place)} target="_blank" rel="noopener noreferrer"><ExternalLink size={15}/>Открыть поиск в Google Maps</a>
  {status!=='missing'&&<p className="google-privacy">При загрузке Google получает запрос о месте. <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Конфиденциальность</a> · <a href="https://maps.google.com/help/terms_maps/" target="_blank" rel="noopener noreferrer">Условия Google Maps</a></p>}
 </section>;
}
