import assert from 'node:assert/strict';
import test from 'node:test';
import {calendarBookingRows} from '../app/manage/calendar-booking-rows.ts';
const date='2026-09-30';
function slot(court,hour,status='confirmed'){return {court_id:court,starts_at:`${date}T${hour}:00:00+08:00`,ends_at:`${date}T${hour+1}:00:00+08:00`,status};}
const row={id:'booking-1',reference:'PB-ONE',court_id:'court-2',total_amount:2120,booking_slots:[...Array.from({length:4},(_,i)=>slot('court-1',19+i)),...Array.from({length:4},(_,i)=>slot('court-2',19+i))]};
test('two courts for four hours produce two timeline blocks under one reservation',()=>{const result=calendarBookingRows(row,date);assert.equal(result.length,2);assert.deepEqual(result.map(x=>x.court_id),['court-1','court-2']);for(const x of result){assert.equal(x.starts_at,'2026-09-30T11:00:00.000Z');assert.equal(x.ends_at,'2026-09-30T15:00:00.000Z');assert.equal(x.id,row.id);assert.equal(x.total_amount,2120);}assert.notEqual(result[0].schedule_key,result[1].schedule_key);});
test('released slots stay free and gaps are not filled',()=>{const result=calendarBookingRows({...row,booking_slots:[slot('court-1',19),slot('court-1',20,'released'),slot('court-1',21)]},date);assert.equal(result.length,2);assert.equal(result[0].ends_at,'2026-09-30T12:00:00.000Z');assert.equal(result[1].starts_at,'2026-09-30T13:00:00.000Z');});
test('different court times are preserved and duplicated slots are merged',()=>{const result=calendarBookingRows({...row,booking_slots:[slot('court-1',19),slot('court-1',19),slot('court-2',21)]},date);assert.equal(result.length,2);assert.notEqual(result[0].starts_at,result[1].starts_at);});
test('empty authoritative slots do not reserve the primary court; older responses retain fallback',()=>{assert.deepEqual(calendarBookingRows({...row,booking_slots:[]},date),[]);const old={id:'legacy'};assert.deepEqual(calendarBookingRows(old,date),[old]);});
