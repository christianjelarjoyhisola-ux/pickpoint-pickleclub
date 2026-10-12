-- PickPoint active court owners can manage closures without a temporary grant.
begin;
CREATE OR REPLACE FUNCTION public.can_manage_blocked_dates(p_tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
  select public.is_platform_owner()
    or (p_tenant_id = '3a4bcfeb-e8a7-417a-8b0c-90c37c3a6175'::uuid and exists (
      select 1 from public.tenant_memberships membership
      where membership.tenant_id = p_tenant_id and membership.user_id = auth.uid()
        and membership.status = 'active' and membership.role = 'owner'
    ))
    or (
      exists (
        select 1
        from public.tenant_memberships membership
        where membership.tenant_id = p_tenant_id
          and membership.user_id = auth.uid()
          and membership.status = 'active'
          and membership.role in ('owner', 'admin')
      )
      and exists (
        select 1
        from public.blocked_date_access_grants access
        where access.tenant_id = p_tenant_id
          and access.revoked_at is null
          and access.expires_at > now()
      )
    );
$function$
;
CREATE OR REPLACE FUNCTION public.blocked_date_access_payload(p_tenant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
declare
  v_access public.blocked_date_access_grants%rowtype;
  v_status text;
begin
  if p_tenant_id = '3a4bcfeb-e8a7-417a-8b0c-90c37c3a6175'::uuid and exists (
    select 1 from public.tenant_memberships membership
    where membership.tenant_id = p_tenant_id and membership.user_id = auth.uid()
      and membership.status = 'active' and membership.role = 'owner'
  ) then
    return jsonb_build_object('canManage', true, 'status', 'active',
      'durationDays', null, 'grantedAt', null, 'expiresAt', null,
      'revokedAt', null, 'serverNow', clock_timestamp());
  end if;
  select access.* into v_access
  from public.blocked_date_access_grants access
  where access.tenant_id = p_tenant_id;

  if not found then
    v_status := 'none';
  elsif v_access.revoked_at is not null then
    v_status := 'revoked';
  elsif v_access.expires_at <= now() then
    v_status := 'expired';
  else
    v_status := 'active';
  end if;

  return jsonb_build_object(
    'canManage', public.can_manage_blocked_dates(p_tenant_id),
    'status', v_status,
    'durationDays', v_access.duration_days,
    'grantedAt', v_access.granted_at,
    'expiresAt', v_access.expires_at,
    'revokedAt', v_access.revoked_at,
    'serverNow', clock_timestamp()
  );
end;
$function$
;
notify pgrst, 'reload schema';
commit;
