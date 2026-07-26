-- OPC OS V2 - Schéma Supabase
create extension if not exists "pgcrypto";

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique,
  description text,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists zones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  code text,
  description text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique(project_id, name)
);

create table if not exists phases (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references zones(id) on delete cascade,
  name text not null,
  code text,
  position integer not null default 0,
  start_date date,
  end_date date,
  progress numeric(5,2) not null default 0 check (progress between 0 and 100),
  created_at timestamptz not null default now(),
  unique(zone_id, name)
);

create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  phase_id uuid not null references phases(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'planned',
  start_date date,
  end_date date,
  progress numeric(5,2) not null default 0 check (progress between 0 and 100),
  company text,
  created_at timestamptz not null default now()
);

create table if not exists document_categories (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  name text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  zone_id uuid references zones(id) on delete set null,
  phase_id uuid references phases(id) on delete set null,
  activity_id uuid references activities(id) on delete set null,
  category_id uuid references document_categories(id) on delete set null,
  name text not null,
  revision text,
  status text not null default 'draft',
  company text,
  file_path text,
  comments text,
  document_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists material_categories (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  parent_id uuid references material_categories(id) on delete cascade,
  name text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists materials (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  zone_id uuid references zones(id) on delete set null,
  phase_id uuid references phases(id) on delete set null,
  activity_id uuid references activities(id) on delete set null,
  category_id uuid references material_categories(id) on delete set null,
  name text not null,
  reference text,
  serial_number text,
  quantity numeric not null default 1,
  unit text not null default 'u',
  status text not null default 'planned',
  supplier text,
  comments text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  zone_id uuid references zones(id) on delete set null,
  phase_id uuid references phases(id) on delete set null,
  activity_id uuid references activities(id) on delete set null,
  material_id uuid references materials(id) on delete set null,
  document_id uuid references documents(id) on delete set null,
  title text,
  file_path text not null,
  taken_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists reservations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  zone_id uuid references zones(id) on delete set null,
  phase_id uuid references phases(id) on delete set null,
  activity_id uuid references activities(id) on delete set null,
  material_id uuid references materials(id) on delete set null,
  document_id uuid references documents(id) on delete set null,
  title text not null,
  description text,
  severity text not null default 'medium',
  status text not null default 'open',
  due_date date,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists object_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  source_type text not null,
  source_id uuid not null,
  target_type text not null,
  target_id uuid not null,
  relation_type text not null default 'related',
  created_at timestamptz not null default now(),
  unique(source_type, source_id, target_type, target_id, relation_type)
);

create index if not exists idx_zones_project on zones(project_id);
create index if not exists idx_phases_zone on phases(zone_id);
create index if not exists idx_activities_phase on activities(phase_id);
create index if not exists idx_documents_relations on documents(project_id, zone_id, phase_id, activity_id);
create index if not exists idx_materials_relations on materials(project_id, zone_id, phase_id, activity_id);
create index if not exists idx_object_links_source on object_links(source_type, source_id);
create index if not exists idx_object_links_target on object_links(target_type, target_id);

alter table projects enable row level security;
alter table zones enable row level security;
alter table phases enable row level security;
alter table activities enable row level security;
alter table documents enable row level security;
alter table document_categories enable row level security;
alter table materials enable row level security;
alter table material_categories enable row level security;
alter table photos enable row level security;
alter table reservations enable row level security;
alter table object_links enable row level security;

-- Politique simple pour utilisateurs authentifiés.
do $$
declare
  t text;
begin
  foreach t in array array[
    'projects','zones','phases','activities','documents','document_categories',
    'materials','material_categories','photos','reservations','object_links'
  ]
  loop
    execute format('drop policy if exists "authenticated full access" on %I', t);
    execute format(
      'create policy "authenticated full access" on %I for all to authenticated using (true) with check (true)',
      t
    );
  end loop;
end $$;

insert into document_categories (name, is_system)
select name, true
from unnest(array[
  'Plans techniques',
  'Plans de pose',
  'Plans de déroulage',
  'TC Plans',
  'Plans d''aménagement bâtiment',
  'PV',
  'PVI',
  'Certificats de conformité',
  'ICP',
  'NDC',
  'Procédures'
]) as name
where not exists (
  select 1 from document_categories dc where dc.name = name and dc.project_id is null
);

insert into material_categories (name, is_system)
select name, true
from unnest(array[
  'Câbles',
  'Équipements Campagne',
  'Équipements Poste',
  'Structures',
  'Consommables'
]) as name
where not exists (
  select 1 from material_categories mc where mc.name = name and mc.project_id is null
);
