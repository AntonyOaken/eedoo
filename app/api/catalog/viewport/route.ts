import {api,ApiError} from '@/lib/server/http';import {scope,parseBounds} from '@/lib/server/input';import {queryPlaces,revision} from '@/lib/server/catalog';import {cacheKey,cached} from '@/lib/server/cache';
export const GET=(r:Request)=>api('catalog-viewport',r,async()=>{
 const p=new URL(r.url).searchParams,s=scope(p.get('city'),p.get('mode')),b=parseBounds(p.get('bounds'),s.city),after=p.get('after')||'',rev=p.get('revision')||await revision();
 if(after.length>200||!(/^[a-f0-9]{64}$/.test(rev)||rev==='seed-v55'))throw new ApiError(400,'Некорректная страница каталога.');
 const rows=b[0]>=b[2]||b[1]>=b[3]?[]:await cached(cacheKey('viewport',{...s,b,after,rev}),60,()=>queryPlaces(s.city,s.mode,b,{thin:true,after,limit:1001,revision:rev}));
 return Response.json({places:rows.slice(0,1000),after:rows.length>1000?rows[999].id:'',revision:rev});
},300);
