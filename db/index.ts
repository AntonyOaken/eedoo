import {Pool} from 'pg';
const state=globalThis as typeof globalThis & {poputiPool?:Pool};
export function database(){
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required');
 return state.poputiPool??=new Pool({connectionString:process.env.DATABASE_URL,max:Number(process.env.DB_POOL_SIZE||10),connectionTimeoutMillis:3000,idleTimeoutMillis:30000,statement_timeout:10000,application_name:'poputi'});
}
export async function closeDatabase(){await state.poputiPool?.end();state.poputiPool=undefined;}
