-- Versioned Excel register used by Documents > Suivi des procédures.

create table if not exists public.procedure_register_imports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  file_name text not null,
  storage_path text,
  sheet_name text not null,
  headers jsonb not null check (jsonb_typeof(headers) = 'array'),
  rows jsonb not null check (jsonb_typeof(rows) = 'array'),
  row_count integer not null default 0 check (row_count >= 0),
  change_summary jsonb not null default '{}'::jsonb,
  imported_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists procedure_register_imports_project_created_idx
  on public.procedure_register_imports(project_id, created_at desc);

alter table public.procedure_register_imports enable row level security;

drop policy if exists "authenticated manage procedure register imports"
  on public.procedure_register_imports;
create policy "authenticated manage procedure register imports"
on public.procedure_register_imports
for all
to authenticated
using (true)
with check (true);

insert into storage.buckets (id, name, public, file_size_limit)
values (
  'procedure-registers',
  'procedure-registers',
  false,
  10485760
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

drop policy if exists "authenticated read procedure registers"
  on storage.objects;
create policy "authenticated read procedure registers"
on storage.objects
for select
to authenticated
using (bucket_id = 'procedure-registers');

drop policy if exists "authenticated upload procedure registers"
  on storage.objects;
create policy "authenticated upload procedure registers"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'procedure-registers');

drop policy if exists "authenticated update procedure registers"
  on storage.objects;
create policy "authenticated update procedure registers"
on storage.objects
for update
to authenticated
using (bucket_id = 'procedure-registers')
with check (bucket_id = 'procedure-registers');

drop policy if exists "authenticated delete procedure registers"
  on storage.objects;
create policy "authenticated delete procedure registers"
on storage.objects
for delete
to authenticated
using (bucket_id = 'procedure-registers');

notify pgrst, 'reload schema';
