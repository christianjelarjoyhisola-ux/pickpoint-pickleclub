begin;
select set_config('request.headers','{"origin":"https://pickpoint-pickleclub.christianjelarjoyhisola.workers.dev"}',true);
select set_config('request.jwt.claims','{"sub":"06322743-1e4c-4e19-85d7-b6a1a6e15eb5","role":"authenticated"}',true);
do $test$
declare result jsonb; test_day date := (now() at time zone 'Asia/Manila')::date+25; found_count integer;
begin
 result:=public.manage_blocked_dates(p_tenant_slug=>'pickpoint-pickleclub',p_action=>'create',p_start_date=>test_day,p_end_date=>test_day,p_court_id=>null,p_starts_at=>'19:00',p_ends_at=>'24:00',p_public_label=>'Maintenance',p_internal_reason=>'Rollback-only midnight regression');
 select count(*) into found_count from public.blocked_dates where tenant_id='3a4bcfeb-e8a7-417a-8b0c-90c37c3a6175' and internal_reason='Rollback-only midnight regression';
 if found_count<>1 then raise exception 'Expected one closure: %',result;end if;
 if not exists(select 1 from public.blocked_dates where tenant_id='3a4bcfeb-e8a7-417a-8b0c-90c37c3a6175' and internal_reason='Rollback-only midnight regression' and blocked_on=test_day and court_id is null and starts_at=time '19:00' and ends_at=time '24:00' and (blocked_on+ends_at)-(blocked_on+starts_at)=interval '5 hours') then raise exception 'Incorrect midnight range';end if;
 begin
 perform public.manage_blocked_dates(p_tenant_slug=>'pickpoint-pickleclub',p_action=>'create',p_start_date=>test_day,p_end_date=>test_day,p_court_id=>null,p_starts_at=>'23:00',p_ends_at=>'24:00',p_public_label=>'Maintenance');
 raise exception 'Overlap incorrectly accepted';
 exception when exclusion_violation then null;
 end;
end $test$;
rollback;
select 'PASS: owner can block all courts 7 PM to midnight as one five-hour closure; overlap denied; all changes rolled back' result;
