import {metricText} from '@/lib/server/http';
export function GET(r:Request){if(!process.env.METRICS_TOKEN||r.headers.get('authorization')!=='Bearer '+process.env.METRICS_TOKEN)return new Response('Not found',{status:404});return new Response(metricText(),{headers:{'Content-Type':'text/plain; version=0.0.4'}});}
