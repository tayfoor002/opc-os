-- Zone classification and original source storage for handwritten meeting PVs.

alter table public.meeting_minutes
  add column if not exists zone_id uuid references public.zones(id) on delete set null,
  add column if not exists source_file_path text,
  add column if not exists source_original_name text,
  add column if not exists source_mime_type text,
  add column if not exists ocr_confidence numeric(4,3),
  add column if not exists ocr_warnings jsonb not null default '[]'::jsonb;

alter table public.meeting_minutes
  drop constraint if exists meeting_minutes_ocr_confidence_range,
  add constraint meeting_minutes_ocr_confidence_range
    check (ocr_confidence is null or (ocr_confidence >= 0 and ocr_confidence <= 1)),
  drop constraint if exists meeting_minutes_ocr_warnings_array,
  add constraint meeting_minutes_ocr_warnings_array
    check (jsonb_typeof(ocr_warnings) = 'array');

create index if not exists meeting_minutes_zone_idx
  on public.meeting_minutes(project_id, zone_id, meeting_date desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'meeting-pv-sources',
  'meeting-pv-sources',
  false,
  26214400,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "authenticated meeting pv sources select" on storage.objects;
create policy "authenticated meeting pv sources select"
on storage.objects for select to authenticated
using (bucket_id = 'meeting-pv-sources');

drop policy if exists "authenticated meeting pv sources insert" on storage.objects;
create policy "authenticated meeting pv sources insert"
on storage.objects for insert to authenticated
with check (bucket_id = 'meeting-pv-sources');

drop policy if exists "authenticated meeting pv sources update" on storage.objects;
create policy "authenticated meeting pv sources update"
on storage.objects for update to authenticated
using (bucket_id = 'meeting-pv-sources')
with check (bucket_id = 'meeting-pv-sources');

drop policy if exists "authenticated meeting pv sources delete" on storage.objects;
create policy "authenticated meeting pv sources delete"
on storage.objects for delete to authenticated
using (bucket_id = 'meeting-pv-sources');

notify pgrst, 'reload schema';
