import {mkdir,writeFile} from 'node:fs/promises';
import {CITIES} from '../lib/cities';import {WALK_MODES} from '../lib/walk-modes';import {getCatalog} from '../lib/catalog';
import {validateSnapshot,type CatalogSnapshot} from '../lib/catalog-contract';
const snapshot={format:1,source:'Sites v55 c2b6ce3',cities:Object.fromEntries(CITIES.map(city=>[city.id,Object.fromEntries(WALK_MODES.map(mode=>[mode,getCatalog(city.id,mode)]))]))} as CatalogSnapshot;
validateSnapshot(snapshot);await mkdir('work',{recursive:true});await writeFile(process.argv[2]||'work/catalog.json',JSON.stringify(snapshot));
console.log('Exported',Object.values(snapshot.cities).flatMap(c=>Object.values(c)).reduce((n,rows)=>n+rows.length,0),'mode-specific records');

