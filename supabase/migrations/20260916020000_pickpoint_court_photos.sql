-- PickPoint-only court photo uploads. The path and court ownership checks keep
-- this policy scoped to the requested tenant and its own court records.
drop policy if exists pickpoint_court_photos_insert on storage.objects;
create policy pickpoint_court_photos_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'tenant-public-assets'
  and split_part(name, '/', 1) = '3a4bcfeb-e8a7-417a-8b0c-90c37c3a6175'
  and split_part(name, '/', 2) = 'courts'
  and public.request_origin_matches_tenant('3a4bcfeb-e8a7-417a-8b0c-90c37c3a6175'::uuid)
  and public.has_tenant_role(
    '3a4bcfeb-e8a7-417a-8b0c-90c37c3a6175'::uuid,
    array['owner', 'admin']
  )
  and lower(storage.extension(name)) = any (array['jpg', 'jpeg', 'png', 'webp'])
  and exists (
    select 1
    from public.courts court
    where court.tenant_id = '3a4bcfeb-e8a7-417a-8b0c-90c37c3a6175'::uuid
      and court.id::text = split_part(name, '/', 3)
  )
);

drop policy if exists pickpoint_court_photos_delete on storage.objects;
create policy pickpoint_court_photos_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'tenant-public-assets'
  and split_part(name, '/', 1) = '3a4bcfeb-e8a7-417a-8b0c-90c37c3a6175'
  and split_part(name, '/', 2) = 'courts'
  and public.request_origin_matches_tenant('3a4bcfeb-e8a7-417a-8b0c-90c37c3a6175'::uuid)
  and public.has_tenant_role(
    '3a4bcfeb-e8a7-417a-8b0c-90c37c3a6175'::uuid,
    array['owner', 'admin']
  )
  and exists (
    select 1
    from public.courts court
    where court.tenant_id = '3a4bcfeb-e8a7-417a-8b0c-90c37c3a6175'::uuid
      and court.id::text = split_part(name, '/', 3)
  )
);
