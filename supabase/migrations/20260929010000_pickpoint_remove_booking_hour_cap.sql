begin;
-- PickPoint may reserve any available hours within a court's operating day.
-- Shared-platform limits for other venues remain unchanged.
CREATE OR REPLACE FUNCTION public.create_public_booking_core(p_tenant_slug text, p_hostname text, p_court_id uuid, p_booking_type text, p_customer_name text, p_customer_email text, p_customer_phone text, p_guest_count integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_slots jsonb, p_subtotal_amount numeric, p_service_fee_amount numeric, p_total_amount numeric, p_currency text, p_metadata jsonb DEFAULT '{}'::jsonb, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
declare
  v_tenant public.tenants%rowtype;
  v_court public.courts%rowtype;
  v_platform_billing public.tenant_platform_billing%rowtype;
  v_booking public.bookings%rowtype;
  v_slot jsonb;
  v_slot_start timestamptz;
  v_slot_end timestamptz;
  v_previous_end timestamptz;
  v_slot_count integer;
  v_min_hours numeric;
  v_max_hours numeric;
  v_day_hours integer := case when p_tenant_slug = 'pickpoint-pickleclub' then 24 else 18 end;
  v_max_guests integer;
  v_duration_hours numeric;
  v_expected_subtotal numeric(12,2) := 0;
  v_expected_service_fee numeric(12,2);
  v_event_hourly_rate numeric(12,2);
  v_slot_hourly_rate numeric(12,2);
  v_local_booking_start timestamp;
  v_local_booking_end timestamp;
  v_local_slot_start timestamp;
  v_operating_date date;
  v_operating_start timestamp;
  v_operating_end timestamp;
  v_band jsonb;
  v_band_start_text text;
  v_band_end_text text;
  v_band_rate_text text;
  v_band_start_minutes integer;
  v_band_end_minutes integer;
  v_slot_minutes integer;
  v_comparison_minutes integer;
  v_matching_band_count integer;
  v_policy_value text;
  v_minimum_lead_minutes integer := 30;
  v_max_advance_days integer := 180;
  v_latest_booking_start timestamptz;
  v_expires_at timestamptz := now() + interval '15 minutes';
  v_reference text;
begin
  select t.* into v_tenant
  from public.tenants t
  where t.id = public.resolve_tenant_id(p_tenant_slug, p_hostname)
  for share;

  if v_tenant.id is null then
    raise exception 'Unknown tenant or hostname.' using errcode = '22023';
  end if;

  select c.* into v_court
  from public.courts c
  where c.id = p_court_id
    and c.tenant_id = v_tenant.id
    and c.status = 'active'
  for share;

  if v_court.id is null then
    raise exception 'Court is not available for this tenant.' using errcode = '22023';
  end if;

  select billing.* into v_platform_billing
  from public.tenant_platform_billing billing
  where billing.tenant_id = v_tenant.id
  for share;

  if v_platform_billing.id is null then
    raise exception 'Platform billing is not configured for this tenant.'
      using errcode = '22023';
  end if;

  -- Reconcile elapsed holds before idempotency lookup so a retry never receives
  -- a stale pending status for a booking whose reservation already elapsed.
  with expired_slots as (
    update public.booking_slots
    set status = 'expired'
    where tenant_id = v_tenant.id
      and court_id = v_court.id
      and status = 'held'
      and hold_expires_at <= now()
    returning booking_id
  )
  update public.bookings b
  set status = 'expired'
  where b.tenant_id = v_tenant.id
    and b.status = 'pending_payment'
    and exists (
      select 1 from expired_slots es where es.booking_id = b.id
    );

  if nullif(btrim(p_idempotency_key), '') is not null then
    select b.* into v_booking
    from public.bookings b
    where b.tenant_id = v_tenant.id
      and b.idempotency_key = btrim(p_idempotency_key);
    if v_booking.id is not null then
      if v_booking.status = 'pending_payment'
         and (v_booking.expires_at is null or v_booking.expires_at <= now()) then
        update public.booking_slots
        set status = 'expired'
        where tenant_id = v_tenant.id
          and booking_id = v_booking.id
          and status = 'held';
        update public.bookings
        set status = 'expired'
        where tenant_id = v_tenant.id
          and id = v_booking.id
        returning * into v_booking;
      end if;
      if v_booking.court_id is distinct from p_court_id
         or v_booking.booking_type is distinct from p_booking_type
         or v_booking.customer_name is distinct from btrim(p_customer_name)
         or v_booking.customer_email is distinct from nullif(lower(btrim(p_customer_email)), '')
         or v_booking.customer_phone is distinct from btrim(p_customer_phone)
         or v_booking.guest_count is distinct from p_guest_count
         or v_booking.starts_at is distinct from p_starts_at
         or v_booking.ends_at is distinct from p_ends_at then
        raise exception 'Idempotency key was already used for a different booking request.'
          using errcode = '22023';
      end if;
      return jsonb_build_object(
        'bookingId', v_booking.id,
        'reference', v_booking.reference,
        'status', v_booking.status,
        'expiresAt', v_booking.expires_at
      );
    end if;
  end if;

  if p_booking_type not in ('regular', 'event') then
    raise exception 'Invalid booking type.' using errcode = '22023';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'Invalid booking interval.' using errcode = '22023';
  end if;
  if p_ends_at - p_starts_at > make_interval(hours => v_day_hours) then
    raise exception 'A public booking cannot exceed 18 hours.' using errcode = '22023';
  end if;
  if p_starts_at <= now() then
    raise exception 'A booking must start in the future.' using errcode = '22023';
  end if;

  -- Mirror the Edge policy: only integer JSON numbers inside the safe ranges
  -- override the defaults. Strings, fractions, and out-of-range values fall
  -- back to 30 minutes / 180 tenant-local days.
  if jsonb_typeof(v_court.public_config -> 'minimumLeadMinutes') = 'number' then
    v_policy_value := v_court.public_config ->> 'minimumLeadMinutes';
    if v_policy_value ~ '^[0-9]+$'
       and v_policy_value::numeric between 0 and 10080 then
      v_minimum_lead_minutes := v_policy_value::integer;
    end if;
  end if;
  if jsonb_typeof(v_court.public_config -> 'maximumAdvanceDays') = 'number' then
    v_policy_value := v_court.public_config ->> 'maximumAdvanceDays';
    if v_policy_value ~ '^[0-9]+$'
       and v_policy_value::numeric between 0 and 730 then
      v_max_advance_days := v_policy_value::integer;
    end if;
  end if;
  if p_starts_at < now() + (v_minimum_lead_minutes * interval '1 minute') then
    raise exception 'Booking does not meet the configured minimum lead time.'
      using errcode = '22023';
  end if;
  v_latest_booking_start := (
    ((now() at time zone v_tenant.timezone)::date + v_max_advance_days + 1)::timestamp
    at time zone v_tenant.timezone
  ) - interval '1 microsecond';
  if p_starts_at > v_latest_booking_start then
    raise exception 'Booking exceeds the configured maximum advance date.'
      using errcode = '22023';
  end if;

  v_local_booking_start := p_starts_at at time zone v_tenant.timezone;
  v_local_booking_end := p_ends_at at time zone v_tenant.timezone;
  if v_local_booking_start <> date_trunc('hour', v_local_booking_start)
     or v_local_booking_end <> date_trunc('hour', v_local_booking_end) then
    raise exception 'Bookings must start and end on exact local hours.'
      using errcode = '22023';
  end if;

  -- Anchor overnight opening windows to the prior local date when a booking
  -- starts after midnight but before the configured closing time.
  v_operating_date := v_local_booking_start::date;
  if v_court.closes_at <= v_court.opens_at
     and v_local_booking_start::time < v_court.closes_at then
    v_operating_date := v_operating_date - 1;
  end if;
  v_operating_start := v_operating_date + v_court.opens_at;
  if v_court.closes_at <= v_court.opens_at
     or v_court.closes_at = time '23:59:59' then
    v_operating_end := v_operating_date + 1 +
      case
        when v_court.closes_at = time '23:59:59' then time '00:00'
        else v_court.closes_at
      end;
  else
    v_operating_end := v_operating_date + v_court.closes_at;
  end if;
  if v_local_booking_start < v_operating_start
     or v_local_booking_end > v_operating_end then
    raise exception 'Booking is outside the court operating hours.'
      using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_customer_name, ''))) < 2
     or char_length(btrim(coalesce(p_customer_phone, ''))) < 7 then
    raise exception 'Customer name and phone are required.' using errcode = '22023';
  end if;
  if p_customer_email is not null
     and btrim(p_customer_email) <> ''
     and btrim(p_customer_email) !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'Invalid customer email.' using errcode = '22023';
  end if;
  if p_guest_count is null or p_guest_count < 1 or p_guest_count > 500 then
    raise exception 'Invalid guest count.' using errcode = '22023';
  end if;
  if p_subtotal_amount is null or p_service_fee_amount is null
     or p_total_amount is null or p_subtotal_amount < 0
     or p_service_fee_amount < 0
     or p_total_amount <> p_subtotal_amount + p_service_fee_amount then
    raise exception 'Invalid booking totals.' using errcode = '22023';
  end if;
  if upper(p_currency) <> v_court.currency then
    raise exception 'Currency does not match the court configuration.' using errcode = '22023';
  end if;
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'Metadata must be a JSON object.' using errcode = '22023';
  end if;
  if p_slots is null or jsonb_typeof(p_slots) <> 'array' then
    raise exception 'Slots must be a JSON array.' using errcode = '22023';
  end if;

  v_slot_count := jsonb_array_length(p_slots);
  if v_slot_count < 1 or v_slot_count > v_day_hours then
    raise exception 'Between 1 and 18 one-hour slots are required.' using errcode = '22023';
  end if;

  v_duration_hours := extract(epoch from (p_ends_at - p_starts_at)) / 3600;
  v_min_hours := case p_booking_type
    when 'event' then coalesce((v_court.pricing_config #>> '{event,minimumHours}')::numeric, 4)
    else coalesce((v_court.pricing_config #>> '{regular,minimumHours}')::numeric, 1)
  end;
  v_max_hours := case p_booking_type
    when 'event' then coalesce((v_court.pricing_config #>> '{event,maximumHours}')::numeric, 18)
    else coalesce((v_court.pricing_config #>> '{regular,maximumHours}')::numeric, 18)
  end;
  if v_min_hours < 1 or v_min_hours > v_day_hours
     or v_max_hours < v_min_hours or v_max_hours > v_day_hours then
    raise exception 'Court duration configuration is invalid.' using errcode = '22023';
  end if;
  if v_duration_hours < v_min_hours or v_duration_hours > v_max_hours then
    raise exception 'Booking does not meet the configured duration limits.' using errcode = '22023';
  end if;

  if p_booking_type = 'event' then
    v_max_guests := coalesce((v_court.pricing_config #>> '{event,maximumGuests}')::integer, 50);
    if p_guest_count > v_max_guests then
      raise exception 'Guest count exceeds the configured event capacity.' using errcode = '22023';
    end if;
    if coalesce(v_court.pricing_config #>> '{event,hourlyRate}', '')
       !~ '^[0-9]+([.][0-9]{1,2})?$' then
      raise exception 'Event hourly rate is not configured correctly.' using errcode = '22023';
    end if;
    v_event_hourly_rate := (v_court.pricing_config #>> '{event,hourlyRate}')::numeric;
    if v_event_hourly_rate <= 0 then
      raise exception 'Event hourly rate must be positive.' using errcode = '22023';
    end if;
  elsif jsonb_typeof(v_court.pricing_config #> '{regular,bands}')
        is distinct from 'array' then
    raise exception 'Regular rate bands are not configured correctly.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.blocked_dates bd
    where bd.tenant_id = v_tenant.id
      and (bd.court_id is null or bd.court_id = v_court.id)
      and bd.blocked_on between
        (p_starts_at at time zone v_tenant.timezone)::date
        and ((p_ends_at - interval '1 microsecond') at time zone v_tenant.timezone)::date
      and (
        bd.starts_at is null
        or tsrange(
          bd.blocked_on + bd.starts_at,
          bd.blocked_on + bd.ends_at,
          '[)'
        ) && tsrange(
          p_starts_at at time zone v_tenant.timezone,
          p_ends_at at time zone v_tenant.timezone,
          '[)'
        )
      )
  ) then
    raise exception 'The selected court is blocked during this booking interval.'
      using errcode = '23P01';
  end if;

  for v_slot in select value from jsonb_array_elements(p_slots)
  loop
    if jsonb_typeof(v_slot) <> 'object'
       or not (v_slot ? 'startsAt')
       or not (v_slot ? 'endsAt') then
      raise exception 'Every slot needs startsAt and endsAt.' using errcode = '22023';
    end if;
    v_slot_start := (v_slot ->> 'startsAt')::timestamptz;
    v_slot_end := (v_slot ->> 'endsAt')::timestamptz;
    if v_slot_end - v_slot_start <> interval '1 hour' then
      raise exception 'Every booking slot must be exactly one hour.' using errcode = '22023';
    end if;
    v_local_slot_start := v_slot_start at time zone v_tenant.timezone;
    if v_local_slot_start <> date_trunc('hour', v_local_slot_start) then
      raise exception 'Every booking slot must start on an exact local hour.'
        using errcode = '22023';
    end if;
    if v_previous_end is null and v_slot_start <> p_starts_at then
      raise exception 'The first slot must start with the booking.' using errcode = '22023';
    end if;
    if v_previous_end is not null and v_slot_start <> v_previous_end then
      raise exception 'Booking slots must be ordered and consecutive.' using errcode = '22023';
    end if;

    if p_booking_type = 'event' then
      v_slot_hourly_rate := v_event_hourly_rate;
    else
      v_slot_minutes := extract(hour from v_local_slot_start)::integer * 60
        + extract(minute from v_local_slot_start)::integer;
      v_matching_band_count := 0;
      v_slot_hourly_rate := null;

      for v_band in
        select value
        from jsonb_array_elements(v_court.pricing_config #> '{regular,bands}')
      loop
        if jsonb_typeof(v_band) <> 'object' then
          raise exception 'Every regular rate band must be a JSON object.'
            using errcode = '22023';
        end if;
        v_band_start_text := coalesce(v_band ->> 'start', '');
        v_band_end_text := coalesce(v_band ->> 'end', '');
        v_band_rate_text := coalesce(v_band ->> 'hourlyRate', '');
        if v_band_start_text !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
           or v_band_end_text !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$'
           or v_band_rate_text !~ '^[0-9]+([.][0-9]{1,2})?$' then
          raise exception 'Regular rate band values are invalid.' using errcode = '22023';
        end if;

        v_band_start_minutes := split_part(v_band_start_text, ':', 1)::integer * 60
          + split_part(v_band_start_text, ':', 2)::integer;
        if v_band_end_text = '24:00' then
          v_band_end_minutes := 1440;
        else
          v_band_end_minutes := split_part(v_band_end_text, ':', 1)::integer * 60
            + split_part(v_band_end_text, ':', 2)::integer;
        end if;
        if v_band_end_minutes <= v_band_start_minutes then
          v_band_end_minutes := v_band_end_minutes + 1440;
        end if;
        v_comparison_minutes := v_slot_minutes;
        if v_comparison_minutes < v_band_start_minutes then
          v_comparison_minutes := v_comparison_minutes + 1440;
        end if;

        if v_comparison_minutes >= v_band_start_minutes
           and v_comparison_minutes < v_band_end_minutes then
          v_matching_band_count := v_matching_band_count + 1;
          v_slot_hourly_rate := v_band_rate_text::numeric;
        end if;
      end loop;

      if v_matching_band_count <> 1 or v_slot_hourly_rate <= 0 then
        raise exception 'Each regular slot must match exactly one positive rate band.'
          using errcode = '22023';
      end if;
    end if;

    v_expected_subtotal := v_expected_subtotal + v_slot_hourly_rate;
    v_previous_end := v_slot_end;
  end loop;

  if v_previous_end <> p_ends_at then
    raise exception 'The last slot must end with the booking.' using errcode = '22023';
  end if;
  if v_duration_hours is distinct from v_slot_count::numeric then
    raise exception 'Slot count does not match the booking duration.' using errcode = '22023';
  end if;

  v_expected_subtotal := round(v_expected_subtotal, 2);
  if p_subtotal_amount is distinct from v_expected_subtotal then
    raise exception 'Court subtotal does not match the current protected rate calculation.'
      using errcode = '22023';
  end if;

  v_expected_service_fee := round(
    case v_platform_billing.fee_mode
      when 'fixed_per_booking' then v_platform_billing.fee_amount
      when 'fixed_per_hour' then v_platform_billing.fee_amount * v_duration_hours
      when 'percentage' then v_expected_subtotal * v_platform_billing.fee_amount / 100
      else null
    end,
    2
  );
  if v_expected_service_fee is null
     or p_service_fee_amount is distinct from v_expected_service_fee
     or p_total_amount is distinct from v_expected_subtotal + v_expected_service_fee then
    raise exception 'Platform booking fee does not match protected configuration.'
      using errcode = '22023';
  end if;

  v_reference := 'PB-' || upper(substr(replace(extensions.gen_random_uuid()::text, '-', ''), 1, 12));

  insert into public.bookings (
    tenant_id, court_id, reference, idempotency_key, booking_type, status,
    payment_status, customer_name, customer_email, customer_phone, guest_count,
    starts_at, ends_at, local_booking_date, subtotal_amount,
    service_fee_amount, total_amount, currency, expires_at, metadata
  ) values (
    v_tenant.id, v_court.id, v_reference, nullif(btrim(p_idempotency_key), ''),
    p_booking_type, 'pending_payment', 'unpaid', btrim(p_customer_name),
    nullif(lower(btrim(p_customer_email)), ''), btrim(p_customer_phone),
    p_guest_count, p_starts_at, p_ends_at,
    (p_starts_at at time zone v_tenant.timezone)::date,
    v_expected_subtotal, v_expected_service_fee,
    v_expected_subtotal + v_expected_service_fee,
    upper(p_currency), v_expires_at, p_metadata
  ) returning * into v_booking;

  for v_slot in select value from jsonb_array_elements(p_slots)
  loop
    insert into public.booking_slots (
      tenant_id, booking_id, court_id, starts_at, ends_at, status, hold_expires_at
    ) values (
      v_tenant.id,
      v_booking.id,
      v_court.id,
      (v_slot ->> 'startsAt')::timestamptz,
      (v_slot ->> 'endsAt')::timestamptz,
      'held',
      v_expires_at
    );
  end loop;

  return jsonb_build_object(
    'bookingId', v_booking.id,
    'reference', v_booking.reference,
    'status', v_booking.status,
    'expiresAt', v_booking.expires_at
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.create_public_booking_group_with_access_base_v1(p_tenant_slug text, p_hostname text, p_booking_type text, p_customer_name text, p_customer_email text, p_customer_phone text, p_guest_count integer, p_sessions jsonb, p_metadata jsonb, p_idempotency_key text, p_access_token_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
declare
  v_tenant_id uuid;
  v_tenant_timezone text;
  v_existing public.bookings%rowtype;
  v_primary public.bookings%rowtype;
  v_session jsonb;
  v_result jsonb;
  v_session_result jsonb;
  v_sessions_result jsonb := '[]'::jsonb;
  v_booking_id uuid;
  v_primary_id uuid;
  v_session_index integer := 0;
  v_session_count integer;
  v_slot_count integer := 0;
  v_session_key text;
  v_session_token_hash text;
  v_first_start timestamptz;
  v_last_end timestamptz;
  v_subtotal numeric(12,2) := 0;
  v_court_subtotal numeric(12,2) := 0;
  v_equipment_fee numeric(12,2) := 0;
  v_service_fee numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_currency text;
  v_access_expires_at timestamptz;
  v_fingerprint text;
begin
  if p_access_token_hash is null or p_access_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Customer access token digest is invalid.' using errcode = '22023';
  end if;
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'Group metadata must be a JSON object.' using errcode = '22023';
  end if;
  if p_sessions is null or jsonb_typeof(p_sessions) <> 'array' then
    raise exception 'Booking sessions must be a JSON array.' using errcode = '22023';
  end if;

  v_session_count := jsonb_array_length(p_sessions);
  if v_session_count < 1 or (p_tenant_slug <> 'pickpoint-pickleclub' and v_session_count > 18) then
    raise exception 'Between 1 and 18 booking sessions are required.' using errcode = '22023';
  end if;

  v_fingerprint := nullif(p_metadata ->> 'groupFingerprint', '');
  if v_fingerprint is null or char_length(v_fingerprint) <> 64 or v_fingerprint !~ '^[a-f0-9]{64}$' then
    raise exception 'Booking group fingerprint is invalid.' using errcode = '22023';
  end if;

  v_tenant_id := public.resolve_tenant_id(p_tenant_slug, p_hostname);
  select t.timezone
    into v_tenant_timezone
    from public.tenants t
   where t.id = v_tenant_id
     and t.status = 'active';
  if v_tenant_id is null or v_tenant_timezone is null then
    raise exception 'Unknown tenant or hostname.' using errcode = '22023';
  end if;

  -- A lost response is retried with the same browser UUID. Return the one
  -- previously consolidated booking and never recreate deleted child rows.
  select b.*
    into v_existing
    from public.bookings b
   where b.tenant_id = v_tenant_id
     and b.idempotency_key = btrim(p_idempotency_key);

  if v_existing.id is not null then
    if coalesce(v_existing.metadata ->> 'groupFingerprint', '') <> v_fingerprint then
      raise exception 'Idempotency key was already used for a different booking group.' using errcode = '22023';
    end if;
    select token.expires_at
      into v_access_expires_at
      from public.booking_access_tokens token
     where token.tenant_id = v_existing.tenant_id
       and token.booking_id = v_existing.id;
    return jsonb_build_object(
      'bookingId', v_existing.id,
      'reference', v_existing.reference,
      'status', v_existing.status,
      'expiresAt', v_existing.expires_at,
      'accessExpiresAt', v_access_expires_at,
      'courtName', coalesce(v_existing.metadata ->> 'courtName', 'Dinktopia courts'),
      'bookingType', v_existing.booking_type,
      'startsAt', v_existing.starts_at,
      'endsAt', v_existing.ends_at,
      'subtotalAmount', v_existing.subtotal_amount,
      'courtSubtotalAmount', coalesce((v_existing.metadata ->> 'courtSubtotalAmount')::numeric, v_existing.subtotal_amount),
      'equipmentRentalFeeAmount', coalesce((v_existing.metadata ->> 'equipmentRentalFeeAmount')::numeric, 0),
      'equipmentRental', coalesce(v_existing.metadata -> 'equipmentRental', '{"extraPaddles":0,"balls":0}'::jsonb),
      'serviceFeeAmount', v_existing.service_fee_amount,
      'totalAmount', v_existing.total_amount,
      'currency', v_existing.currency,
      'fullPaymentOnly', coalesce((v_existing.metadata ->> 'fullPaymentOnly')::boolean, false),
      'sessions', coalesce(v_existing.metadata -> 'sessions', '[]'::jsonb)
    );
  end if;

  for v_session in select value from jsonb_array_elements(p_sessions)
  loop
    v_session_index := v_session_index + 1;
    if jsonb_typeof(v_session) <> 'object'
       or jsonb_typeof(v_session -> 'slots') <> 'array'
       or jsonb_typeof(v_session -> 'metadata') <> 'object' then
      raise exception 'Every booking session is invalid.' using errcode = '22023';
    end if;
    v_slot_count := v_slot_count + jsonb_array_length(v_session -> 'slots');
    if p_tenant_slug <> 'pickpoint-pickleclub' and v_slot_count > 18 then
      raise exception 'A booking group cannot exceed 18 court-hours.' using errcode = '22023';
    end if;

    v_session_key := case
      when v_session_index = 1 then btrim(p_idempotency_key)
      else btrim(p_idempotency_key) || ':' || v_session_index::text
    end;
    -- The access-token digest is unique per tenant. Temporary child bookings
    -- therefore need distinct digests until their slots are consolidated and
    -- the child rows (and their cascading token rows) are deleted below.
    v_session_token_hash := case
      when v_session_index = 1 then p_access_token_hash
      else md5(p_access_token_hash || ':' || v_session_index::text)
        || md5('child:' || p_access_token_hash || ':' || v_session_index::text)
    end;

    v_result := public.create_public_booking_with_access(
      p_tenant_slug,
      p_hostname,
      (v_session ->> 'courtId')::uuid,
      p_booking_type,
      p_customer_name,
      p_customer_email,
      p_customer_phone,
      p_guest_count,
      (v_session ->> 'startsAt')::timestamptz,
      (v_session ->> 'endsAt')::timestamptz,
      v_session -> 'slots',
      (v_session ->> 'subtotalAmount')::numeric,
      (v_session ->> 'serviceFeeAmount')::numeric,
      (v_session ->> 'totalAmount')::numeric,
      v_session ->> 'currency',
      v_session -> 'metadata',
      v_session_key,
      v_session_token_hash
    );

    v_booking_id := nullif(v_result ->> 'bookingId', '')::uuid;
    if v_booking_id is null then
      raise exception 'A validated booking session returned no booking.' using errcode = '22023';
    end if;

    if v_primary_id is null then
      v_primary_id := v_booking_id;
    else
      update public.booking_slots
         set booking_id = v_primary_id
       where tenant_id = v_tenant_id
         and booking_id = v_booking_id;
      delete from public.bookings
       where tenant_id = v_tenant_id
         and id = v_booking_id;
    end if;

    v_first_start := least(
      coalesce(v_first_start, (v_result ->> 'startsAt')::timestamptz),
      (v_result ->> 'startsAt')::timestamptz
    );
    v_last_end := greatest(
      coalesce(v_last_end, (v_result ->> 'endsAt')::timestamptz),
      (v_result ->> 'endsAt')::timestamptz
    );
    v_subtotal := v_subtotal + (v_result ->> 'subtotalAmount')::numeric;
    v_court_subtotal := v_court_subtotal + (v_result ->> 'courtSubtotalAmount')::numeric;
    v_equipment_fee := v_equipment_fee + (v_result ->> 'equipmentRentalFeeAmount')::numeric;
    v_service_fee := v_service_fee + (v_result ->> 'serviceFeeAmount')::numeric;
    v_total := v_total + (v_result ->> 'totalAmount')::numeric;
    if v_currency is null then
      v_currency := v_result ->> 'currency';
    elsif v_currency <> v_result ->> 'currency' then
      raise exception 'All booking sessions must use one currency.' using errcode = '22023';
    end if;

    v_session_result := jsonb_build_object(
      'courtId', v_session ->> 'courtId',
      'courtName', v_result ->> 'courtName',
      'bookingDate', v_session ->> 'bookingDate',
      'startTime', v_session ->> 'startTime',
      'durationHours', (v_session ->> 'durationHours')::integer,
      'startsAt', v_result ->> 'startsAt',
      'endsAt', v_result ->> 'endsAt',
      'subtotalAmount', (v_result ->> 'subtotalAmount')::numeric
    );
    v_sessions_result := v_sessions_result || jsonb_build_array(v_session_result);
  end loop;

  if v_primary_id is null or v_slot_count < 1 then
    raise exception 'The booking group contained no court-hours.' using errcode = '22023';
  end if;

  update public.bookings b
     set starts_at = v_first_start,
         ends_at = v_last_end,
         local_booking_date = (v_first_start at time zone v_tenant_timezone)::date,
         subtotal_amount = v_subtotal,
         service_fee_amount = v_service_fee,
         total_amount = v_total,
         metadata = p_metadata || jsonb_build_object(
           'atomicMultiSessionBookingV1', true,
           'sessions', v_sessions_result,
           -- Access-token updates are guarded by the immutable policy
           -- evidence trigger, so retain the server-validated first-session
           -- acceptance on the consolidated parent booking.
           'policyAcceptance', p_sessions #> '{0,metadata,policyAcceptance}',
           'courtSubtotalAmount', v_court_subtotal,
           'equipmentRentalFeeAmount', v_equipment_fee,
           'fullPaymentOnly', true
         )
   where b.tenant_id = v_tenant_id
     and b.id = v_primary_id
   returning b.* into v_primary;

  update public.booking_slots slot
     set hold_expires_at = v_primary.expires_at
   where slot.tenant_id = v_tenant_id
     and slot.booking_id = v_primary.id;

  v_access_expires_at := greatest(v_last_end + interval '30 days', now() + interval '1 day');
  update public.booking_access_tokens token
     set expires_at = greatest(token.expires_at, v_access_expires_at)
   where token.tenant_id = v_tenant_id
     and token.booking_id = v_primary.id;

  return jsonb_build_object(
    'bookingId', v_primary.id,
    'reference', v_primary.reference,
    'status', v_primary.status,
    'expiresAt', v_primary.expires_at,
    'accessExpiresAt', v_access_expires_at,
    'courtName', coalesce(p_metadata ->> 'courtName', case when v_session_count = 1 then v_sessions_result #>> '{0,courtName}' else v_session_count::text || ' courts' end),
    'bookingType', v_primary.booking_type,
    'startsAt', v_primary.starts_at,
    'endsAt', v_primary.ends_at,
    'subtotalAmount', v_primary.subtotal_amount,
    'courtSubtotalAmount', v_court_subtotal,
    'equipmentRentalFeeAmount', v_equipment_fee,
    'equipmentRental', coalesce(p_metadata -> 'equipmentRental', '{"extraPaddles":0,"balls":0}'::jsonb),
    'serviceFeeAmount', v_primary.service_fee_amount,
    'totalAmount', v_primary.total_amount,
    'currency', v_primary.currency,
    'fullPaymentOnly', true,
    'sessions', v_sessions_result
  );
end;
$function$
;
update public.courts set pricing_config=jsonb_set(pricing_config,'{regular,maximumHours}','24'::jsonb) where tenant_id='3a4bcfeb-e8a7-417a-8b0c-90c37c3a6175';
notify pgrst,'reload schema';
commit;
