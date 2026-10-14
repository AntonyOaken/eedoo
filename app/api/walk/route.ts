import {api,ApiError,jsonBody,sameOrigin} from '@/lib/server/http';import {scope} from '@/lib/server/input';import {inCity,getCity} from '@/lib/cities';import {distance,type Place} from '@/lib/places';import {buildWalk} from '@/lib/routing';import {route} from '@/lib/server/router';import {queryPlaces,mapMedia} from '@/lib/server/catalog';import {boundsForShape} from '@/lib/catalog-contract';
export const POST=(r:Request)=>api('walk',r,async()=>{sameOrigin(r);const body=await jsonBody(r),{city,mode}=scope(body.city,body.mode),{start,end}=body;
 if(!start||!end||!inCity(start,getCity(city))||!inCity(end,getCity(city)))throw new ApiError(400,'Выберите старт и финиш в выбранном городе.');
 if(distance(start,end)<80||distance(start,end)>15000)throw new ApiError(400,'Выберите точки на расстоянии от 80 м до 15 км.');
 const clean=(p:Place)=>({lat:p.lat,lon:p.lon,id:String(p.id||'point').slice(0,80),name:String(p.name||'Точка на карте').slice(0,150)}),a=clean(start),b=clean(end),base=await route([a,b]);
 const catalog=await mapMedia(await queryPlaces(city,mode,boundsForShape(base.shape,2000)));let first=true;
 return Response.json(await buildWalk(a,b,mode,async points=>{if(first){first=false;return base;}return route(points);},catalog));
},30);
