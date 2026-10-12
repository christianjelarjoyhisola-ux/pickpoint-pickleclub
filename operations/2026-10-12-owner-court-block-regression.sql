begin;
select set_config('request.headers','{"origin":"https://pickpoint-pickleclub.christianjelarjoyhisola.workers.dev"}',true);
select set_config('request.jwt.claims','{"sub":"06322743-1e4c-4e19-85d7-b6a1a6e15eb5","role":"authenticated"}',true);
do $test$
declare result jsonb; block_id uuid; test_day date := (now() at time zone 'Asia/Manila')::date+25;
begin
 if not public.can_manage_blocked_dates('3a4bcfeb-e8a7-417a-8b0c-90c37c3a6175') then raise exception 'Owner permission missing';end if;
 result:=public.get_blocked_date_access('pickpoint-pickleclub');
 if result->>'status'<>'active' or result->>'canManage'<>'true' or result->>'expiresAt' is not null then raise exception 'Owner payload incorrect %',result;end if;
 result:=public.manage_blocked_dates(p_tenant_slug=>'pickpoint-pickleclub',p_action=>'create',p_start_date=>test_day,p_end_date=>test_day,p_court_id=>'a7da7042-1d33-4e6e-952b-c76da134410d',p_starts_at=>'05:00',p_ends_at=>'06:00',p_public_label=>'Maintenance',p_internal_reason=>'Rollback-only owner permission test');
 select id into block_id from public.blocked_dates where tenant_id='3a4bcfeb-e8a7-417a-8b0c-90c37c3a6175' and blocked_on=test_day and internal_reason='Rollback-only owner permission test';
 if block_id is null then raise exception 'Owner create failed %',result;end if;
 perform public.manage_blocked_dates(p_tenant_slug=>'pickpoint-pickleclub',p_action=>'delete',p_block_id=>block_id);
 if exists(select 1 from public.blocked_dates where id=block_id) then raise exception 'Owner remove failed';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
 if public.can_manage_blocked_dates('3a4bcfeb-e8a7-417a-8b0c-90c37c3a6175') then raise exception 'Nonmember granted access';end if;
end $test$;
rollback;
select 'PASS: owner access, create and remove; nonmember denied; all test changes rolled back' result;
