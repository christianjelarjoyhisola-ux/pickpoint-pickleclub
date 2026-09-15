-- Target: Supabase project neqvrwtofiolcuxewdze only.
-- Adds one setup-required tenant and its exact Sites hostname. It never updates
-- existing tenant records and deliberately creates no courts, prices, users,
-- payment settings, bookings, or production activation.
begin;

do $pickpoint$
declare
  v_tenant_result jsonb;
  v_domain_result jsonb;
  v_tenant_id uuid;
  v_tenants_before text;
  v_domains_before text;
  v_billing_before text;
  v_requests_before text;
begin
  select md5(coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.id)::text, '[]'))
  into v_tenants_before from public.tenants row_value;
  select md5(coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.id)::text, '[]'))
  into v_domains_before from public.tenant_domains row_value;
  select md5(coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.id)::text, '[]'))
  into v_billing_before from public.tenant_platform_billing row_value;
  select md5(coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.operation, row_value.idempotency_key_hash)::text, '[]'))
  into v_requests_before from public.provisioning_requests row_value;

  v_tenant_result := public.provision_tenant(
    'pickpoint-tenant-20260915-ec2558caf14f45f188e76d6ab63a4228',
    'pickpoint-pickleclub',
    'PickPoint Pickle Club',
    'Asia/Manila'
  );
  v_tenant_id := (v_tenant_result ->> 'tenantId')::uuid;

  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  v_domain_result := public.provision_tenant_domain(
    'pickpoint-domain-20260915-da98c1c42bbc40fc8a84b48e18ad53fe',
    v_tenant_id,
    'pickpoint-pickleclub.boothsandbeyondoffic.chatgpt.site',
    true
  );

  if v_tenant_result ->> 'slug' <> 'pickpoint-pickleclub'
     or v_domain_result ->> 'hostname' <> 'pickpoint-pickleclub.boothsandbeyondoffic.chatgpt.site'
     or (select count(*) from public.tenants where id = v_tenant_id and slug = 'pickpoint-pickleclub' and status = 'active') <> 1
     or (select count(*) from public.tenant_setup_status where tenant_id = v_tenant_id and status = 'setup_required') <> 1
     or (select count(*) from public.tenant_platform_billing where tenant_id = v_tenant_id and is_configured = false) <> 1
     or (select count(*) from public.tenant_domains where tenant_id = v_tenant_id and hostname = 'pickpoint-pickleclub.boothsandbeyondoffic.chatgpt.site' and is_primary and is_active) <> 1
     or (select count(*) from public.courts where tenant_id = v_tenant_id) <> 0 then
    raise exception 'PICKPOINT_PROVISIONING_POSTCONDITION_FAILED';
  end if;

  if v_tenants_before <> (
       select md5(coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.id)::text, '[]'))
       from public.tenants row_value where row_value.id <> v_tenant_id
     )
     or v_domains_before <> (
       select md5(coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.id)::text, '[]'))
       from public.tenant_domains row_value where row_value.tenant_id <> v_tenant_id
     )
     or v_billing_before <> (
       select md5(coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.id)::text, '[]'))
       from public.tenant_platform_billing row_value where row_value.tenant_id <> v_tenant_id
     )
     or v_requests_before <> (
       select md5(coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.operation, row_value.idempotency_key_hash)::text, '[]'))
       from public.provisioning_requests row_value where row_value.tenant_id <> v_tenant_id
     ) then
    raise exception 'NON_PICKPOINT_TENANT_STATE_CHANGED';
  end if;
end;
$pickpoint$;

commit;

select tenant.id, tenant.slug, tenant.name, tenant.timezone,
       setup.status as setup_status,
       billing.is_configured as billing_configured,
       domain.hostname,
       domain.is_primary,
       domain.is_active,
       (select count(*) from public.courts court where court.tenant_id = tenant.id) as court_count
from public.tenants tenant
join public.tenant_setup_status setup on setup.tenant_id = tenant.id
join public.tenant_platform_billing billing on billing.tenant_id = tenant.id
join public.tenant_domains domain on domain.tenant_id = tenant.id
where tenant.slug = 'pickpoint-pickleclub';
