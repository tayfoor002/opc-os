-- Custom tables and private photo attachments for archived meeting minutes.

alter table public.meeting_minutes
  add column if not exists custom_tables jsonb not null default '[]'::jsonb,
  add column if not exists photos jsonb not null default '[]'::jsonb;

alter table public.meeting_minutes
  drop constraint if exists meeting_minutes_custom_tables_array,
  add constraint meeting_minutes_custom_tables_array
    check (jsonb_typeof(custom_tables) = 'array'),
  drop constraint if exists meeting_minutes_photos_array,
  add constraint meeting_minutes_photos_array
    check (jsonb_typeof(photos) = 'array');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'meeting-photos',
  'meeting-photos',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "authenticated meeting photos select"
  on storage.objects;
create policy "authenticated meeting photos select"
on storage.objects for select to authenticated
using (bucket_id = 'meeting-photos');

drop policy if exists "authenticated meeting photos insert"
  on storage.objects;
create policy "authenticated meeting photos insert"
on storage.objects for insert to authenticated
with check (bucket_id = 'meeting-photos');

drop policy if exists "authenticated meeting photos update"
  on storage.objects;
create policy "authenticated meeting photos update"
on storage.objects for update to authenticated
using (bucket_id = 'meeting-photos')
with check (bucket_id = 'meeting-photos');

drop policy if exists "authenticated meeting photos delete"
  on storage.objects;
create policy "authenticated meeting photos delete"
on storage.objects for delete to authenticated
using (bucket_id = 'meeting-photos');

notify pgrst, 'reload schema';
