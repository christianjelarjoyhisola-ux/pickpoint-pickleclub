import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '../tmp/weather-credit-tools/node_modules/@electric-sql/pglite/dist/index.js';
import { pgcrypto } from '../tmp/weather-credit-tools/node_modules/@electric-sql/pglite/dist/contrib/pgcrypto.js';

// Runs the actual migration in PostgreSQL/WASM against the shared platform contract.
// Install the isolated test runtime: npm install --prefix tmp/weather-credit-tools @electric-sql/pglite
const tenant = '3a4bcfeb-e8a7-417a-8b0c-90c37c3a6175';
const actor = '00000000-0000-4000-8000-000000000001';
const otherTenant = '00000000-0000-4000-8000-000000000002';
const host = 'pickpoint-pickleclub.christianjelarjoyhisola.workers.dev';
const token = 'a'.repeat(43);

async function baseFixture() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create schema extensions; create extension pgcrypto with schema extensions;
    create schema auth; create role anon; create role authenticated; create role service_role;
    create table auth.users(id uuid primary key);
    insert into auth.users values ('${actor}');
    create function auth.uid() returns uuid language sql as 'select nullif(current_setting(''test.actor'',true),'''')::uuid';
    create function auth.role() returns text language sql as 'select current_setting(''test.role'',true)';
    create table tenants(id uuid primary key, slug text, status text default 'active');
    insert into tenants(id,slug) values ('${tenant}','pickpoint-pickleclub'),('${otherTenant}','other');
    create table tenant_memberships(tenant_id uuid,user_id uuid,role text,status text);
    insert into tenant_memberships values ('${tenant}','${actor}','owner','active');
    create function public.is_platform_owner() returns boolean language sql as 'select false';
    create function public.resolve_tenant_id(text,text) returns uuid language sql as
      'select id from public.tenants where slug=$1 and $2=''${host}''';
    create function public.request_origin_matches_tenant(uuid) returns boolean language sql as
      'select coalesce(current_setting(''test.origin'',true),'''')=''${host}''';
    create table settings(tenant_id uuid,key text,value jsonb,is_public boolean);
    create function public.refund_reschedule_policy_sha256(jsonb) returns text language sql as 'select ''policy''';
    create table bookings(id uuid primary key default gen_random_uuid(),tenant_id uuid,reference text unique,
      subtotal_amount numeric(12,2), service_fee_amount numeric(12,2) default 0,total_amount numeric(12,2),
      status text default 'confirmed',payment_status text default 'paid',customer_email text default 'player@example.com',
      metadata jsonb default '{}',confirmed_at timestamptz,expires_at timestamptz,
      check (subtotal_amount>=0 and total_amount=subtotal_amount+service_fee_amount));
    create table booking_access_tokens(tenant_id uuid,booking_id uuid,expires_at timestamptz,token_hash text);
    create table booking_slots(booking_id uuid,status text,hold_expires_at timestamptz);
    create table payment_sessions(booking_id uuid);
    create table receipt_verifications(booking_id uuid);
    create table weather_refund_incidents(booking_id uuid,status text);
    select set_config('test.actor','${actor}',false),set_config('test.role','authenticated',false),set_config('test.origin','${host}',false);
  `);
  await db.exec(await readFile(new URL('../supabase/migrations/20260923010000_pickpoint_weather_credits.sql', import.meta.url), 'utf8'));
  const booking = async (reference, amount = 1000, pending = false, fee = 0, tenantId = tenant) => {
    const { rows: [row] } = await db.query(`insert into bookings(tenant_id,reference,subtotal_amount,total_amount,service_fee_amount,status,payment_status,expires_at)
      values ($1,$2,$3,$3::numeric+$4::numeric,$4,$5,$6,now()+interval '10 minutes') returning id`, [tenantId, reference, amount, fee, pending ? 'pending_payment' : 'confirmed', pending ? 'unpaid' : 'paid']);
    await db.query(`insert into booking_access_tokens values ($1,$2,now()+interval '1 day',encode(extensions.digest($3,'sha256'),'hex'))`, [tenantId, row.id, token]);
    await db.query(`insert into booking_slots values ($1,'held',now()+interval '10 minutes')`, [row.id]);
    return row.id;
  };
  const issue = async (id, amount = 1000) => (await db.query(`select manage_pickpoint_weather_credit($1,$2,$3,'rain') as result`, [host, id, amount])).rows[0].result;
  const apply = async (reference, code, email = 'player@example.com', suppliedToken = token) => (await db.query(`select apply_pickpoint_weather_credit($1,$2,$3,$4,$5) as result`, [host, reference, suppliedToken, code, email])).rows[0].result;
  return { db, booking, issue, apply };
}

async function slotFixture() {
 const f=await baseFixture(),db=f.db;
 await db.exec(`
 create table courts(id uuid primary key,tenant_id uuid,name text);
 insert into courts values ('00000000-0000-4000-8000-000000000003','${tenant}','Court 1');
 alter table bookings add column court_id uuid,add column customer_name text default 'Test Player',add column booking_type text default 'regular',add column archived_at timestamptz,add column updated_at timestamptz default now(),add column local_booking_date date default '2026-09-25';
 alter table booking_slots add column id uuid primary key default gen_random_uuid(),add column tenant_id uuid,add column court_id uuid,add column starts_at timestamptz,add column ends_at timestamptz,add column updated_at timestamptz default now(),add column balance_request_id uuid;
 create table booking_reschedule_events(booking_id uuid);
 create table audit_events(tenant_id uuid,actor_user_id uuid,actor_role text,action text,entity_table text,entity_id text,new_data jsonb);
 `);
 await db.exec(await readFile(new URL('../supabase/migrations/20260925010000_pickpoint_slot_weather_credits.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/migrations/20260925011000_hide_archived_weather_slots.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/migrations/20260925012000_pickpoint_power_outage_credits.sql',import.meta.url),'utf8'));
 const source=async(ref='SOURCE',email='player@example.com')=>{
 const {rows:[b]}=await db.query(`insert into bookings(tenant_id,reference,court_id,customer_email,subtotal_amount,service_fee_amount,total_amount,metadata) values($1,$2,'00000000-0000-4000-8000-000000000003',$3,450,30,480,'{"courtSubtotalAmount":450,"rateBreakdown":[{"startTime":"16:00","hourlyRate":200},{"startTime":"17:00","hourlyRate":250}]}') returning id`,[tenant,ref,email]);
 await db.query(`insert into booking_slots(booking_id,tenant_id,court_id,starts_at,ends_at,status) values($1,$2,'00000000-0000-4000-8000-000000000003','2026-09-25 08:00Z','2026-09-25 09:00Z','confirmed'),($1,$2,'00000000-0000-4000-8000-000000000003','2026-09-25 09:00Z','2026-09-25 10:00Z','confirmed')`,[b.id,tenant]);return b.id;
 };
 const list=async()=> (await db.query('select get_pickpoint_weather_slots($1,$2) result',[host,'2026-09-25'])).rows[0].result;
 const issueSlots=async(slots,id='00000000-0000-4000-8000-000000000010')=>(await db.query(`select issue_pickpoint_weather_slots($1,$2,$3::jsonb,$4,'rain') result`,[host,'2026-09-25',JSON.stringify(slots.map(s=>({slotId:s.slot_id,quoteToken:s.quote_token}))),id])).rows[0].result;
 return {...f,source,list,issueSlots};
}

test('credits the original 215/265 inclusive prices, atomically retries and allows distinct later slots',async()=>{
 const {db,source,list,issueSlots}=await slotFixture();try{
 const bid=await source();const before=(await db.query('select * from bookings where id=$1',[bid])).rows[0];
 const {slots}=await list();assert.deepEqual(slots.map(s=>s.amount),[215,265]);
 const first=await issueSlots([slots[0]]);assert.equal(first.credits[0].amount,215);
 assert.deepEqual(await issueSlots([slots[0]]),first,'same request does not issue twice');
 await assert.rejects(issueSlots([slots[0]],'00000000-0000-4000-8000-000000000011'),/Already credited/);
 const second=await issueSlots([slots[1]],'00000000-0000-4000-8000-000000000012');assert.equal(second.credits[0].amount,265);
 assert.equal((await list()).history.length,2);
 assert.deepEqual((await db.query('select * from bookings where id=$1',[bid])).rows[0],before,'source payment record preserved');
 assert.equal((await db.query('select count(*) n from audit_events')).rows[0].n,2);
 }finally{await db.close();}
});

test('non-owner, wrong origin, stale quote, duplicate selection and unpaid bookings fail closed',async()=>{
 const {db,source,list,issueSlots}=await slotFixture();try{
 const bid=await source();const {slots}=await list();
 await db.exec(`update tenant_memberships set role='admin'`);await assert.rejects(list(),/Owner access/);
 await db.exec(`update tenant_memberships set role='staff'`);await assert.rejects(issueSlots(slots),/Owner access/);
 await db.exec(`update tenant_memberships set role='owner'; select set_config('test.origin','evil',false)`);await assert.rejects(list(),/Owner access/);
 await db.query(`select set_config('test.origin',$1,false)`,[host]);
 await assert.rejects(issueSlots([slots[0],slots[0]]),/Duplicate/);
 await db.query(`update bookings set updated_at=now()+interval '1 minute' where id=$1`,[bid]);await assert.rejects(issueSlots(slots),/Booking changed/);
 await db.query(`update bookings set payment_status='unpaid' where id=$1`,[bid]);assert.ok((await list()).slots.every(s=>!s.eligible));
 await db.query(`update bookings set archived_at=now() where id=$1`,[bid]);assert.equal((await list()).slots.length,0);
 assert.equal((await db.query('select count(*) n from pickpoint_weather_credits')).rows[0].n,0);
 }finally{await db.close();}
});

test('full inclusive credit covers the next booking fee; expiry restores the voucher once',async()=>{
 const {db,source,list,issueSlots,booking,apply}=await slotFixture();try{
 await source();const {slots}=await list();const {credits}=await issueSlots([slots[1]]);const code=credits[0].code;
 await booking('FULL',250,true,15);const full=await apply('FULL',code);assert.equal(full.totalAmount,0);assert.equal(full.status,'confirmed');
 const {rows:[paid]}=await db.query(`select service_fee_amount,metadata from bookings where reference='FULL'`);
 assert.equal(Number(paid.service_fee_amount),0);assert.equal(paid.metadata.weatherCreditFeeAmount,15);
 assert.equal(paid.metadata.weatherCreditCourtAmount,250);assert.deepEqual(await apply('FULL',code),full);
 const {credits:other}=await issueSlots([slots[0]],'00000000-0000-4000-8000-000000000011');
 const pending=await booking('PART',500,true,30);const part=await apply('PART',other[0].code);assert.equal(part.totalAmount,315);
 await db.query(`update bookings set status='expired' where id=$1`,[pending]);await db.query(`update bookings set status='cancelled' where id=$1`,[pending]);
 assert.equal(Number((await db.query('select balance from pickpoint_weather_credits where id=$1',[other[0].id])).rows[0].balance),215);
 }finally{await db.close();}
});

test('batch failure issues nothing; legacy credits and weather refunds cannot double compensate',async()=>{
 const {db,source,list,issueSlots}=await slotFixture();try{
 const a=await source('A'),b=await source('B','missing');const all=await list();await assert.rejects(issueSlots(all.slots),/email required/);
 assert.equal((await db.query('select count(*) n from pickpoint_weather_credits')).rows[0].n,0);
 await db.query(`insert into pickpoint_weather_credits(tenant_id,booking_id,email,amount,balance,reason,issued_by) values($1,$2,'player@example.com',100,100,'rain',$3)`,[tenant,a,actor]);
 assert.ok((await list()).slots.filter(s=>s.booking_id===a).every(s=>s.unavailable_reason==='Legacy credit already issued'));
 await db.query(`insert into weather_refund_incidents values($1,'approved')`,[b]);assert.ok((await list()).slots.filter(s=>s.booking_id===b).every(s=>s.unavailable_reason==='Weather refund already recorded'));
 await assert.rejects(db.query(`select manage_pickpoint_weather_credit($1,$2,100,'rain')`,[host,a]),/select the affected/);
 }finally{await db.close();}
});

test('discounted slots use the price actually paid and exclude equipment rental',async()=>{
 const {db,source,list,issueSlots}=await slotFixture();try{
 const bid=await source();
 await db.query(`update bookings set subtotal_amount=425,total_amount=455,metadata=metadata||'{"equipmentRentalFeeAmount":25,"promotionApplications":[{"courtId":"00000000-0000-4000-8000-000000000003","startsAt":"2026-09-25T08:00:00Z","discountAmount":50}]}'::jsonb where id=$1`,[bid]);
 const {slots}=await list();assert.deepEqual(slots.map(s=>s.amount),[165,265]);
 const {credits}=await issueSlots(slots);assert.equal(credits[0].amount,430);
 }finally{await db.close();}
});

test('power outage credits retain fee coverage, redemption and slot duplicate protection',async()=>{
 const {db,source,list,booking,apply,issueSlots}=await slotFixture();try{
 await source();const {slots}=await list();
 const selection=JSON.stringify([{slotId:slots[1].slot_id,quoteToken:slots[1].quote_token}]);
 const {rows:[{result}]}=await db.query("select issue_pickpoint_weather_slots($1,$2,$3::jsonb,$4,'power_outage') result",[host,'2026-09-25',selection,'00000000-0000-4000-8000-000000000099']);
 const credit=result.credits[0];assert.equal(credit.reason,'power_outage');assert.equal(credit.amount,265);assert.equal(credit.coversBookingFee,true);
 await assert.rejects(issueSlots([slots[1]]),/Already credited/);
 await booking('OUTAGE',250,true,15);assert.equal((await apply('OUTAGE',credit.code)).totalAmount,0);
 await assert.rejects(db.query("select issue_pickpoint_weather_slots($1,$2,$3::jsonb,$4,'invalid')",[host,'2026-09-25',selection,'00000000-0000-4000-8000-000000000098']),/credit reason/);
 }finally{await db.close();}
});
