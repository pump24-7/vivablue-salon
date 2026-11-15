import {DateTime} from 'luxon';
export type Shift={weekday:number,start_local:string,end_local:string};
export type Block={start_at:string,end_at:string};
export type AvailabilityInput={date:string,timezone:string,durationMinutes:number,
 shifts:Shift[],busy:Block[],stepMinutes?:number,now?:DateTime};
// All server slot times are UTC instants. Luxon resolves salon-local civil time and DST.
export function availableSlots(x:AvailabilityInput):string[]{
 const day=DateTime.fromISO(x.date,{zone:x.timezone});
 if(!day.isValid||day.toISODate()!==x.date||x.durationMinutes<15||x.durationMinutes>480)return [];
 const now=x.now??DateTime.utc();const earliest=now.plus({minutes:30});
 const result:string[]=[];const step=x.stepMinutes??15;
 for(const shift of x.shifts.filter(s=>s.weekday===day.weekday)){
  const [sh,sm]=shift.start_local.slice(0,5).split(':').map(Number);
  const [eh,em]=shift.end_local.slice(0,5).split(':').map(Number);
  let cursor=day.set({hour:sh,minute:sm,second:0,millisecond:0});
  const end=day.set({hour:eh,minute:em,second:0,millisecond:0});
  for(;cursor.plus({minutes:x.durationMinutes})<=end;cursor=cursor.plus({minutes:step})){
   if(cursor<earliest)continue;
   const slotEnd=cursor.plus({minutes:x.durationMinutes});
   const conflicts=x.busy.some(b=>{
    const bs=DateTime.fromISO(new Date(b.start_at).toISOString()),be=DateTime.fromISO(new Date(b.end_at).toISOString());
    return cursor<be&&slotEnd>bs;
   });
   if(!conflicts)result.push(cursor.toUTC().toISO({suppressMilliseconds:true})!);
  }
 }
 return [...new Set(result)].sort();
}
