'use client';
import {useEffect,useState} from 'react';
import {Clock,Utensils,Camera,LoaderCircle,ExternalLink} from 'lucide-react';
import type {Place,Photo} from '@/lib/places';
import {formatCuisine,loadPlacePhoto,safeUrl} from '@/lib/poi-details';
import {GooglePlaceCard} from '@/components/google-place-card';
import {PlaceHours} from '@/components/place-hours';
import {isFoodPlace} from '@/lib/walk-modes';
function CatalogueDetails({place}:{place:Place}){
 const food=isFoodPlace(place);
 const twoGis=place.twoGis;
 const [photo,setPhoto]=useState<Photo|null>(place.photo||null),[loading,setLoading]=useState(!place.photo),[failed,setFailed]=useState(false);
 useEffect(()=>{let active=true;setPhoto(place.photo||null);setFailed(false);setLoading(!place.photo);if(!place.photo)loadPlacePhoto(place).then(p=>{if(active){setPhoto(p);setLoading(false);}});return()=>{active=false;};},[place]);
 return <>
  {twoGis&&<div className="poi-google-facts">
   {place.businessStatus&&<p className="poi-closure" role="status">{place.businessStatus==='temporarily_closed'?'Временно закрыто':'Закрыто навсегда'} · по данным {place.businessStatusSource===twoGis.url?'2ГИС':'Google Maps'}</p>}
   {place.address&&<p>{place.address}{!twoGis.address&&<> · сведения каталога</>}</p>}
   {place.phone&&<p><a href={'tel:'+place.phone.replace(/[^+\d]/g,'')}>{place.phone}</a>{!twoGis.phone&&<> · сведения каталога</>}</p>}
   {twoGis.phones?.filter(phone=>phone!==place.phone).map(phone=><p key={phone}><a href={'tel:'+phone.replace(/[^+\d]/g,'')}>{phone}</a></p>)}
   {twoGis.emails?.map(email=><p key={email}><a href={'mailto:'+email}>{email}</a></p>)}
   {!!twoGis.socialLinks?.length&&<p>{twoGis.socialLinks.filter(link=>safeUrl(link.url)).map((link,index)=><span key={link.url}>{index>0&&' · '}<a href={safeUrl(link.url)} target="_blank" rel="noopener noreferrer">{link.text}</a></span>)}</p>}
   {twoGis.rating!==undefined&&<p>★ {twoGis.rating.toLocaleString('ru-RU')} из 5{twoGis.reviewCount!==undefined&&<> · {twoGis.reviewCount.toLocaleString('ru-RU')} оценок</>} · 2ГИС</p>}
   <p className="poi-updated">{twoGis.observationLevel==='search'?'Основные сведения из выдачи 2ГИС':'Сведения карточки 2ГИС'} сохранены · проверено {new Date(twoGis.checkedAt).toLocaleDateString('ru-RU')}.</p>
   <a className="poi-website" href={safeUrl(twoGis.url)} target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/>Открыть 2ГИС</a>
  </div>}
  {place.googleMapsUrl&&!twoGis&&<div className="poi-google-facts">
   {place.businessStatus&&<p className="poi-closure" role="status">{place.businessStatus==='temporarily_closed'?'Временно закрыто':'Закрыто навсегда'} · по данным Google Maps{place.category==='История'&&<>. Доступ внутрь не подтверждён.</>}</p>}
   {place.address&&<p>{place.address}</p>}
   {place.phone&&<p><a href={'tel:'+place.phone.replace(/[^+\d]/g,'')}>{place.phone}</a></p>}
   {place.googleRating!==undefined&&<p>★ {place.googleRating.toLocaleString('ru-RU')} из 5{place.googleReviewCount!==undefined&&<> · {place.googleReviewCount.toLocaleString('ru-RU')} отзывов</>} · Google Maps</p>}
   <p className="poi-updated">Сведения Google Maps сохранены в каталоге{place.googleCheckedAt&&<> · проверено {new Date(place.googleCheckedAt).toLocaleDateString('ru-RU')}</>}.</p>
   <a className="poi-website" href={safeUrl(place.googleMapsUrl)} target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/>Открыть Google Maps</a>
  </div>}
  {photo&&!failed?<div className="poi-image"><img src={photo.url} alt={place.name} onError={()=>setFailed(true)}/><small><a href={safeUrl(photo.sourceUrl)} target="_blank" rel="noopener noreferrer">{photo.author||'Wikimedia Commons'}</a>{photo.license&&<> · <a href={safeUrl(photo.licenseUrl)||safeUrl(photo.sourceUrl)} target="_blank" rel="noopener noreferrer">{photo.license}</a></>} · кадрирование</small></div>:<div className="poi-no-photo">{loading?<LoaderCircle className="spin"/>:<Camera/>}<span>{loading?'Загружаем фото объекта…':'Фото объекта пока нет в источнике'}</span></div>}
  {place.description&&<p>{place.description}</p>}
  {twoGis?.featuresText&&<p>{twoGis.featuresText}</p>}
  <div className="poi-facts"><div><Clock size={20}/><section><strong>Часы работы</strong><PlaceHours place={place}/>{place.hoursNote&&<p>{place.hoursNote}</p>}{safeUrl(place.hoursSource||place.osmUrl)&&<a href={safeUrl(place.hoursSource||place.osmUrl)} target="_blank" rel="noopener noreferrer">{twoGis&&place.hoursSource===twoGis.url?'Расписание 2ГИС':place.hoursSource===place.googleMapsUrl?'Расписание Google Maps':place.hoursSource?'Расписание на сайте':'Данные OpenStreetMap'}</a>}</section></div>{food&&<div><Utensils size={20}/><section><strong>Кухня и меню</strong><p>{formatCuisine(place.cuisine)}</p>{safeUrl(place.menuUrl||place.website)&&<a href={safeUrl(place.menuUrl||place.website)} target="_blank" rel="noopener noreferrer">{place.menuUrl?'Меню заведения':'Сайт заведения'}</a>}</section></div>}</div>
  {place.dataUpdatedAt&&<p className="poi-updated">Данные {place.dataSource||'OpenStreetMap'} обновлены {new Date(place.dataUpdatedAt).toLocaleDateString('ru-RU')}. Расписание может измениться — уточните перед посещением.</p>}
  {!twoGis&&place.checkedAt&&!!place.verifiedFields?.length&&<p className="poi-updated">{place.verifiedFields.includes('openingHours')?'Расписание':'Сведения'} проверены {new Date(place.checkedAt).toLocaleDateString('ru-RU')}.</p>}
  {safeUrl(place.website)&&<a className="poi-website" href={safeUrl(place.website)} target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/>Сайт объекта</a>}
 </>;
}

export function PlaceDetails({place,onSelect,googleEnabled=false}:{place:Place;onSelect:()=>void;googleEnabled?:boolean}){
 const [googleReady,setGoogleReady]=useState(false);
 return <><div className="place-details-scroll">{googleEnabled&&<GooglePlaceCard place={place} onReady={setGoogleReady}/>}
 {googleEnabled?<details className="catalogue-details" open={!googleReady}><summary>Сведения каталога · OpenStreetMap</summary><CatalogueDetails place={place}/></details>:<CatalogueDetails place={place}/>}
 </div><div className="place-details-actions"><button className="build-btn" onClick={onSelect}>Выбрать финишем</button></div></>;
}
