import {database} from '../../db/index';
import {getCity,type CityId} from '../cities';
import type {WalkMode} from '../walk-modes';import {thinPlace,type Bounds} from '../catalog-contract';
import type {Place} from '../places';import {cached,cacheKey} from './cache';
async function seedCatalog(city:CityId,mode:WalkMode='direct'){const data=await cached('dev-seed-snapshot',60,async()=>JSON.parse(await (await import('node:fs/promises')).readFile(process.cwd()+'/work/catalog.json','utf8')));return data.cities[city][mode] as Place[];}
function seedMode(){
 const mode=process.env.CATALOG_BACKEND||'postgres';
 if(mode==='seed'&&process.env.NODE_ENV==='production'&&process.env.ALLOW_SEED_CATALOG!=='1')throw new Error('Seed catalog is disabled in production');
 return mode==='seed';
}
export async function revision(){if(seedMode())return 'seed-v55';const r=await database().query('SELECT revision FROM catalog_state WHERE singleton');if(!r.rows[0])throw new Error('Catalog not imported');return r.rows[0].revision as string;}
export async function queryPlaces(city:CityId,mode:WalkMode,bounds:Bounds,options:{thin?:boolean;after?:string;limit?:number;revision?:string}={}){
 getCity(city);const rev=options.revision||await revision(),limit=options.limit||100001,after=options.after||'';
 if(seedMode()){
  const rows=(await seedCatalog(city,mode)).filter(p=>p.id>after&&p.lat>=bounds[0]&&p.lon>=bounds[1]&&p.lat<=bounds[2]&&p.lon<=bounds[3]).sort((a,b)=>a.id<b.id?-1:1).slice(0,limit);
  return options.thin?rows.map(thinPlace):rows;
 }
 const select=options.thin?"jsonb_build_object('id',p.id,'name',p.name,'lat',ST_Y(p.location::geometry),'lon',ST_X(p.location::geometry),'category',p.category,'priority',p.priority,'hasPhoto',jsonb_typeof(p.facts->'photo')='object','minutes',p.facts->'minutes','businessStatus',p.facts->'businessStatus','openingHours',p.facts->'openingHours')":'p.facts';
 const result=await database().query(`SELECT ${select} AS facts FROM places p WHERE p.revision=$1 AND p.city=$2 AND p.mode=$3 AND p.id>$8 AND p.location::geometry && ST_MakeEnvelope($4,$5,$6,$7,4326) ORDER BY p.id LIMIT $9`,[rev,city,mode,bounds[1],bounds[0],bounds[3],bounds[2],after,limit]);
 return result.rows.map(r=>r.facts) as Place[];
}
export async function placeById(city:CityId,mode:WalkMode,id:string):Promise<Place|undefined>{
 if(seedMode()){return (await seedCatalog(city,mode)).find(p=>p.id===id);}
 const result=await database().query('SELECT facts FROM places WHERE revision=(SELECT revision FROM catalog_state WHERE singleton) AND city=$1 AND mode=$2 AND id=$3',[city,mode,id]);return result.rows[0]?.facts;
}
export async function searchCatalog(city:CityId,q:string):Promise<Place[]>{
 if(seedMode()){return (await seedCatalog(city)).filter(p=>[p.name,...(p.aliases||[])].some(n=>n.toLocaleLowerCase('ru').includes(q.toLocaleLowerCase('ru')))).slice(0,15);}
 const literal=q.toLocaleLowerCase('ru').replace(/[\\%_]/g,m=>'\\'+m);
 const r=await database().query("SELECT facts FROM places WHERE revision=(SELECT revision FROM catalog_state WHERE singleton) AND city=$1 AND mode='direct' AND search_text LIKE $2 ESCAPE '\\' ORDER BY priority DESC,name LIMIT 15",[city,'%'+literal+'%']);return r.rows.map(row=>row.facts);
}
export async function metadata(){
 const rev=await revision();return cached(cacheKey('metadata',rev),60,async()=>{
  const rows=await Promise.all(['spb','kurgan','phuket'].map(async id=>{const city=getCity(id),places=await queryPlaces(city.id,'direct',city.bounds,{thin:true,revision:rev});
   const matching=places.filter(p=>p.name.toLocaleLowerCase().includes(city.defaultDestination));
   const end=id==='spb'?places.find(p=>p.id==='hermitage'):matching.find(p=>p.category==='Музей')||matching[0];
   return {id,counts:places.length,defaultEnd:end||city.example};
  }));return {revision:rev,cities:rows,tileUrl:process.env.TILE_URL||(process.env.NODE_ENV==='production'?'':'https://tile.openstreetmap.org/{z}/{x}/{y}.png'),tileAttribution:process.env.TILE_ATTRIBUTION||'© OpenStreetMap contributors'};
 });
}
export async function mapMedia(places:Place[]):Promise<Place[]>{
 const base=process.env.MEDIA_PUBLIC_URL?.replace(/\/$/,'');if(!base||seedMode())return places;
 const paths=[...new Set(places.flatMap(p=>[p.photo?.url,p.image,p.twoGis?.photo?.url]).filter((p):p is string=>!!p&&p.startsWith('/photos/')))];
 if(!paths.length)return places;
 const rows=await database().query('SELECT source_path,object_key FROM media_objects WHERE source_path=ANY($1::text[])',[paths]),map=new Map<string,string>(rows.rows.map(r=>[r.source_path,base+'/'+r.object_key]));
 const url=(p:string|undefined)=>p?.startsWith('/photos/')?(map.get(p)||undefined):p;
 return places.map(p=>({...p,image:url(p.image),photo:p.photo?{...p.photo,url:url(p.photo.url)!}:undefined,twoGis:p.twoGis?{...p.twoGis,photo:p.twoGis.photo?{...p.twoGis.photo,url:url(p.twoGis.photo.url)!}:undefined}:undefined}));
}

