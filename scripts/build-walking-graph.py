"""Compile an OSM Overpass body/geom snapshot into a compact pedestrian graph.
Input: directory of deduplicated bbox JSON responses. Output: bundled TS data.
OSM data is © OpenStreetMap contributors, ODbL 1.0.
"""
import sys,json,base64,math,collections
from pathlib import Path
ways={};timestamp=''
for file in sorted(Path(sys.argv[1]).glob('*.json')):
 data=json.loads(file.read_bytes());timestamp=data.get('osm3s',{}).get('timestamp_osm_base',timestamp)
 for way in data['elements']:
  if way['type']=='way':ways[way['id']]=way
nodes={};edges=set();accepted=[];uses=collections.Counter()
for way in ways.values():
 tags=way.get('tags',{})
 if tags.get('highway') not in {'footway','pedestrian','path','steps','living_street','residential','service','unclassified','tertiary','tertiary_link','secondary','secondary_link','primary','primary_link','cycleway','track'}:continue
 if tags.get('area')=='yes' or tags.get('foot') in ('no','private'):continue
 if tags.get('access') in ('no','private') and tags.get('foot') not in ('yes','designated','permissive'):continue
 if tags.get('highway')=='cycleway' and tags.get('foot') not in ('yes','designated','permissive'):continue
 geometry=way.get('geometry',[]);ids=way.get('nodes',[])
 for node,p in zip(ids,geometry):
  if p:nodes[node]=(round(p['lat']*1e6),round(p['lon']*1e6))
 if not all(id in nodes for id in ids):continue
 uses.update(set(ids));accepted.append((ids,tags))
def simplify(ids):
 # Retain junctions and keep the walking line within two metres of OSM geometry.
 keep={0,len(ids)-1};keep.update(i for i,id in enumerate(ids) if uses[id]>1)
 anchors=sorted(keep);stack=list(zip(anchors,anchors[1:]))
 while stack:
  first,last=stack.pop()
  if last-first<2:continue
  a,b=nodes[ids[first]],nodes[ids[last]];cos=math.cos((a[0]+b[0])/2e6*math.pi/180)
  dx=(b[1]-a[1])*cos;dy=b[0]-a[0];maximum=4;chosen=None
  for i in range(first+1,last):
   p=nodes[ids[i]];x=(p[1]-a[1])*cos;y=p[0]-a[0];t=max(0,min(1,(x*dx+y*dy)/(dx*dx+dy*dy or 1)))
   squared=((x-dx*t)**2+(y-dy*t)**2)*(.111195**2)
   if squared>maximum:maximum=squared;chosen=i
  if chosen is not None:keep.add(chosen);stack.extend([(first,chosen),(chosen,last)])
 return [ids[i] for i in sorted(keep)]
for ids,tags in accepted:
 ids=simplify(ids)
 for a,b in zip(ids,ids[1:]):
  if a==b:continue
  one=tags.get('oneway:foot')
  if one!='-1':edges.add((a,b))
  if one not in ('yes','1','true'):edges.add((b,a))
used={id for edge in edges for id in edge};nodes={id:point for id,point in nodes.items() if id in used}
minlat=min(point[0] for point in nodes.values());minlon=min(point[1] for point in nodes.values())
def spatial_key(id):
 lat,lon=nodes[id];x=lon-minlon;y=lat-minlat;result=0
 for bit in range(21):result|=((x>>bit)&1)<<(bit*2);result|=((y>>bit)&1)<<(bit*2+1)
 return result
# Nearby nodes get nearby indexes, keeping coordinate and edge deltas small.
keys=sorted(nodes,key=spatial_key);index={id:i for i,id in enumerate(keys)};n=len(keys)
parent=list(range(n))
def find(x):
 while parent[x]!=x:parent[x]=parent[parent[x]];x=parent[x]
 return x
pairs=sorted((index[a],index[b]) for a,b in edges)
for a,b in pairs:
 ra,rb=find(a),find(b)
 if ra!=rb:parent[ra]=rb
# Zigzag varints compress coordinate deltas and neighbour index deltas.
def varints(values,signed=False):
 out=bytearray()
 for value in values:
  if signed:value=value*2 if value>=0 else -value*2-1
  while value>=128:out.append((value&127)|128);value>>=7
  out.append(value)
 return base64.b64encode(out).decode()
coords=[];previous=[0,0]
for id in keys:
 for i,value in enumerate(nodes[id]):coords.append(value-previous[i]);previous[i]=value
counts=[0]*n;targets=[]
for a,b in pairs:counts[a]+=1;targets.append(b-a)
output='// Generated from OpenStreetMap. ODbL: https://www.openstreetmap.org/copyright\n'
output+='export const GRAPH_DATE='+json.dumps(timestamp)+';\n'
output+='export const NODE_COUNT='+str(n)+';\n'
for name,text in [('coordinates',varints(coords,True)),('degrees',varints(counts)),('targets',varints(targets,True))]:
 output+='export const '+name+'='+json.dumps(text)+';\n'
Path(sys.argv[2] if len(sys.argv)>2 else 'lib/walking-graph-data.ts').write_text(output)
print(json.dumps({'nodes':n,'directedEdges':len(pairs),'components':len({find(i) for i in range(n)}),'moduleBytes':len(output),'date':timestamp}))
