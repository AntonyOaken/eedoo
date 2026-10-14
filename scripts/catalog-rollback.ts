import {database,closeDatabase} from '../db/index';
const revision=process.argv[2];if(!revision)throw new Error('Usage: tsx scripts/catalog-rollback.ts <revision>');const client=await database().connect();
try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(71014202)');const r=await client.query('UPDATE catalog_state SET revision=$1 WHERE singleton AND EXISTS(SELECT 1 FROM catalog_revisions WHERE id=$1)',[revision]);if(r.rowCount!==1)throw new Error('Unknown revision');await client.query('COMMIT');console.log('Active revision:',revision);}
catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();await closeDatabase();}

