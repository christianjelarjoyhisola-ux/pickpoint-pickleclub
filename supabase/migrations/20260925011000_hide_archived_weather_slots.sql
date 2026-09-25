begin;
-- Deleted bookings belong in the System Owner's Trash, never the weather picker.
do $migration$
declare definition text;
begin
 select pg_get_functiondef('public.pickpoint_weather_slot_quotes(uuid,date)'::regprocedure) into definition;
 if position('and b.archived_at is null' in definition)=0 then
   definition := replace(definition,
     'where s.tenant_id=p_tenant and b.booking_type=''regular'' and s.balance_request_id is null',
     'where s.tenant_id=p_tenant and b.booking_type=''regular'' and b.archived_at is null and s.balance_request_id is null');
   if position('and b.archived_at is null' in definition)=0 then
     raise exception 'Unexpected weather quote function definition';
   end if;
   execute definition;
 end if;
end $migration$;
notify pgrst, 'reload schema';
commit;
