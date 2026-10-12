import assert from 'node:assert/strict';
import test from 'node:test';
import {closureTime,closureEndTime} from '../app/manage/closure-time.ts';
test('7 PM through midnight retains a same-day end of 24:00',()=>{assert.equal(closureTime(19*60),'19:00');assert.equal(closureTime(1440),'24:00');assert.equal(closureEndTime('00:00'),'24:00');assert.ok(closureTime(1440)>closureTime(19*60));});
test('ordinary times and midnight starts keep their meaning',()=>{assert.equal(closureTime(0),'00:00');assert.equal(closureTime(1380),'23:00');assert.equal(closureEndTime('20:00'),'20:00');assert.throws(()=>closureTime(1441));});
