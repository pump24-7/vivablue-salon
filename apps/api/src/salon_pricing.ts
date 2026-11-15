import {DateTime} from 'luxon';
export type Modifier={id:string,label_en:string,label_es:string,additional_minutes:number,additional_price_cents:number};
export type PeakRule={weekday:number,start_local:string,end_local:string,surcharge_bps:number};
export function quoteSalonService(x:{baseMinutes:number,bufferMinutes:number,basePriceCents:number|null,
 selected:Modifier[],startsAt:string,timezone:string,peakRules:PeakRule[]}){
 const local=DateTime.fromISO(x.startsAt,{setZone:true}).setZone(x.timezone);
 if(!local.isValid)throw Error('Invalid local start');
 const base=x.basePriceCents;
 const extraMinutes=x.selected.reduce((n,m)=>n+m.additional_minutes,0);
 const addonCents=x.selected.reduce((n,m)=>n+m.additional_price_cents,0);
 const clock=local.toFormat('HH:mm');
 // Peak rules are opt-in, approved, and evaluated in the salon's configured IANA timezone.
 const matching=x.peakRules.filter(r=>r.weekday===local.weekday && clock>=r.start_local.slice(0,5) && clock<r.end_local.slice(0,5));
 const bps=Math.max(0,...matching.map(r=>r.surcharge_bps));
 const subtotal=base===null?null:base+addonCents;
 const peakCents=subtotal===null?null:Math.round(subtotal*bps/10000);
 return {serviceMinutes:x.baseMinutes+extraMinutes,occupiedMinutes:x.baseMinutes+extraMinutes+x.bufferMinutes,
   baseCents:base,modifierCents:addonCents,peakBps:bps,peakCents,
   totalCents:subtotal===null?null:subtotal+peakCents,timezone:x.timezone,
   disclaimer:'Estimate only until salon confirms consultation, services and charges.'};
}
