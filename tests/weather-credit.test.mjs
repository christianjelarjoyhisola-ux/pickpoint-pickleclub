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

async function fixture() {
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

test('issue once, spend partially, confirm fully covered bookings, and reject exhausted vouchers', async () => {
  const { db, booking, issue, apply } = await fixture();
  try {
    const source = await booking('SOURCE');
    const issued = await issue(source);
    assert.match(issued.credit.code, /^RAIN-[A-F0-9]{24}$/);
    assert.equal((await issue(source, 500)).credit.id, issued.credit.id);
    assert.equal((await issue(source, 500)).credit.amount, 1000);
    const next = await booking('NEXT', 700, true);
    const paid = await apply('NEXT', issued.credit.code);
    assert.deepEqual(paid, { appliedAmount: 700, remainingBalance: 300, totalAmount: 0, subtotalAmount: 0, status: 'confirmed' });
    assert.deepEqual(await apply('NEXT', issued.credit.code), paid, 'network retries do not spend twice');
    assert.equal((await db.query('select status from booking_slots where booking_id=$1', [next])).rows[0].status, 'confirmed');
    await booking('TOPUP', 500, true, 20);
    assert.deepEqual(await apply('TOPUP', issued.credit.code), { appliedAmount: 300, remainingBalance: 0, totalAmount: 220, subtotalAmount: 200, status: 'pending_payment' });
    await booking('EMPTY', 100, true);
    await assert.rejects(apply('EMPTY', issued.credit.code), /no available credit/);
  } finally { await db.close(); }
});

test('abandoned unpaid holds return credit once and cannot later be reinstated', async () => {
  const { db, booking, issue, apply } = await fixture();
  try {
    const issued = await issue(await booking('SOURCE', 500), 500);
    const held = await booking('HELD', 900, true);
    await apply('HELD', issued.credit.code);
    await db.query(`update bookings set status='expired' where id=$1`, [held]);
    await db.query(`update bookings set status='cancelled' where id=$1`, [held]);
    assert.equal(Number((await db.query('select balance from pickpoint_weather_credits')).rows[0].balance), 500);
    await assert.rejects(db.query(`update bookings set status='confirmed',payment_status='paid' where id=$1`, [held]), /returned/);
    await assert.rejects(apply('HELD', issued.credit.code), /another voucher/);
  } finally { await db.close(); }
});

test('email, token, tenant, origin, and owner authorization are enforced', async () => {
  const { db, booking, issue, apply } = await fixture();
  try {
    const source = await booking('SOURCE');
    const issued = await issue(source);
    const target = await booking('NEXT', 1500, true);
    await assert.rejects(apply('NEXT', issued.credit.code, 'wrong@example.com'), /Check your voucher/);
    await assert.rejects(apply('NEXT', issued.credit.code, 'player@example.com', 'bad'), /access denied/);
    await assert.rejects(issue(await booking('OTHER', 1000, false, 0, otherTenant)), /not found/);
    await db.exec(`update tenant_memberships set role='staff'`);
    await assert.rejects(issue(source), /owner access/);
    await db.exec(`update tenant_memberships set role='owner'; select set_config('test.origin','evil.example',false)`);
    await assert.rejects(apply('NEXT', issued.credit.code), /access denied/);
    await db.exec(`select set_config('test.origin','${host}',false)`);
    await apply('NEXT', issued.credit.code, ' PLAYER@EXAMPLE.COM ');
    await assert.rejects(db.query(`update bookings set customer_email='changed@example.com' where id=$1`, [target]), /original email/);
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from pickpoint_weather_credits'), /permission denied/);
  } finally { await db.close(); }
});

test('reject excess, invalid amounts, unpaid sources, payment activity and duplicate refunds', async () => {
  const { db, booking, issue, apply } = await fixture();
  try {
    const source = await booking('SOURCE', 500);
    for (const amount of [0, -1, 501, 0.001, 'NaN', 'Infinity']) await assert.rejects(issue(source, amount), /amount/);
    await assert.rejects(issue(await booking('UNPAID', 1000, true)), /paid booking/);
    const refund = await booking('REFUND');
    await db.query(`insert into weather_refund_incidents values ($1,'approved')`, [refund]);
    await assert.rejects(issue(refund), /already has a weather refund/);
    const issued = await issue(source, 500);
    await assert.rejects(db.query(`insert into weather_refund_incidents values ($1,'reported')`, [source]), /already been issued/);
    await assert.rejects(db.query(`update bookings set payment_status='refunded' where id=$1`, [source]), /already been issued/);
    const held = await booking('RECEIPT', 1000, true);
    await db.query('insert into payment_sessions values ($1)', [held]);
    await assert.rejects(apply('RECEIPT', issued.credit.code), /before submitting payment/);
  } finally { await db.close(); }
});
