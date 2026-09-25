-- Customer totals include the existing PHP 15 per-court-hour booking fee:
-- 05:00–17:00 = PHP 215/hour; 17:00–00:00 = PHP 265/hour.
do $$
declare
  v_tenant uuid;
  v_updated integer;
begin
  select id into strict v_tenant from public.tenants
  where slug = 'pickpoint-pickleclub';

  perform 1 from public.tenant_platform_billing
  where tenant_id = v_tenant and fee_mode = 'fixed_per_hour'
    and fee_amount = 15 and is_configured
  for update;
  if not found then
    raise exception 'Expected configured PHP 15 per-hour booking fee';
  end if;

  update public.courts
  set pricing_config = jsonb_set(pricing_config, '{regular,bands}',
    jsonb_build_array(
      jsonb_build_object('start', '05:00', 'end', '17:00', 'hourlyRate', 200),
      jsonb_build_object('start', '17:00', 'end', '00:00', 'hourlyRate', 250)
    ), false)
  where tenant_id = v_tenant
    and opens_at = '05:00'::time and closes_at = '00:00'::time
    and pricing_config #>> '{regular,bands,0,hourlyRate}' = '220'
    and (
      (id = 'a7da7042-1d33-4e6e-952b-c76da134410d'::uuid
        and pricing_config #>> '{regular,bands,1,hourlyRate}' = '1')
      or (id = '5ffe1b13-0bce-4016-8b60-1bc000d09871'::uuid
        and pricing_config #>> '{regular,bands,1,hourlyRate}' = '270')
    );
  get diagnostics v_updated = row_count;
  if v_updated <> 2 then
    raise exception 'Expected to update 2 PickPoint courts, updated %', v_updated;
  end if;
end
$$;
