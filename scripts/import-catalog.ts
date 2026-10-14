import {readFile} from 'node:fs/promises';import {createHash,randomUUID} from 'node:crypto';
import {database,closeDatabase} from '../db/index';import {validateSnapshot} from '../lib/catalog-contract';
const file=process.argv[2];if(!file)throw new Error('Usage: pnpm catalog:import <snapshot.json>');
const raw=await readFile(file,'utf8'),data:unknown=JSON.parse(raw);validateSnapshot(data);
const revision=createHash('sha256').update(raw).digest('hex'),client=await database().connect(),job=randomUUID();
try{
 await client.query('SELECT pg_advisory_lock(71014202)');
 if((await client.query('SELECT id FROM catalog_revisions WHERE id=$1',[revision])).rowCount)console.log('Already imported:',revision);
 else{
  await client.query('INSERT INTO import_jobs(id,revision,source,status) VALUES($1,$2,$3,$4)',[job,revision,data.source,'staging']);
  let count=0;
  try{
   await client.query('BEGIN');
   const total=Object.values(data.cities).flatMap(c=>Object.values(c)).reduce((n,rows)=>n+rows.length,0);
   await client.query('INSERT INTO catalog_revisions(id,source,row_count,manifest) VALUES($1,$2,$3,$4)',[revision,data.source,total,{format:1}]);
   for(const [city,modes] of Object.entries(data.cities))for(const [mode,places] of Object.entries(modes))for(let offset=0;offset<places.length;offset+=500){
    const rows=places.slice(offset,offset+500).map(p=>({id:p.id,name:p.name,category:p.category||null,priority:p.priority||1,lat:p.lat,lon:p.lon,facts:p,search_text:[p.name,...(p.aliases||[])].join(' ').toLocaleLowerCase('ru')}));
    await client.query(`INSERT INTO places(revision,city,mode,id,name,category,priority,location,facts,search_text) SELECT $1,$2,$3,r.id,r.name,r.category,r.priority,ST_SetSRID(ST_MakePoint(r.lon,r.lat),4326)::geography,r.facts,r.search_text FROM jsonb_to_recordset($4::jsonb) AS r(id text,name text,category text,priority integer,lat double precision,lon double precision,facts jsonb,search_text text)`,[revision,city,mode,JSON.stringify(rows)]);
    count+=rows.length;
   }
   await client.query('INSERT INTO catalog_state(singleton,revision) VALUES(true,$1) ON CONFLICT(singleton) DO UPDATE SET revision=excluded.revision',[revision]);
   await client.query('UPDATE import_jobs SET status=$2,checkpoint=$3,finished_at=now() WHERE id=$1',[job,'published',count]);
   await client.query('COMMIT');console.log('Published revision',revision,'records',count);
  }catch(e){await client.query('ROLLBACK');await client.query('UPDATE import_jobs SET status=$2,error_code=$3,finished_at=now() WHERE id=$1',[job,'failed','IMPORT_FAILED']);throw e;}
 }
}finally{await client.query('SELECT pg_advisory_unlock(71014202)');client.release();await closeDatabase();}

