begin;

-- One voucher per affected reservation. Amounts are in PHP, not centavos.
create table public.pickpoint_weather_credits (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  booking_id uuid not null unique references public.bookings(id),
  code text not null unique default ('RAIN-' || upper(encode(extensions.gen_random_bytes(12), 'hex'))),
  email text not null,
  amount numeric(12,2) not null check (amount > 0),
  balance numeric(12,2) not null check (balance >= 0 and balance <= amount),
  reason text not null check (reason in ('rain', 'wet_court', 'unsafe_weather')),
  issued_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  email_sent_at timestamptz,
  email_attempt_at timestamptz
);
create table public.pickpoint_weather_credit_uses (
  booking_id uuid primary key references public.bookings(id),
  credit_id uuid not null references public.pickpoint_weather_credits(id),
  amount numeric(12,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  released_at timestamptz
);
alter table public.pickpoint_weather_credits enable row level security;
alter table public.pickpoint_weather_credit_uses enable row level security;
revoke all on public.pickpoint_weather_credits, public.pickpoint_weather_credit_uses from public, anon, authenticated;
grant all on public.pickpoint_weather_credits, public.pickpoint_weather_credit_uses to service_role;

-- Passing no amount reads the existing voucher and eligibility for the owner UI.
create function public.manage_pickpoint_weather_credit(
  p_hostname text, p_booking_id uuid, p_amount numeric default null, p_reason text default 'rain'
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t uuid := public.resolve_tenant_id('pickpoint-pickleclub', p_hostname);
  b public.bookings%rowtype;
  c public.pickpoint_weather_credits%rowtype;
  maximum numeric;
begin
  if t is null or not public.request_origin_matches_tenant(t)
    or auth.uid() is null or auth.role() <> 'authenticated'
    or not (public.is_platform_owner() or exists (
      select 1 from public.tenant_memberships m where m.tenant_id = t
      and m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner', 'admin')
    )) then raise exception 'Weather credits require owner access.' using errcode = '42501'; end if;
  select * into b from public.bookings where id = p_booking_id and tenant_id = t for update;
  if not found then raise exception 'Booking not found.'; end if;
  select * into c from public.pickpoint_weather_credits where booking_id = b.id;
  maximum := b.subtotal_amount + coalesce((b.metadata->>'weatherCreditAmount')::numeric, 0);
  if p_amount is not null and c.id is null then
    if exists (select 1 from public.weather_refund_incidents r where r.booking_id = b.id and r.status <> 'rejected') then
      raise exception 'This booking already has a weather refund. Resolve it before issuing credit.';
    end if;
    if b.payment_status <> 'paid' or b.status not in ('confirmed', 'completed', 'cancelled')
      or coalesce(b.customer_email, '') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    then raise exception 'A paid booking with a guest email is required.'; end if;
    if p_amount::text in ('NaN', 'Infinity', '-Infinity') or p_amount <= 0
      or p_amount <> round(p_amount, 2) or p_amount > maximum then
      raise exception 'Enter an amount within the paid court charges (maximum %).', maximum;
    end if;
    insert into public.pickpoint_weather_credits(tenant_id, booking_id, email, amount, balance, reason, issued_by)
      values (t, b.id, lower(btrim(b.customer_email)), p_amount, p_amount, p_reason, auth.uid()) returning * into c;
  end if;
  return jsonb_build_object('eligible', b.payment_status = 'paid' and b.status in ('confirmed', 'completed', 'cancelled') and coalesce(b.customer_email, '') <> '',
    'maximumAmount', maximum, 'email', b.customer_email, 'credit', case when c.id is null then null else
    jsonb_build_object('id', c.id, 'code', c.code, 'amount', c.amount, 'balance', c.balance, 'reason', c.reason,
      'emailSent', c.email_sent_at is not null) end);
end;
$$;
revoke all on function public.manage_pickpoint_weather_credit(text,uuid,numeric,text) from public, anon;
grant execute on function public.manage_pickpoint_weather_credit(text,uuid,numeric,text) to authenticated;

-- Keep the existing receipt service authoritative for the remaining payment.
-- Gross court charges remain in sessions; credit tender is recorded separately.
create function public.apply_pickpoint_weather_credit(
  p_hostname text, p_reference text, p_token text, p_code text, p_email text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t uuid := public.resolve_tenant_id('pickpoint-pickleclub', p_hostname);
  b public.bookings%rowtype;
  c public.pickpoint_weather_credits%rowtype;
  u public.pickpoint_weather_credit_uses%rowtype;
  applied numeric;
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
    applied := least(c.balance, b.subtotal_amount);
    if applied <= 0 then raise exception 'This voucher has no available credit for this booking.'; end if;
    insert into public.pickpoint_weather_credit_uses(booking_id, credit_id, amount) values (b.id, c.id, applied);
    update public.pickpoint_weather_credits set balance = balance - applied where id = c.id returning * into c;
    update public.bookings set subtotal_amount = subtotal_amount - applied, total_amount = total_amount - applied,
      metadata = metadata || jsonb_build_object('weatherCreditAmount', applied, 'weatherCreditOriginalTotal', b.total_amount),
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

-- Unpaid cancelled/expired holds return their reserved credit exactly once.
create function public.release_pickpoint_weather_credit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare u public.pickpoint_weather_credit_uses%rowtype;
begin
  if new.status in ('cancelled', 'expired') and new.payment_status <> 'paid' then
    update public.pickpoint_weather_credit_uses set released_at = now()
      where booking_id = new.id and released_at is null returning * into u;
    if found then
      update public.pickpoint_weather_credits set balance = balance + u.amount where id = u.credit_id;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.release_pickpoint_weather_credit() from public, anon, authenticated;
create trigger bookings_release_weather_credit after update of status on public.bookings
  for each row execute function public.release_pickpoint_weather_credit();

create function public.protect_pickpoint_weather_credit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.customer_email is distinct from old.customer_email and exists (
    select 1 from public.pickpoint_weather_credit_uses where booking_id = new.id and released_at is null
  ) then raise exception 'Keep the original email on a booking paid with weather credit.'; end if;
  if new.status not in ('cancelled', 'expired') and exists (
    select 1 from public.pickpoint_weather_credit_uses where booking_id = new.id and released_at is not null
  ) then raise exception 'This credit was returned. Create a new booking instead.'; end if;
  if new.payment_status = 'refunded' and exists (
    select 1 from public.pickpoint_weather_credits where booking_id = new.id
  ) then raise exception 'Weather credit has already been issued for this booking.'; end if;
  return new;
end;
$$;
revoke all on function public.protect_pickpoint_weather_credit() from public, anon, authenticated;
create trigger bookings_protect_weather_credit before update on public.bookings
  for each row execute function public.protect_pickpoint_weather_credit();

create function public.prevent_pickpoint_duplicate_weather_refund() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Use the same booking lock as issuance to serialize competing compensation.
  perform 1 from public.bookings where id = new.booking_id for update;
  if new.status <> 'rejected' and exists (
    select 1 from public.pickpoint_weather_credits where booking_id = new.booking_id
  ) then raise exception 'Weather credit has already been issued for this booking.'; end if;
  return new;
end;
$$;
revoke all on function public.prevent_pickpoint_duplicate_weather_refund() from public, anon, authenticated;
create trigger weather_refunds_protect_pickpoint_credit before insert or update on public.weather_refund_incidents
  for each row execute function public.prevent_pickpoint_duplicate_weather_refund();

-- Expose only PickPoint's already-published booking policy to its registered
-- public origin. This function cannot return another tenant's policy.
create or replace function public.get_pickpoint_public_booking_policy(
  p_tenant_slug text,
  p_hostname text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = 'off'
as $$
declare
  v_tenant_id uuid;
  v_policy jsonb;
begin
  if lower(btrim(coalesce(p_tenant_slug, ''))) <> 'pickpoint-pickleclub' then
    return null;
  end if;

  v_tenant_id := public.resolve_tenant_id(p_tenant_slug, p_hostname);
  if v_tenant_id is null
     or not public.request_origin_matches_tenant(v_tenant_id) then
    return null;
  end if;

  select setting.value
  into v_policy
  from public.settings setting
  where setting.tenant_id = v_tenant_id
    and setting.key = 'refund_reschedule_policy'
    and setting.is_public
  limit 1;

  if v_policy is null
     or public.refund_reschedule_policy_sha256(v_policy) is null then
    return null;
  end if;

  return jsonb_build_object(
    'publishedPolicy', v_policy,
    'policyConfigured', true,
    'capabilities', jsonb_build_object(
      'atomicMultiSessionBookingV1', true,
      'weatherCreditsV1', true
    )
  );
end;
$$;

revoke all on function public.get_pickpoint_public_booking_policy(text, text)
from public;

grant execute on function public.get_pickpoint_public_booking_policy(text, text)
to anon, authenticated;

commit;
