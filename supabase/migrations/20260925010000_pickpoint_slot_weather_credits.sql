begin;
alter table public.pickpoint_weather_credit_uses add column fee_amount numeric(12,2) not null default 0 check(fee_amount>=0 and fee_amount<=amount);
alter table public.pickpoint_weather_credits drop constraint pickpoint_weather_credits_booking_id_key;
alter table public.pickpoint_weather_credits add column covers_booking_fee boolean not null default false;
alter table public.pickpoint_weather_credits add column batch_id uuid;
create table public.pickpoint_weather_batches (
 id uuid primary key, tenant_id uuid not null references public.tenants(id),
 issued_by uuid not null references auth.users(id), reason text not null check(reason in ('rain','wet_court','unsafe_weather')),
 selection jsonb not null, created_at timestamptz not null default now()
);
alter table public.pickpoint_weather_credits add foreign key(batch_id) references public.pickpoint_weather_batches(id);
create unique index pickpoint_weather_batch_booking on public.pickpoint_weather_credits(batch_id,booking_id);
create table public.pickpoint_weather_slot_credits (
 slot_id uuid primary key references public.booking_slots(id),
 credit_id uuid not null references public.pickpoint_weather_credits(id),
 tenant_id uuid not null references public.tenants(id), booking_id uuid not null references public.bookings(id),
 court_id uuid not null references public.courts(id), court_name text not null,
 starts_at timestamptz not null, ends_at timestamptz not null,
 court_amount numeric(12,2) not null check(court_amount>=0), fee_amount numeric(12,2) not null check(fee_amount>=0),
 amount numeric(12,2) not null check(amount=court_amount+fee_amount and amount>0),
 created_at timestamptz not null default now()
);
alter table public.pickpoint_weather_batches enable row level security;
alter table public.pickpoint_weather_slot_credits enable row level security;
revoke all on public.pickpoint_weather_batches,public.pickpoint_weather_slot_credits from public,anon,authenticated;
grant select,insert on public.pickpoint_weather_batches,public.pickpoint_weather_slot_credits to service_role;

create function public.pickpoint_weather_owner(p_hostname text) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare t uuid:=public.resolve_tenant_id('pickpoint-pickleclub',p_hostname);
begin
 if t is null or not public.request_origin_matches_tenant(t) or auth.uid() is null or auth.role() is distinct from 'authenticated'
 or not(public.is_platform_owner() or exists(select 1 from public.tenant_memberships where tenant_id=t and user_id=auth.uid() and role='owner' and status='active'))
 then raise exception 'Weather credits require System Owner or Court Owner access.' using errcode='42501'; end if;
 return t;
end $$;
revoke all on function public.pickpoint_weather_owner(text) from public,anon,authenticated;

-- Only saved booking prices are used. Unverifiable legacy/rescheduled prices fail closed.
create function public.pickpoint_weather_slot_quotes(p_tenant uuid,p_date date)
returns table(slot_id uuid,booking_id uuid,reference text,customer text,email text,court_id uuid,court_name text,starts_at timestamptz,ends_at timestamptz,court_amount numeric,fee_amount numeric,amount numeric,quote_token text,eligible boolean,unavailable_reason text)
language sql stable security definer set search_path='' as $$
 with raw as (
 select s.*,b.reference,b.customer_name,b.customer_email,b.payment_status,b.status booking_status,b.archived_at,b.updated_at booking_updated,
 c.name court_name,b.metadata,
 least(coalesce((b.metadata->>'courtSubtotalAmount')::numeric,b.subtotal_amount+coalesce(u.amount-u.fee_amount,0)),
 b.subtotal_amount+coalesce(u.amount-u.fee_amount,0)-coalesce((b.metadata->>'equipmentRentalFeeAmount')::numeric,0)) original_court,
 b.service_fee_amount+coalesce(u.fee_amount,0) original_fee,
 extract(epoch from(s.ends_at-s.starts_at))/3600 hours,
 coalesce(
 (select (j->>'subtotalAmount')::numeric from jsonb_array_elements(coalesce(b.metadata->'sessions','[]')) j
 where (j->>'courtId')::uuid=s.court_id and (j->>'startsAt')::timestamptz=s.starts_at and (j->>'endsAt')::timestamptz=s.ends_at limit 1),
 (select (j->>'hourlyRate')::numeric from jsonb_array_elements(coalesce(b.metadata->'rateBreakdown','[]')) j
 where j->>'startTime'=to_char(s.starts_at at time zone 'Asia/Manila','HH24:MI')
 and (j->>'courtId' is null or (j->>'courtId')::uuid=s.court_id)
 and (j->>'bookingDate' is null or (j->>'bookingDate')::date=(s.starts_at at time zone 'Asia/Manila')::date)
 and s.ends_at-s.starts_at=interval '1 hour' limit 1))
 -coalesce((select sum((j->>'discountAmount')::numeric) from jsonb_array_elements(coalesce(b.metadata->'promotionApplications','[]')) j where (j->>'courtId')::uuid=s.court_id and (j->>'startsAt')::timestamptz=s.starts_at),0) raw_price
 from public.booking_slots s join public.bookings b on b.id=s.booking_id and b.tenant_id=s.tenant_id
 left join public.pickpoint_weather_credit_uses u on u.booking_id=b.id and u.released_at is null
 join public.courts c on c.id=s.court_id and c.tenant_id=s.tenant_id
 where s.tenant_id=p_tenant and b.booking_type='regular' and s.balance_request_id is null
 and exists(select 1 from public.booking_slots d where d.booking_id=b.id and (d.starts_at at time zone 'Asia/Manila')::date=p_date)
 ), totals as (
 select *,count(*) over(partition by booking_id) n,count(raw_price) over(partition by booking_id) priced,
 sum(raw_price) over(partition by booking_id) raw_total,sum(hours) over(partition by booking_id) hours_total,
 row_number() over(partition by booking_id order by starts_at,id) rn from raw
 ), allocated as (
 select *,case when n=1 then original_court when priced=n and raw_total>0 then round(original_court*raw_price/raw_total,2) end ca,
 round(original_fee*hours/hours_total,2) fa from totals
 ), amounts as (
 select *,case when rn=n then original_court-coalesce(sum(ca) over(partition by booking_id order by rn rows between unbounded preceding and 1 preceding),0) else ca end court_credit,
 case when rn=n then original_fee-coalesce(sum(fa) over(partition by booking_id order by rn rows between unbounded preceding and 1 preceding),0) else fa end fee_credit from allocated
 ), result as (
 select a.*,case
 when exists(select 1 from public.pickpoint_weather_slot_credits x where x.slot_id=a.id) then 'Already credited'
 when exists(select 1 from public.pickpoint_weather_credits x where x.booking_id=a.booking_id and x.batch_id is null) then 'Legacy credit already issued'
 when exists(select 1 from public.weather_refund_incidents x where x.booking_id=a.booking_id and x.status<>'rejected') then 'Weather refund already recorded'
 when archived_at is not null then 'Booking is in Trash'
 when payment_status<>'paid' or booking_status not in ('confirmed','completed','cancelled') then 'Paid booking required'
 when coalesce(customer_email,'') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then 'Customer email required'
 when (n>1 and priced<>n) or court_credit is null or court_credit<0 or fee_credit<0 or court_credit+fee_credit<=0 then 'Saved slot pricing needs review'
 when exists(select 1 from public.booking_reschedule_events e where e.booking_id=a.booking_id) then 'Rescheduled booking needs price review'
 else null end blocked from amounts a
 )
 select id,booking_id,reference,customer_name,lower(btrim(customer_email)),court_id,court_name,starts_at,ends_at,
 court_credit,fee_credit,court_credit+fee_credit,
 md5(concat_ws('|',id,booking_updated,updated_at,starts_at,ends_at,court_credit,fee_credit)),blocked is null,blocked
 from result where (starts_at at time zone 'Asia/Manila')::date=p_date;
$$;
revoke all on function public.pickpoint_weather_slot_quotes(uuid,date) from public,anon,authenticated;

create function public.pickpoint_weather_credit_json(p_credit uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',c.id,'bookingId',c.booking_id,'reference',b.reference,'customer',b.customer_name,'email',c.email,
 'code',c.code,'amount',c.amount,'balance',c.balance,'reason',c.reason,'issuedAt',c.created_at,'issuedBy',c.issued_by,
 'emailSent',c.email_sent_at is not null,'coversBookingFee',c.covers_booking_fee,
 'slots',coalesce((select jsonb_agg(jsonb_build_object('slotId',s.slot_id,'court',s.court_name,'startsAt',s.starts_at,'endsAt',s.ends_at,'amount',s.amount,'feeAmount',s.fee_amount) order by s.starts_at,s.court_name) from public.pickpoint_weather_slot_credits s where s.credit_id=c.id),'[]'::jsonb))
 from public.pickpoint_weather_credits c join public.bookings b on b.id=c.booking_id where c.id=p_credit;
$$;
revoke all on function public.pickpoint_weather_credit_json(uuid) from public,anon,authenticated;

create function public.get_pickpoint_weather_slots(p_hostname text,p_date date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t uuid:=public.pickpoint_weather_owner(p_hostname);
begin
 if p_date is null then raise exception 'Choose a date.'; end if;
 return jsonb_build_object('slots',coalesce((select jsonb_agg(to_jsonb(q) order by q.starts_at,q.court_name) from public.pickpoint_weather_slot_quotes(t,p_date) q),'[]'::jsonb),
 'history',coalesce((select jsonb_agg(public.pickpoint_weather_credit_json(c.id) order by c.created_at desc) from public.pickpoint_weather_credits c join public.bookings b on b.id=c.booking_id
 where c.tenant_id=t and (b.local_booking_date=p_date or exists(select 1 from public.pickpoint_weather_slot_credits s where s.credit_id=c.id and (s.starts_at at time zone 'Asia/Manila')::date=p_date))),'[]'::jsonb));
end $$;
revoke all on function public.get_pickpoint_weather_slots(text,date) from public,anon;
grant execute on function public.get_pickpoint_weather_slots(text,date) to authenticated;

create function public.issue_pickpoint_weather_slots(p_hostname text,p_date date,p_selection jsonb,p_request_id uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t uuid:=public.pickpoint_weather_owner(p_hostname); prior public.pickpoint_weather_batches%rowtype;
 bid uuid; cid uuid; q record; selected_ids uuid[]; total numeric; canonical jsonb;
begin
 if p_request_id is null or p_reason is null or p_reason not in ('rain','wet_court','unsafe_weather') or jsonb_typeof(p_selection) is distinct from 'array' or jsonb_array_length(p_selection) not between 1 and 100 then raise exception 'Select 1 to 100 affected slots and a weather reason.'; end if;
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
revoke all on function public.issue_pickpoint_weather_slots(text,date,jsonb,uuid,text) from public,anon;
grant execute on function public.issue_pickpoint_weather_slots(text,date,jsonb,uuid,text) to authenticated;

create function public.get_pickpoint_weather_credit_email(p_hostname text,p_credit_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t uuid:=public.pickpoint_weather_owner(p_hostname);
begin
 if not exists(select 1 from public.pickpoint_weather_credits where id=p_credit_id and tenant_id=t) then raise exception 'Credit not found.'; end if;
 return public.pickpoint_weather_credit_json(p_credit_id);
end $$;
revoke all on function public.get_pickpoint_weather_credit_email(text,uuid) from public,anon;
grant execute on function public.get_pickpoint_weather_credit_email(text,uuid) to authenticated;

-- Retire manual amount issuance so slot duplicate protections cannot be bypassed.
create or replace function public.manage_pickpoint_weather_credit(p_hostname text,p_booking_id uuid,p_amount numeric default null,p_reason text default 'rain') returns jsonb
language plpgsql security definer set search_path='' as $$
declare t uuid:=public.pickpoint_weather_owner(p_hostname); b public.bookings%rowtype; cid uuid;
begin
 if p_amount is not null then raise exception 'Use Weather credits to select the affected time slots.';end if;
 select * into b from public.bookings where id=p_booking_id and tenant_id=t;
 if not found then raise exception 'Booking not found.';end if;
 select id into cid from public.pickpoint_weather_credits where booking_id=b.id order by created_at desc limit 1;
 return jsonb_build_object('eligible',false,'maximumAmount',0,'email',b.customer_email,'credit',public.pickpoint_weather_credit_json(cid));
end $$;

-- Freeze the compensated slot identity; cancelling is still permitted.
create function public.guard_pickpoint_credited_slot() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (new.booking_id,new.court_id,new.starts_at,new.ends_at) is distinct from (old.booking_id,old.court_id,old.starts_at,old.ends_at)
 and exists(select 1 from public.pickpoint_weather_slot_credits where slot_id=old.id) then raise exception 'A weather-credited slot cannot be moved. Create a new booking with the voucher.';end if;
 return new;
end $$;
revoke all on function public.guard_pickpoint_credited_slot() from public,anon,authenticated;
create trigger guard_pickpoint_credited_slot before update on public.booking_slots for each row execute function public.guard_pickpoint_credited_slot();
create or replace function public.apply_pickpoint_weather_credit(
  p_hostname text, p_reference text, p_token text, p_code text, p_email text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t uuid := public.resolve_tenant_id('pickpoint-pickleclub', p_hostname);
  b public.bookings%rowtype;
  c public.pickpoint_weather_credits%rowtype;
  u public.pickpoint_weather_credit_uses%rowtype;
  applied numeric;
  fee_credit numeric;
begin
  if t is null or not public.request_origin_matches_tenant(t) then
    raise exception 'Booking access denied.' using errcode = '42501'; end if;
  select * into b from public.bookings where tenant_id = t and reference = p_reference for update;
  if not found or not exists (select 1 from public.booking_access_tokens a where a.booking_id = b.id
    and a.tenant_id = t and a.expires_at > now()
    and a.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')) then
    raise exception 'Booking access denied.' using errcode = '42501'; end if;
  select * into c from public.pickpoint_weather_credits where tenant_id = t
    and code = upper(btrim(p_code)) and email = lower(btrim(p_email))
    and email = lower(btrim(b.customer_email)) for update;
  if not found then raise exception 'Check your voucher code and use the email that received it.'; end if;
  select * into u from public.pickpoint_weather_credit_uses where booking_id = b.id;
  if u.booking_id is not null then
    if u.credit_id <> c.id or u.released_at is not null then raise exception 'This booking cannot use another voucher.'; end if;
    applied := u.amount;
  else
    if b.status <> 'pending_payment' or b.payment_status <> 'unpaid' or b.expires_at is null or b.expires_at <= now()
      or exists (select 1 from public.payment_sessions p where p.booking_id = b.id)
      or exists (select 1 from public.receipt_verifications r where r.booking_id = b.id)
    then raise exception 'Apply your credit before submitting payment, while your booking is active.'; end if;
    applied := least(c.balance, case when c.covers_booking_fee then b.total_amount else b.subtotal_amount end);
    fee_credit := case when c.covers_booking_fee then least(b.service_fee_amount,round(applied*b.service_fee_amount/nullif(b.total_amount,0),2)) else 0 end;
    if applied <= 0 then raise exception 'This voucher has no available credit for this booking.'; end if;
    insert into public.pickpoint_weather_credit_uses(booking_id, credit_id, amount, fee_amount) values (b.id, c.id, applied, fee_credit);
    update public.pickpoint_weather_credits set balance = balance - applied where id = c.id returning * into c;
    update public.bookings set subtotal_amount = subtotal_amount - (applied-fee_credit), service_fee_amount=service_fee_amount-fee_credit, total_amount = total_amount - applied,
      metadata = metadata || jsonb_build_object('weatherCreditAmount', applied, 'weatherCreditOriginalTotal', b.total_amount, 'weatherCreditCourtAmount', applied-fee_credit, 'weatherCreditFeeAmount', fee_credit, 'weatherCreditOriginalServiceFee', b.service_fee_amount),
      status = case when total_amount = applied then 'confirmed' else status end,
      payment_status = case when total_amount = applied then 'paid' else payment_status end,
      confirmed_at = case when total_amount = applied then now() else confirmed_at end,
      expires_at = case when total_amount = applied then null else expires_at end
      where id = b.id returning * into b;
    if b.status = 'confirmed' then
      update public.booking_slots set status = 'confirmed', hold_expires_at = null where booking_id = b.id and status = 'held';
    end if;
  end if;
  return jsonb_build_object('appliedAmount', applied, 'remainingBalance', c.balance,
    'totalAmount', b.total_amount, 'subtotalAmount', b.subtotal_amount, 'status', b.status);
end;
$$;
revoke all on function public.apply_pickpoint_weather_credit(text,text,text,text,text) from public;
grant execute on function public.apply_pickpoint_weather_credit(text,text,text,text,text) to anon, authenticated;


commit;
