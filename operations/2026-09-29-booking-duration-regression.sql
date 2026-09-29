begin;
select set_config('request.headers','{"origin":"https://pickpoint-pickleclub.christianjelarjoyhisola.workers.dev"}',true);
do $test$
declare start_at timestamptz:=(((now() at time zone 'Asia/Manila')::date+12)::text||' 05:00:00+08')::timestamptz; slots jsonb; sessions jsonb; result jsonb; bid uuid; meta jsonb;
begin
select jsonb_agg(jsonb_build_object('startsAt',start_at+n*interval '1 hour','endsAt',start_at+(n+1)*interval '1 hour')) into slots from generate_series(0,18)n;
meta:=jsonb_build_object('policyAcceptance',jsonb_build_object('accepted',true,'version',(select value->>'version' from public.settings where tenant_id='3a4bcfeb-e8a7-417a-8b0c-90c37c3a6175' and key='refund_reschedule_policy'),'sha256',(select public.refund_reschedule_policy_sha256(value) from public.settings where tenant_id='3a4bcfeb-e8a7-417a-8b0c-90c37c3a6175' and key='refund_reschedule_policy')));
select jsonb_agg(jsonb_build_object('courtId',id,'startsAt',start_at,'endsAt',start_at+interval '19 hours','slots',slots,'subtotalAmount',4150,'serviceFeeAmount',285,'totalAmount',4435,'currency','PHP','metadata',meta)) into sessions from public.courts where tenant_id='3a4bcfeb-e8a7-417a-8b0c-90c37c3a6175' and status='active';
result:=public.create_public_booking_group_with_access('pickpoint-pickleclub','pickpoint-pickleclub.christianjelarjoyhisola.workers.dev','regular','Duration regression','duration-test@example.invalid','0000000000',1,sessions,meta||jsonb_build_object('groupFingerprint',repeat('d',64)),gen_random_uuid()::text,encode(extensions.digest(gen_random_uuid()::text,'sha256'),'hex'));
bid:=(result->>'bookingId')::uuid;
if (select count(*) from public.booking_slots where booking_id=bid)<>38 then raise exception 'Full-day multi-court booking failed: %',result;end if;
if (select total_amount from public.bookings where id=bid)<>8870 then raise exception 'Full-day pricing incorrect';end if;
end $test$;
rollback;
select 'PASS: 19 hours per court / 38 court-hours; correct inclusive price; rolled back without retaining bookings or sending emails' result;
