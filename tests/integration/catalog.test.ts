import {test,after} from 'node:test';import assert from 'node:assert/strict';import {database,closeDatabase} from '../../db/index';import {queryPlaces,placeById,searchCatalog} from '../../lib/server/catalog';
const enabled=!!process.env.DATABASE_URL?.includes('poputi_test');
after(closeDatabase);
test('PostGIS revision switch, spatial lookup, quoted search, and transaction rollback',{skip:!enabled},async()=>{
 const db=database(),id='a'.repeat(64),client=await db.connect();
 try{
 await client.query('BEGIN');await client.query('INSERT INTO catalog_revisions(id,source,row_count,manifest) VALUES($1,$2,2,$3) ON CONFLICT DO NOTHING',[id,'test',{}]);await client.query('DELETE FROM places WHERE revision=$1',[id]);
 for(const [pid,lon] of [['near',30.31],['far',30.6]] as const){const facts={id:pid,name:'test_%',lat:59.93,lon};await client.query('INSERT INTO places(revision,city,mode,id,name,priority,location,facts,search_text) VALUES($1,$2,$3,$4,$5,1,ST_SetSRID(ST_MakePoint($6,59.93),4326)::geography,$7,$8)',[id,'spb','direct',pid,facts.name,lon,facts,'test_%']);}
 await client.query('INSERT INTO catalog_state(singleton,revision) VALUES(true,$1) ON CONFLICT(singleton) DO UPDATE SET revision=excluded.revision',[id]);await client.query('COMMIT');
 const rows=await queryPlaces('spb','direct',[59.92,30.3,59.94,30.32]);assert.deepEqual(rows.map(p=>p.id),['near']);assert.equal((await placeById('spb','direct','near'))?.name,'test_%');assert.equal((await searchCatalog('spb','_%')).length,2);assert.equal((await searchCatalog('spb',"' OR true --")).length,0);
 await client.query('BEGIN');await assert.rejects(client.query("UPDATE catalog_state SET revision='missing'"));await client.query('ROLLBACK');assert.equal((await db.query('SELECT revision FROM catalog_state')).rows[0].revision,id);
 }finally{client.release();}
});
