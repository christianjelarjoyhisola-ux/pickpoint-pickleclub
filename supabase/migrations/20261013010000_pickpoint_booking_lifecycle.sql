begin;
create or replace function public.expire_pickpoint_checkout_hold(p_booking_reference text, p_booking_token text)
returns jsonb language plpgsql security definer set search_path='' set row_security=off as $$
declare b public.bookings%rowtype; tid constant uuid := '3a4bcfeb-e8a7-417a-8b0c-90c37c3a6175';
begin
 if not public.request_origin_matches_tenant(tid) or p_booking_token is null or p_booking_token !~ '^[A-Za-z0-9_-]{43}$' then raise exception 'Booking access denied.' using errcode='42501';end if;
 select booking.* into b from public.bookings booking join public.booking_access_tokens t on t.booking_id=booking.id and t.tenant_id=booking.tenant_id where booking.tenant_id=tid and booking.reference=upper(btrim(p_booking_reference)) and t.token_hash=encode(extensions.digest(p_booking_token,'sha256'),'hex') and t.expires_at>now() for update of booking;
 if not found then raise exception 'Booking access denied.' using errcode='42501';end if;
 if b.status<>'pending_payment' or b.payment_status<>'unpaid' then return jsonb_build_object('status',b.status);end if;
 if exists(select 1 from public.receipt_verifications where tenant_id=tid and booking_id=b.id) or exists(select 1 from public.payment_sessions where tenant_id=tid and booking_id=b.id and status in ('created','pending','paid')) then return jsonb_build_object('status',b.status,'paymentInProgress',true);end if;
 if now()<least(b.created_at+interval '10 minutes',coalesce(b.expires_at,b.created_at+interval '10 minutes')) then raise exception 'The booking window is still active.' using errcode='22023';end if;
 update public.bookings set status='expired',expires_at=least(coalesce(expires_at,now()),now()),metadata=metadata||jsonb_build_object('expiration',jsonb_build_object('reason','payment_window_timeout','expiredAt',now())) where id=b.id and tenant_id=tid;
 update public.booking_slots set status='expired',hold_expires_at=null where tenant_id=tid and booking_id=b.id and status='held';
 return jsonb_build_object('status','expired');
end $$;
revoke all on function public.expire_pickpoint_checkout_hold(text,text) from public;
grant execute on function public.expire_pickpoint_checkout_hold(text,text) to anon,authenticated;

create or replace function public.get_pickpoint_booking_lifecycle(p_booking_id uuid)
returns jsonb language plpgsql security definer set search_path='' set row_security=off as $$
declare b public.bookings%rowtype; tid constant uuid := '3a4bcfeb-e8a7-417a-8b0c-90c37c3a6175';
begin
 if auth.uid() is null or not public.request_origin_matches_tenant(tid) or not public.has_tenant_role(tid,array['owner','admin','staff']) then raise exception 'Booking access denied.' using errcode='42501';end if;
 select * into b from public.bookings where tenant_id=tid and id=p_booking_id and (archived_at is null or public.is_platform_owner());
 if not found then raise exception 'Booking not found.' using errcode='22023';end if;
 return jsonb_build_object('status',b.status,'reason',case when b.status='expired' then b.metadata#>>'{expiration,reason}' else b.metadata#>>'{cancellation,reason}' end,'at',case when b.status='expired' then b.metadata#>>'{expiration,expiredAt}' else b.cancelled_at::text end,'actor',case when b.metadata#>>'{cancellation,cancelledBy}'='customer_capability' then 'Customer checkout' when b.status='cancelled' then 'Staff account' else 'System' end);
end $$;
revoke all on function public.get_pickpoint_booking_lifecycle(uuid) from public;
grant execute on function public.get_pickpoint_booking_lifecycle(uuid) to authenticated;
commit;
