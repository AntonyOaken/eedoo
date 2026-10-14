// Export the un-enriched baseline; importing against getCatalog would match our
// newly added 2GIS IDs instead of the original stable catalogue identities.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
const root=fileURLToPath(new URL('../',import.meta.url));
const modules=new Map();
async function moduleUrl(file){
 if(modules.has(file))return modules.get(file);
 let code=await readFile(file,'utf8');
 if(file.endsWith('.json'))code='export default '+code+';';
 else{
  code=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  for(const reference of [...code.matchAll(/from\s+['"](\.[^'"]+)['"]/g)]){
   const path=resolve(dirname(file),reference[1]);
   code=code.replace(reference[0],'from '+JSON.stringify(await moduleUrl(path.endsWith('.json')?path:path+'.ts')));
  }
 }
 const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');modules.set(file,url);return url;
}
if(!process.argv[2])throw Error('Usage: node scripts/export-spb-baseline.mjs /absolute/path/to/baseline.json');
const {CATALOG}=await import(await moduleUrl(resolve(root,'lib/catalog.ts')));
await writeFile(process.argv[2],JSON.stringify(CATALOG));
console.log(`Exported ${CATALOG.length} baseline places`);
