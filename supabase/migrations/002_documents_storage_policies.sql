-- Private PDF storage policies for the Documents module.
-- The bucket remains private; authenticated users access files through signed URLs.

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do update
set public = false;

drop policy if exists "authenticated read document files"
  on storage.objects;
create policy "authenticated read document files"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'documents');

drop policy if exists "authenticated upload document files"
  on storage.objects;
create policy "authenticated upload document files"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'documents');

drop policy if exists "authenticated update document files"
  on storage.objects;
create policy "authenticated update document files"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'documents')
  with check (bucket_id = 'documents');

drop policy if exists "authenticated delete document files"
  on storage.objects;
create policy "authenticated delete document files"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'documents');
