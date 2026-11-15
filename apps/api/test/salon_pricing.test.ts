import test from 'node:test';
import assert from 'node:assert/strict';
import {quoteSalonService} from '../src/salon_pricing.js';
const base={baseMinutes:60,bufferMinutes:10,basePriceCents:7000,
 selected:[{id:'x',label_en:'Extra length',label_es:'Largo',additional_minutes:20,additional_price_cents:1500}],
 startsAt:'2026-11-09T16:00:00Z',timezone:'America/New_York'};
test('Salon quote adds modifiers, buffers, and approved local peak',()=>{
 const q=quoteSalonService({...base,peakRules:[{weekday:1,start_local:'10:00:00',end_local:'15:00:00',surcharge_bps:1000}]});
 assert.equal(q.serviceMinutes,80);assert.equal(q.occupiedMinutes,90);
 assert.equal(q.peakBps,1000);assert.equal(q.totalCents,9350);
});
test('Local peak window respects IANA timezone',()=>{
 const q=quoteSalonService({...base,startsAt:'2026-11-09T23:00:00Z',peakRules:[{weekday:1,start_local:'10:00',end_local:'15:00',surcharge_bps:1000}]});
 assert.equal(q.peakBps,0);assert.equal(q.totalCents,8500);
});
test('Unknown base price stays unknown instead of being fabricated',()=>{
 const q=quoteSalonService({...base,basePriceCents:null,peakRules:[]});assert.equal(q.totalCents,null);
});
