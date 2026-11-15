import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {DateTime} from 'luxon';
import {availableSlots} from '../src/scheduling.js';
const now=DateTime.fromISO('2026-11-07T08:00:00-05:00');
test('no shifts means no publicly bookable slots',()=>{
 assert.deepEqual(availableSlots({date:'2026-11-09',timezone:'America/New_York',durationMinutes:60,shifts:[],busy:[],now}),[]);
});
test('one hour service fits in shift and blocks cannot overlap',()=>{
 const shifts=[{weekday:1,start_local:'10:00',end_local:'12:00'}];
 const slots=availableSlots({date:'2026-11-09',timezone:'America/New_York',durationMinutes:60,shifts,busy:[{start_at:'2026-11-09T15:30:00Z',end_at:'2026-11-09T16:30:00Z'}],now});
 assert.deepEqual(slots,[]);
});
test('shift emits salon-local starts as UTC',()=>{
 const slots=availableSlots({date:'2026-11-09',timezone:'America/New_York',durationMinutes:60,shifts:[{weekday:1,start_local:'10:00',end_local:'11:00'}],busy:[],now});
 assert.deepEqual(slots,['2026-11-09T15:00:00Z']);
});
test('DST spring transition does not invent nonexistent local shifts',()=>{
 const slots=availableSlots({date:'2027-03-14',timezone:'America/New_York',durationMinutes:30,shifts:[{weekday:7,start_local:'02:00',end_local:'03:00'}],busy:[],now});
 assert.deepEqual(slots,[]);
});
