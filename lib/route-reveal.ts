/** Distance-based reveal: uneven street segments must draw at a steady speed. */
export function routeReveal(shape: readonly (readonly number[])[]) {
 const points=shape.map(p=>[p[0],p[1]] as [number,number]);
 const length=(a:readonly number[],b:readonly number[])=>{
  const rad=Math.PI/180,dx=(b[1]-a[1])*rad*Math.cos((a[0]+b[0])*rad/2),dy=(b[0]-a[0])*rad;
  return Math.hypot(dx,dy)*6371000;
 };
 const cumulative=[0];
 for(let i=1;i<points.length;i++)cumulative.push(cumulative[i-1]+length(points[i-1],points[i]));
 const total=cumulative.at(-1)||0;
 const clamp=(p:number)=>Math.max(0,Math.min(1,Number.isFinite(p)?p:0));
 return {
  total,
  frame(progress:number):[number,number][] {
   if(points.length<2||total===0)return points.map(p=>[...p]);
   const target=clamp(progress)*total;
   if(target>=total)return points.map(p=>[...p]);
   let i=1;while(i<points.length-1&&cumulative[i]<target)i++;
   const segment=cumulative[i]-cumulative[i-1],t=segment?(target-cumulative[i-1])/segment:0;
   return [...points.slice(0,i),[points[i-1][0]+(points[i][0]-points[i-1][0])*t,points[i-1][1]+(points[i][1]-points[i-1][1])*t]];
  },
  progressAt(place:{lat:number;lon:number}) {
   if(total===0)return 0;
   let best=Infinity,along=0;const cos=Math.cos(place.lat*Math.PI/180);
   for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],dx=(b[1]-a[1])*cos,dy=b[0]-a[0];
    const t=clamp(((place.lon-a[1])*cos*dx+(place.lat-a[0])*dy)/(dx*dx+dy*dy||1));
    const projected=[a[0]+dy*t,a[1]+(b[1]-a[1])*t];
    const d=length([place.lat,place.lon],projected);
    if(d<best){best=d;along=cumulative[i-1]+(cumulative[i]-cumulative[i-1])*t;}
   }
   return clamp(along/total);
  }
 };
}
