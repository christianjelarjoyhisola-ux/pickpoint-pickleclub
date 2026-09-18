-- Set PickPoint venue revenue rates so the fixed PHP 15 per-court-hour
-- platform fee produces customer prices of PHP 235 daytime and PHP 285 evening.
-- The current-rate guards make this operation fail instead of overwriting a
-- concurrent owner change.
do $$
declare
  v_updated integer;
begin
  update public.courts as court
  set pricing_config = jsonb_set(
    court.pricing_config,
    '{regular,bands}',
    jsonb_build_array(
      jsonb_build_object('start', '05:00', 'end', '17:00', 'hourlyRate', 220),
      jsonb_build_object('start', '17:00', 'end', '00:00', 'hourlyRate', 270)
    ),
    false
  )
  where court.tenant_id = (
    select tenant.id
    from public.tenants as tenant
    where tenant.slug = 'pickpoint-pickleclub'
  )
  and court.id in (
    'a7da7042-1d33-4e6e-952b-c76da134410d'::uuid,
    '5ffe1b13-0bce-4016-8b60-1bc000d09871'::uuid
  )
  and court.pricing_config #>> '{regular,bands,0,hourlyRate}' = '255'
  and court.pricing_config #>> '{regular,bands,1,hourlyRate}' = '305';

  get diagnostics v_updated = row_count;
  if v_updated <> 2 then
    raise exception 'Expected to update 2 PickPoint courts, updated %', v_updated;
  end if;
end
$$;
