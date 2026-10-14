import {createClient} from 'redis';
import {createHash} from 'node:crypto';
let client:ReturnType<typeof createClient>|undefined,connecting:Promise<void>|undefined,retryAt=0;
export async function sharedRedis(){
 if(!process.env.REDIS_URL)return undefined;
 if(client?.isReady)return client;
 if(Date.now()<retryAt)throw new Error('Shared cache unavailable');
 if(!connecting){
  client??=createClient({url:process.env.REDIS_URL,disableOfflineQueue:true,socket:{connectTimeout:1000,reconnectStrategy:false}});
  client.on('error',()=>{});
  connecting=client.connect().then(()=>{}).catch(()=>{retryAt=Date.now()+5000;throw new Error('Shared cache unavailable');}).finally(()=>{connecting=undefined;});
 }
 await connecting;return client;
}
const local=new Map<string,{expires:number;value:unknown}>(),pending=new Map<string,Promise<unknown>>();
export const cacheKey=(scope:string,value:unknown)=>'poputi:'+scope+':'+createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function cached<T>(key:string,seconds:number,compute:()=>Promise<T>):Promise<T>{
 const redis=await sharedRedis().catch(()=>undefined);
 if(redis){const value=await redis.get(key).catch(()=>null);if(value)return JSON.parse(value) as T;}
 const hit=local.get(key);if(hit&&hit.expires>Date.now())return hit.value as T;
 if(pending.has(key))return pending.get(key) as Promise<T>;
 const task=compute().then(async value=>{
  if(local.size>=512)local.delete(local.keys().next().value!);
  local.set(key,{expires:Date.now()+seconds*1000,value});
  if(redis)await redis.set(key,JSON.stringify(value),{EX:seconds}).catch(()=>{});
  return value;
 }).finally(()=>pending.delete(key));
 pending.set(key,task);return task;
}
const limits=new Map<string,{count:number;expires:number}>();
export async function consumeLimit(key:string,max:number,seconds:number):Promise<boolean>{
 const redis=await sharedRedis();
 if(redis){const count=Number(await redis.eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n",{keys:[key],arguments:[String(seconds)]}));return count<=max;}
 const now=Date.now(),hit=limits.get(key);
 if(!hit||hit.expires<=now){if(limits.size>10000){for(const [k,v]of limits)if(v.expires<=now)limits.delete(k);if(limits.size>10000)limits.delete(limits.keys().next().value!);}limits.set(key,{count:1,expires:now+seconds*1000});return true;}
 return ++hit.count<=max;
}

