import {distance,type Place} from './places';
type Point={lat:number;lon:number};
type Snap={a:number;b:number;point:Point;distance:number;component:number;reverse:boolean;t:number};
export type GraphSnapshot={GRAPH_DATE:string;NODE_COUNT:number;coordinates:string;degrees:string;targets:string};
export function createLocalRouter(snapshot:GraphSnapshot){
let graph:ReturnType<typeof initialize>|undefined;
function values(text:string,signed=false){const raw=atob(text);let count=0;for(let i=0;i<raw.length;i++)if(!(raw.charCodeAt(i)&128))count++;const result=new Int32Array(count);let value=0,shift=0,index=0;for(let i=0;i<raw.length;i++){const byte=raw.charCodeAt(i);value+=(byte&127)*2**shift;if(byte&128)shift+=7;else{result[index++]=signed?(value&1?-(value+1)/2:value/2):value;value=0;shift=0;}}return result;}
function initialize(){
 const coordinates=values(snapshot.coordinates,true);for(let i=2;i<coordinates.length;i++)coordinates[i]+=coordinates[i-2];
 const degrees=values(snapshot.degrees),offsets=new Uint32Array(snapshot.NODE_COUNT+1);for(let i=0;i<degrees.length;i++)offsets[i+1]=offsets[i]+degrees[i];
 const targets=values(snapshot.targets,true),components=new Uint32Array(snapshot.NODE_COUNT);for(let i=0;i<components.length;i++)components[i]=i;
 const find=(i:number):number=>{while(components[i]!==i){components[i]=components[components[i]];i=components[i];}return i;};
 for(let a=0;a<components.length;a++)for(let k=offsets[a];k<offsets[a+1];k++){targets[k]+=a;const ra=find(a),rb=find(targets[k]);if(ra!==rb)components[ra]=rb;}
 for(let i=0;i<components.length;i++)components[i]=find(i);
 const point=(i:number):Point=>({lat:coordinates[i*2]/1e6,lon:coordinates[i*2+1]/1e6});
 const grid=new Map<string,number[]>();
 const key=(lat:number,lon:number)=>`${Math.floor(lat*1000)},${Math.floor(lon*500)}`;
 for(let a=0;a<components.length;a++)for(let k=offsets[a];k<offsets[a+1];k++){const b=targets[k],p=point(a),q=point(b);const steps=Math.max(1,Math.ceil(Math.max(Math.abs(p.lat-q.lat)*1000,Math.abs(p.lon-q.lon)*500)));let previous='';for(let step=0;step<=steps;step++){const cell=key(p.lat+(q.lat-p.lat)*step/steps,p.lon+(q.lon-p.lon)*step/steps);if(cell===previous)continue;previous=cell;const bucket=grid.get(cell);if(bucket)bucket.push(a);else grid.set(cell,[a]);}}
 return {coordinates,offsets,targets,components,point,grid,key};
}
function snaps(p:Point,g:ReturnType<typeof initialize>):Snap[]{
 const nearby=new Set<number>();const y=Math.floor(p.lat*1000),x=Math.floor(p.lon*500);
 for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++)for(const i of g.grid.get(`${y+dy},${x+dx}`)||[])nearby.add(i);
 const best=new Map<number,Snap>();const cos=Math.cos(p.lat*Math.PI/180);
 for(const a of nearby)for(let k=g.offsets[a];k<g.offsets[a+1];k++){
  const b=g.targets[k],pa=g.point(a),pb=g.point(b),dx=(pb.lon-pa.lon)*cos,dy=pb.lat-pa.lat;
  const t=Math.max(0,Math.min(1,((p.lon-pa.lon)*cos*dx+(p.lat-pa.lat)*dy)/(dx*dx+dy*dy||1)));
  const point={lat:pa.lat+(pb.lat-pa.lat)*t,lon:pa.lon+(pb.lon-pa.lon)*t},d=distance(p,point),component=g.components[a];
  if(d<=250&&d<(best.get(component)?.distance??Infinity)){let reverse=false;for(let j=g.offsets[b];j<g.offsets[b+1];j++)if(g.targets[j]===a){reverse=true;break;}best.set(component,{a,b,point,distance:d,component,reverse,t});}
 }
 return [...best.values()].sort((a,b)=>a.distance-b.distance);
}
class Heap {
 items:{id:number;score:number}[]=[];
 push(id:number,score:number){const value={id,score};let i=this.items.length;this.items.push(value);while(i){const parent=(i-1)>>1;if(this.items[parent].score<=score)break;this.items[i]=this.items[parent];i=parent;}this.items[i]=value;}
 pop(){const first=this.items[0],last=this.items.pop()!;if(this.items.length){let i=0;while(i*2+1<this.items.length){let child=i*2+1;if(child+1<this.items.length&&this.items[child+1].score<this.items[child].score)child++;if(this.items[child].score>=last.score)break;this.items[i]=this.items[child];i=child;}this.items[i]=last;}return first;}
}
function segment(start:Point,end:Point){
 const g=graph??=initialize();const starts=snaps(start,g),ends=snaps(end,g);
 const pairs=starts.flatMap(s=>ends.filter(e=>e.component===s.component).map(e=>({s,e,score:s.distance+e.distance}))).sort((a,b)=>a.score-b.score);
 const match=pairs[0];if(!match)throw new Error('Рядом с выбранными точками нет соединённого пешеходного пути. Выберите старт или финиш ближе к улице.');
 const {s,e}=match;let path:Point[]=[];
 if((s.a===e.a&&s.b===e.b&&(s.t<=e.t||s.reverse))||(s.a===e.b&&s.b===e.a&&s.reverse))path=[s.point,e.point];
 else {
  const costs=new Float64Array(g.components.length);costs.fill(Infinity);const previous=new Int32Array(g.components.length);previous.fill(-1);const closed=new Uint8Array(g.components.length);const heap=new Heap();
  for(const id of s.reverse?[s.a,s.b]:[s.b]){costs[id]=distance(s.point,g.point(id));heap.push(id,costs[id]+distance(g.point(id),e.point));}
  let goal=-1,best=Infinity;
  while(heap.items.length){const current=heap.pop();if(current.score>=best)break;const a=current.id;if(closed[a])continue;closed[a]=1;
   if(a===e.a||(a===e.b&&e.reverse)){const cost=costs[a]+distance(g.point(a),e.point);if(cost<best){best=cost;goal=a;}}
   for(let k=g.offsets[a];k<g.offsets[a+1];k++){const b=g.targets[k];if(closed[b])continue;const cost=costs[a]+distance(g.point(a),g.point(b));if(cost<costs[b]){costs[b]=cost;previous[b]=a;heap.push(b,cost+distance(g.point(b),e.point));}}
  }
  if(goal<0)throw new Error('Для этих точек не найден пешеходный путь. Выберите другую точку на ближайшей улице.');
  for(let i=goal;i>=0;i=previous[i])path.push(g.point(i));path.reverse();path=[s.point,...path,e.point];
 }
 const points=[start,...path,end];let meters=0;for(let i=1;i<points.length;i++)meters+=distance(points[i-1],points[i]);
 return {shape:points.map(p=>[p.lat,p.lon]),distance:meters,walkingMinutes:Math.ceil(meters/75)};
}
function localRoute(points:Place[]){
 const shape:number[][]=[];let meters=0;
 for(let i=1;i<points.length;i++){const result=segment(points[i-1],points[i]);shape.push(...result.shape.slice(i>1?1:0));meters+=result.distance;}
 return {shape,distance:meters,walkingMinutes:Math.ceil(meters/75)};
}
return localRoute;
}
