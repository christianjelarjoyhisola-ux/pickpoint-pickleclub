-- Tenant-scoped reporting bounds for PickPoint's management dashboard.
-- This read returns no booking or customer details and cannot inspect another tenant.
create or replace function public.get_manager_regular_booking_reporting_bounds(
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
  v_timezone text;
  v_actor_role text;
  v_earliest date;
  v_as_of timestamptz := pg_catalog.clock_timestamp();
begin
  if auth.uid() is null or auth.role() is distinct from 'authenticated' then
    raise exception 'REPORTING_BOUNDS_AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  if lower(pg_catalog.btrim(coalesce(p_tenant_slug, ''))) <> 'pickpoint-pickleclub'
     or pg_catalog.char_length(pg_catalog.btrim(coalesce(p_hostname, ''))) not between 1 and 253 then
    raise exception 'REPORTING_BOUNDS_REQUEST_INVALID' using errcode = '22023';
  end if;

  v_tenant_id := public.resolve_tenant_id(p_tenant_slug, p_hostname);
  if v_tenant_id is null
     or v_tenant_id <> '3a4bcfeb-e8a7-417a-8b0c-90c37c3a6175'::uuid
     or not public.request_origin_matches_tenant(v_tenant_id) then
    raise exception 'REPORTING_BOUNDS_TENANT_ORIGIN_DENIED' using errcode = '42501';
  end if;

  if public.is_platform_owner() then
    v_actor_role := 'system_owner';
  else
    select membership.role
    into v_actor_role
    from public.tenant_memberships membership
    where membership.tenant_id = v_tenant_id
      and membership.user_id = auth.uid()
      and membership.status = 'active'
      and membership.role in ('owner', 'admin');
  end if;

  if v_actor_role is null then
    raise exception 'REPORTING_BOUNDS_ACCESS_DENIED' using errcode = '42501';
  end if;

  select tenant.timezone
  into strict v_timezone
  from public.tenants tenant
  where tenant.id = v_tenant_id
    and tenant.slug = 'pickpoint-pickleclub'
    and tenant.status = 'active';

  select min(booking.local_booking_date)
  into v_earliest
  from public.bookings booking
  where booking.tenant_id = v_tenant_id
    and booking.booking_type = 'regular';

  return pg_catalog.jsonb_build_object(
    'contractVersion', 1,
    'tenantSlug', 'pickpoint-pickleclub',
    'asOf', pg_catalog.to_char(
      v_as_of at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    'timezone', v_timezone,
    'earliestBookingDate', case
      when v_earliest is null then null
      else pg_catalog.to_char(v_earliest, 'YYYY-MM-DD')
    end
  );
exception
  when no_data_found then
    raise exception 'REPORTING_BOUNDS_UNAVAILABLE' using errcode = '55000';
end;
$$;

revoke all on function public.get_manager_regular_booking_reporting_bounds(text, text)
from public;

grant execute on function public.get_manager_regular_booking_reporting_bounds(text, text)
to authenticated;
