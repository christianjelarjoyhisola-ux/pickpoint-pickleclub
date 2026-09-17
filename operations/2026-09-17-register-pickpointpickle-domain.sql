-- Target: PickPoint tenant 3a4bcfeb-e8a7-417a-8b0c-90c37c3a6175 in
-- Supabase project neqvrwtofiolcuxewdze only. No other tenant is modified.
begin;

do $pickpoint_custom_domain$
declare
  v_tenant_id constant uuid := '3a4bcfeb-e8a7-417a-8b0c-90c37c3a6175';
  v_hostname constant text := 'pickpointpickle.com';
  v_result jsonb;
  v_other_domains_before text;
begin
  select md5(coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.id)::text, '[]'))
  into v_other_domains_before
  from public.tenant_domains row_value
  where row_value.tenant_id <> v_tenant_id;

  if not exists (
    select 1 from public.tenants
    where id = v_tenant_id and slug = 'pickpoint-pickleclub'
  ) then
    raise exception 'PICKPOINT_TENANT_NOT_FOUND';
  end if;

  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  v_result := public.provision_tenant_domain(
    'pickpoint-custom-domain-20260917-21d45d031d90475caa411c8f924aee4d',
    v_tenant_id,
    v_hostname,
    false
  );

  update public.tenant_domains
  set is_primary = (hostname = v_hostname)
  where tenant_id = v_tenant_id
    and is_primary is distinct from (hostname = v_hostname);

  if v_result ->> 'hostname' <> v_hostname
     or not exists (
       select 1 from public.tenant_domains
       where tenant_id = v_tenant_id
         and hostname = v_hostname
         and is_primary
         and is_active
     ) then
    raise exception 'PICKPOINT_CUSTOM_DOMAIN_POSTCONDITION_FAILED';
  end if;

  if v_other_domains_before <> (
    select md5(coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.id)::text, '[]'))
    from public.tenant_domains row_value
    where row_value.tenant_id <> v_tenant_id
  ) then
    raise exception 'NON_PICKPOINT_TENANT_DOMAIN_CHANGED';
  end if;
end;
$pickpoint_custom_domain$;

commit;

select hostname, is_primary, is_active
from public.tenant_domains
where tenant_id = '3a4bcfeb-e8a7-417a-8b0c-90c37c3a6175'
order by is_primary desc, hostname;
