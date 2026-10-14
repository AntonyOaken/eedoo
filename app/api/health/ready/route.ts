import {revision} from '@/lib/server/catalog';import {sharedRedis} from '@/lib/server/cache';
export async function GET(){try{await revision();const redis=await sharedRedis();if(redis)await redis.ping();return Response.json({status:'ready'});}catch{return Response.json({status:'unavailable'},{status:503});}}
