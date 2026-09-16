-- PickPoint-only public availability with truthful guest-facing slot states.
-- The fixed tenant id, slug, and registered-origin checks prevent this RPC
-- from reading or returning another tenant's occupancy data.
create or replace function public.get_pickpoint_public_availability(
  p_tenant_slug text,
  p_hostname text,
  p_date date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = 'off'
as $$
declare
  v_tenant public.tenants%rowtype;
  v_courts jsonb;
  v_blocked_dates jsonb;
begin
  if lower(btrim(coalesce(p_tenant_slug, ''))) <> 'pickpoint-pickleclub'
     or p_date is null then
    return null;
  end if;

  select tenant.*
  into v_tenant
  from public.tenants tenant
  where tenant.id = public.resolve_tenant_id(p_tenant_slug, p_hostname);

  if v_tenant.id is null
     or v_tenant.id <> '3a4bcfeb-e8a7-417a-8b0c-90c37c3a6175'::uuid
     or not public.request_origin_matches_tenant(v_tenant.id) then
    return null;
  end if;

  perform public.expire_stale_tenant_holds(v_tenant.id);

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', court.id,
      'slug', court.slug,
      'name', court.name,
      'unavailable', coalesce((
        select jsonb_agg(jsonb_build_object(
          'startsAt', to_char(
            occupancy.starts_at at time zone v_tenant.timezone,
            'YYYY-MM-DD"T"HH24:MI:SS'
          ),
          'endsAt', to_char(
            occupancy.ends_at at time zone v_tenant.timezone,
            'YYYY-MM-DD"T"HH24:MI:SS'
          ),
          'state', case
            when occupancy.status = 'held' then 'processing'
            else 'booked'
          end
        ) order by occupancy.starts_at, occupancy.ends_at)
        from public.court_occupancies occupancy
        where occupancy.tenant_id = v_tenant.id
          and occupancy.court_id = court.id
          and tsrange(
            occupancy.starts_at at time zone v_tenant.timezone,
            occupancy.ends_at at time zone v_tenant.timezone,
            '[)'
          ) && tsrange(
            p_date::timestamp,
            (p_date + 1)::timestamp,
            '[)'
          )
          and (
            occupancy.status = 'confirmed'
            or (
              occupancy.status = 'held'
              and occupancy.hold_expires_at > now()
            )
          )
      ), '[]'::jsonb)
    ) order by court.sort_order, court.name
  ), '[]'::jsonb)
  into v_courts
  from public.courts court
  where court.tenant_id = v_tenant.id
    and court.status = 'active';

  select coalesce(jsonb_agg(jsonb_build_object(
    'courtId', blocked.court_id,
    'startsAt', case
      when blocked.starts_at is null then null
      else to_char(
        blocked.blocked_on + blocked.starts_at,
        'YYYY-MM-DD"T"HH24:MI:SS'
      )
    end,
    'endsAt', case
      when blocked.ends_at is null then null
      when blocked.ends_at = time '23:59:59' then to_char(
        (blocked.blocked_on + 1)::timestamp,
        'YYYY-MM-DD"T"HH24:MI:SS'
      )
      else to_char(
        blocked.blocked_on + blocked.ends_at,
        'YYYY-MM-DD"T"HH24:MI:SS'
      )
    end,
    'label', blocked.public_label,
    'state', case
      when lower(coalesce(blocked.public_label, '')) like '%maintenance%'
        then 'maintenance'
      else 'closed'
    end
  ) order by blocked.starts_at nulls first, blocked.court_id), '[]'::jsonb)
  into v_blocked_dates
  from public.blocked_dates blocked
  where blocked.tenant_id = v_tenant.id
    and blocked.blocked_on = p_date;

  return jsonb_build_object(
    'tenantSlug', v_tenant.slug,
    'date', p_date,
    'timezone', v_tenant.timezone,
    'blockedDates', v_blocked_dates,
    'courts', v_courts
  );
end;
$$;

revoke all on function public.get_pickpoint_public_availability(text, text, date)
from public;

grant execute on function public.get_pickpoint_public_availability(text, text, date)
to anon, authenticated;
