import {randomUUID,createHash} from 'node:crypto';
import {consumeLimit} from './cache';
export class ApiError extends Error{constructor(public status:number,message:string){super(message);}}
const metrics=new Map<string,{requests:number;errors:number;sum:number;buckets:number[]}>();
export function metricText(){
 const lines:string[]=[];for(const [name,m]of metrics){const label='{route="'+name+'"}';lines.push('poputi_http_requests_total'+label+' '+m.requests,'poputi_http_errors_total'+label+' '+m.errors,'poputi_http_duration_seconds_sum'+label+' '+m.sum,'poputi_http_duration_seconds_count'+label+' '+m.requests);
 [0.1,0.5,1,3,10,Infinity].forEach((le,i)=>lines.push('poputi_http_duration_seconds_bucket{route="'+name+'",le="'+(le===Infinity?'+Inf':le)+'"} '+m.buckets[i]));}
 return lines.join('\n')+'\n';
}
export async function api(name:string,request:Request,handler:()=>Promise<Response>,max=120){
 const id=randomUUID(),begin=performance.now();let response:Response;
 try{
  const ip=process.env.TRUST_PROXY==='1'?request.headers.get('x-forwarded-for')?.split(',')[0].trim()||'unknown':'local';
  const key='poputi:rate:'+name+':'+createHash('sha256').update(ip).digest('hex');
  if(!await consumeLimit(key,max,60))throw new ApiError(429,'Слишком много запросов. Повторите через минуту.');
  response=await handler();
 }catch(e){const status=e instanceof ApiError?e.status:503;response=Response.json({error:e instanceof ApiError?e.message:'Сервис временно недоступен. Повторите позже.',requestId:id},{status,headers:status===429?{'Retry-After':'60'}:{}});
  if(status>=500)console.error(JSON.stringify({level:'error',event:'request_failed',route:name,requestId:id}));}
 response.headers.set('X-Request-Id',id);response.headers.set('Cache-Control',response.headers.get('Cache-Control')||'no-store');
 const seconds=(performance.now()-begin)/1000,m=metrics.get(name)||{requests:0,errors:0,sum:0,buckets:[0,0,0,0,0,0]};m.requests++;m.errors+=Number(response.status>=500);m.sum+=seconds;[.1,.5,1,3,10,Infinity].forEach((n,i)=>{if(seconds<=n)m.buckets[i]++;});metrics.set(name,m);return response;
}
export async function jsonBody(request:Request){
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw new ApiError(415,'Ожидается JSON.');
 if(Number(request.headers.get('content-length')||0)>65536)throw new ApiError(413,'Слишком большой запрос.');
 const reader=request.body?.getReader(),chunks:Uint8Array[]=[];let size=0;if(reader){while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536){await reader.cancel();throw new ApiError(413,'Слишком большой запрос.');}chunks.push(value);}}const text=Buffer.concat(chunks).toString('utf8');
 try{return JSON.parse(text);}catch{throw new ApiError(400,'Некорректный JSON.');}
}
export function sameOrigin(request:Request){
 const origin=request.headers.get('origin'),expected=process.env.APP_ORIGIN||new URL(request.url).origin;
 if(!origin||origin!==expected)throw new ApiError(403,'Обновите страницу и повторите запрос.');
}

