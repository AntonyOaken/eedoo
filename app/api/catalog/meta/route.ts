import {api} from '@/lib/server/http';import {metadata} from '@/lib/server/catalog';
export const GET=(r:Request)=>api('catalog-meta',r,async()=>Response.json(await metadata()));
