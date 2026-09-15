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
      'atomicMultiSessionBookingV1', true
    )
  );
end;
$$;

revoke all on function public.get_pickpoint_public_booking_policy(text, text)
from public;

grant execute on function public.get_pickpoint_public_booking_policy(text, text)
to anon, authenticated;
