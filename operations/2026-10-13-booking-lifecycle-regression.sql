-- Run after the lifecycle migration; all fixtures are rolled back.
begin;
select set_config('request.headers','{"origin":"https://pickpoint-pickleclub.christianjelarjoyhisola.workers.dev"}',true);
do $test$
declare tid uuid := '3a4bcfeb-e8a7-417a-8b0c-90c37c3a6175'; bid uuid := gen_random_uuid(); ref text := 'TEST-'||upper(substr(replace(bid::text,'-',''),1,20)); tok text := repeat('x',43); result jsonb;
begin
 insert into public.bookings(id,tenant_id,court_id,reference,idempotency_key,booking_type,status,payment_status,customer_name,customer_email,customer_phone,guest_count,starts_at,ends_at,local_booking_date,subtotal_amount,service_fee_amount,total_amount,currency,expires_at,created_at)
 values(bid,tid,'a7da7042-1d33-4e6e-952b-c76da134410d',ref,bid::text,'regular','pending_payment','unpaid','Lifecycle regression','test@example.invalid','0000000000',1,now()+interval '50 days',now()+interval '50 days 1 hour',(now()+interval '50 days')::date,200,15,215,'PHP',now()+interval '15 minutes',now());
 update public.bookings set metadata=jsonb_build_object('policyAcceptance',(select metadata->'policyAcceptance' from public.bookings where tenant_id=tid and id<>bid and metadata ? 'policyAcceptance' order by created_at desc limit 1)) where id=bid;
 insert into public.booking_access_tokens(tenant_id,booking_id,token_hash,expires_at) values(tid,bid,encode(extensions.digest(tok,'sha256'),'hex'),now()+interval '1 day');
 begin perform public.expire_pickpoint_checkout_hold(ref,repeat('y',43));raise exception 'Invalid token accepted';exception when insufficient_privilege then null;end;
 begin perform public.expire_pickpoint_checkout_hold(ref,tok);raise exception 'Early expiry accepted';exception when invalid_parameter_value then null;end;
 update public.bookings set created_at=now()-interval '11 minutes',status='payment_review',payment_status='pending' where id=bid;
 result:=public.expire_pickpoint_checkout_hold(ref,tok);
 if result->>'status'<>'payment_review' then raise exception 'Payment review changed';end if;
 update public.bookings set status='pending_payment',payment_status='unpaid' where id=bid;
 insert into public.booking_slots(tenant_id,booking_id,court_id,starts_at,ends_at,status,hold_expires_at) values(tid,bid,'a7da7042-1d33-4e6e-952b-c76da134410d',date_trunc('day',now())+interval '50 days 21 hours',date_trunc('day',now())+interval '50 days 22 hours','held',now()+interval '15 minutes');
 result:=public.expire_pickpoint_checkout_hold(ref,tok);
 if exists(select 1 from public.booking_slots where booking_id=bid and status<>'expired') then raise exception 'Slot not released';end if;
 if result->>'status'<>'expired' or not exists(select 1 from public.bookings where id=bid and status='expired' and cancelled_at is null and metadata#>>'{expiration,reason}'='payment_window_timeout') then raise exception 'Expiry incorrect';end if;
 result:=public.expire_pickpoint_checkout_hold(ref,tok);
 if result->>'status'<>'expired' then raise exception 'Replay incorrect';end if;
 perform set_config('request.jwt.claims','{"sub":"06322743-1e4c-4e19-85d7-b6a1a6e15eb5","role":"authenticated"}',true);
 result:=public.get_pickpoint_booking_lifecycle(bid);
 if result->>'reason'<>'payment_window_timeout' then raise exception 'Reason missing';end if;
 update public.bookings set status='pending_payment',expires_at=now()+interval '10 minutes' where id=bid;
 begin perform public.cancel_tenant_booking(bid,' ');raise exception 'Blank reason accepted';exception when invalid_parameter_value then null;end;
 perform public.cancel_tenant_booking(bid,'Customer requested cancellation');
 result:=public.get_pickpoint_booking_lifecycle(bid);
 if result->>'reason'<>'Customer requested cancellation' or result->>'status'<>'cancelled' then raise exception 'Staff reason not preserved';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
 begin perform public.get_pickpoint_booking_lifecycle(bid);raise exception 'Nonmember accepted';exception when insufficient_privilege then null;end;
end $test$;
rollback;
select 'PASS: expiry timing, token protection, payment review protection, replay, required staff reason and authorized detail access; fixtures rolled back' result;
