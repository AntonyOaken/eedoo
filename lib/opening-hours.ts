type Period = [number,number];
type Week = Period[][];
export type HoursStatus = {state:'open'|'closed'|'unknown';label:string;detail?:string;minutesUntilChange?:number;countdown?:boolean};
const DAYS=['Mo','Tu','We','Th','Fr','Sa','Su'];
const MINUTE=60_000,DAY=1440*MINUTE;
const cache=new Map<string,Week|null>();

function selectedDays(selector:string):number[]|null{
 if(!selector)return [0,1,2,3,4,5,6];
 const result=new Set<number>();
 for(const token of selector.replace(/\s/g,'').split(',')){
  const match=token.match(/^(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?$/i);
  if(!match)return null;
  const start=DAYS.findIndex(day=>day.toLowerCase()===match[1].toLowerCase());
  const end=match[2]?DAYS.findIndex(day=>day.toLowerCase()===match[2].toLowerCase()):start;
  for(let i=start;;i=(i+1)%7){result.add(i);if(i===end)break;}
 }
 return [...result];
}

// Only claim a current status for fully understood weekly rules. Seasonal,
// holiday and appointment rules remain visible in the original schedule.
export function parseWeeklyHours(value:string):Week|null{
 if(cache.has(value))return cache.get(value)!;
 const week:Week=Array.from({length:7},()=>[]);
 const rules=value.trim().replace(/[–—]/g,'-').split(';');
 for(const raw of rules){
  const rule=raw.trim();
  const match=rule.match(/^([a-z,\s-]*?)\s*(24\/7|off|closed|open|\d{1,2}:\d{2}.*)$/i);
  if(!match){cache.set(value,null);return null;}
  const days=selectedDays(match[1].trim());
  if(!days){cache.set(value,null);return null;}
  const times=match[2].trim();
  const periods:Period[]=[];
  if(/^(24\/7|open)$/i.test(times))periods.push([0,1440]);
  else if(!/^(off|closed)$/i.test(times)){
   for(const range of times.split(',')){
    const m=range.trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})(?:\s+open)?$/i);
    if(!m){cache.set(value,null);return null;}
    const [h1,m1,h2,m2]=m.slice(1).map(Number);
    if(h1>23||h2>24||m1>59||m2>59||(h2===24&&m2!==0)){
     cache.set(value,null);return null;
    }
    const start=h1*60+m1;let end=h2*60+m2;
    if(end<=start)end+=1440;
    periods.push([start,end]);
   }
  }
  // Later rules override the selected day (e.g. "Mo-Su ...; We off").
  for(const day of days)week[day]=periods;
 }
 cache.set(value,week);return week;
}

function localClock(now:Date,timeZone:string):number{
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(now);
 const n=(type:string)=>Number(parts.find(part=>part.type===type)?.value);
 return Date.UTC(n('year'),n('month')-1,n('day'),n('hour'),n('minute'),n('second'),now.getUTCMilliseconds());
}

export function getHoursStatus(value:string|undefined,timeZone:string|undefined,now:Date,businessStatus?:'temporarily_closed'|'permanently_closed'):HoursStatus{
 if(businessStatus)return {state:'closed',label:'Закрыто',detail:businessStatus==='temporarily_closed'?'Временно закрыто':'Закрыто навсегда'};
 const unknown:HoursStatus={state:'unknown',label:'Статус неизвестен'};
 if(!value||!timeZone||!Number.isFinite(now.getTime()))return unknown;
 const week=parseWeeklyHours(value);if(!week)return unknown;
 let clock:number;try{clock=localClock(now,timeZone);}catch{return unknown;}
 const date=new Date(clock),midnight=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate());
 const weekday=(date.getUTCDay()+6)%7;
 const intervals:Period[]=[];
 // Include yesterday's overnight hours and two weeks ahead, so adjacent
 // sessions merge and a weekly boundary does not create a false closing.
 for(let offset=-1;offset<=14;offset++){
  for(const [start,end] of week[(weekday+offset+7)%7])intervals.push([midnight+offset*DAY+start*MINUTE,midnight+offset*DAY+end*MINUTE]);
 }
 intervals.sort((a,b)=>a[0]-b[0]);
 const merged:Period[]=[];
 for(const period of intervals){
  const last=merged[merged.length-1];
  if(last&&period[0]<=last[1])last[1]=Math.max(last[1],period[1]);else merged.push([...period]);
 }
 const current=merged.find(([start,end])=>start<=clock&&clock<end);
 const state=current?'open':'closed';
 const label=current?'Открыто сейчас':'Закрыто';
 const change=current?.[1]??merged.find(([start])=>start>clock)?.[0];
 if(change===undefined)return {state,label,detail:'Закрыто по расписанию'};
 if(change-clock>7*DAY)return {state,label,detail:'Круглосуточно'};
 const delta=change-clock,countdown=delta<60*MINUTE;
 const minutesUntilChange=Math.max(1,Math.ceil(delta/MINUTE));
 const verb=current?'Закроется':'Откроется';
 const event=new Date(change);
 const time=`${String(event.getUTCHours()).padStart(2,'0')}:${String(event.getUTCMinutes()).padStart(2,'0')}`;
 const dayOffset=Math.round((Date.UTC(event.getUTCFullYear(),event.getUTCMonth(),event.getUTCDate())-midnight)/DAY);
 const day=dayOffset===0?'':dayOffset===1?' завтра':` в ${['понедельник','вторник','среду','четверг','пятницу','субботу','воскресенье'][(event.getUTCDay()+6)%7]}`;
 return {state,label,minutesUntilChange,countdown,detail:countdown?`${verb} через ${minutesUntilChange} мин`:`${verb}${day} в ${time}`};
}
