begin;
-- Keep existing voucher codes and RPC names compatible while broadening credit reasons.
alter table public.pickpoint_weather_credits drop constraint pickpoint_weather_credits_reason_check;
alter table public.pickpoint_weather_credits add constraint pickpoint_weather_credits_reason_check check(reason in ('rain','wet_court','unsafe_weather','power_outage'));
alter table public.pickpoint_weather_batches drop constraint pickpoint_weather_batches_reason_check;
alter table public.pickpoint_weather_batches add constraint pickpoint_weather_batches_reason_check check(reason in ('rain','wet_court','unsafe_weather','power_outage'));
create or replace function public.issue_pickpoint_weather_slots(p_hostname text,p_date date,p_selection jsonb,p_request_id uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t uuid:=public.pickpoint_weather_owner(p_hostname); prior public.pickpoint_weather_batches%rowtype;
 bid uuid; cid uuid; q record; selected_ids uuid[]; total numeric; canonical jsonb;
begin
 if p_request_id is null or p_reason is null or p_reason not in ('rain','wet_court','unsafe_weather','power_outage') or jsonb_typeof(p_selection) is distinct from 'array' or jsonb_array_length(p_selection) not between 1 and 100 then raise exception 'Select 1 to 100 affected slots and a credit reason.'; end if;
 select array_agg((j->>'slotId')::uuid order by j->>'slotId'),jsonb_agg(j order by j->>'slotId') into selected_ids,canonical from jsonb_array_elements(p_selection) j;
 if cardinality(selected_ids)<>(select count(distinct x) from unnest(selected_ids)x) or array_position(selected_ids,null) is not null then raise exception 'Duplicate or missing slot selection.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into prior from public.pickpoint_weather_batches where id=p_request_id;
 if found then
 if prior.tenant_id<>t or prior.selection<>canonical or prior.reason<>p_reason then raise exception 'Request was already used for a different selection.';end if;
 else
 -- Booking-first lock order agrees with redemption and refund guards.
 perform b.id from public.bookings b where b.tenant_id=t and b.id in(select booking_id from public.booking_slots where id=any(selected_ids)) order by b.id for update;
 perform s.id from public.booking_slots s where s.tenant_id=t and s.id=any(selected_ids) order by s.id for update;
 if (select count(*) from public.pickpoint_weather_slot_quotes(t,p_date) where slot_id=any(selected_ids))<>cardinality(selected_ids) then raise exception 'Some selected slots are outside this venue or date. Refresh and select again.';end if;
 for q in select * from public.pickpoint_weather_slot_quotes(t,p_date) where slot_id=any(selected_ids) loop
 if not q.eligible then raise exception 'Cannot credit %: %',q.reference,q.unavailable_reason;end if;
 if not exists(select 1 from jsonb_array_elements(canonical) j where j->>'slotId'=q.slot_id::text and j->>'quoteToken'=q.quote_token) then raise exception 'Booking changed. Refresh and review the credit amounts again.';end if;
 end loop;
 insert into public.pickpoint_weather_batches(id,tenant_id,issued_by,reason,selection) values(p_request_id,t,auth.uid(),p_reason,canonical);
 for bid in select distinct booking_id from public.booking_slots where id=any(selected_ids) order by booking_id loop
 select sum(amount) into total from public.pickpoint_weather_slot_quotes(t,p_date) where booking_id=bid and slot_id=any(selected_ids);
 insert into public.pickpoint_weather_credits(tenant_id,booking_id,email,amount,balance,reason,issued_by,batch_id,covers_booking_fee)
 select t,bid,lower(btrim(customer_email)),total,total,p_reason,auth.uid(),p_request_id,true from public.bookings where id=bid returning id into cid;
 insert into public.pickpoint_weather_slot_credits(slot_id,credit_id,tenant_id,booking_id,court_id,court_name,starts_at,ends_at,court_amount,fee_amount,amount)
 select slot_id,cid,t,booking_id,court_id,court_name,starts_at,ends_at,court_amount,fee_amount,amount from public.pickpoint_weather_slot_quotes(t,p_date) where booking_id=bid and slot_id=any(selected_ids);
 insert into public.audit_events(tenant_id,actor_user_id,actor_role,action,entity_table,entity_id,new_data)
 values(t,auth.uid(),case when public.is_platform_owner() then 'system_owner' else 'court_owner' end,'weather.slots_credited','pickpoint_weather_credits',cid::text,public.pickpoint_weather_credit_json(cid));
 end loop;
 end if;
 return jsonb_build_object('credits',(select jsonb_agg(public.pickpoint_weather_credit_json(id) order by id) from public.pickpoint_weather_credits where batch_id=p_request_id and tenant_id=t));
end $$;

notify pgrst, 'reload schema';
commit;
