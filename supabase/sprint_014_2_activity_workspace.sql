-- OPC OS · Sprint 14.2 · Activity Workspace
-- Connecte Materials, Documents et Avancement à la table activities.

create table if not exists public.activity_materials (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  activity_id uuid not null references public.activities(id) on delete cascade,
  name text not null,
  quantity numeric(14,3) not null default 1,
  unit text not null default 'u',
  supplier text,
  delivery_status text not null default 'planned'
    check (delivery_status in ('planned','ordered','delivered','consumed')),
  planned_delivery_date date,
  actual_delivery_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  activity_id uuid not null references public.activities(id) on delete cascade,
  name text not null,
  document_type text not null default 'link',
  url text,
  storage_path text,
  version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_progress_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  activity_id uuid not null references public.activities(id) on delete cascade,
  progress numeric(5,2) not null check (progress >= 0 and progress <= 100),
  note text,
  update_date date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists activity_materials_activity_id_idx on public.activity_materials(activity_id);
create index if not exists activity_documents_activity_id_idx on public.activity_documents(activity_id);
create index if not exists activity_progress_updates_activity_id_idx on public.activity_progress_updates(activity_id);
create index if not exists activity_progress_updates_date_idx on public.activity_progress_updates(update_date desc);

create or replace function public.opc_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists activity_materials_set_updated_at on public.activity_materials;
create trigger activity_materials_set_updated_at
before update on public.activity_materials
for each row execute function public.opc_set_updated_at();

drop trigger if exists activity_documents_set_updated_at on public.activity_documents;
create trigger activity_documents_set_updated_at
before update on public.activity_documents
for each row execute function public.opc_set_updated_at();

alter table public.activity_materials enable row level security;
alter table public.activity_documents enable row level security;
alter table public.activity_progress_updates enable row level security;

drop policy if exists "authenticated manage activity materials" on public.activity_materials;
create policy "authenticated manage activity materials" on public.activity_materials
for all to authenticated using (true) with check (true);

drop policy if exists "authenticated manage activity documents" on public.activity_documents;
create policy "authenticated manage activity documents" on public.activity_documents
for all to authenticated using (true) with check (true);

drop policy if exists "authenticated manage activity progress updates" on public.activity_progress_updates;
create policy "authenticated manage activity progress updates" on public.activity_progress_updates
for all to authenticated using (true) with check (true);

do $$
begin
  begin
    alter publication supabase_realtime add table public.activity_materials;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.activity_documents;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.activity_progress_updates;
  exception when duplicate_object then null;
  end;
end $$;
