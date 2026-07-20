create extension if not exists pgcrypto;

create table if not exists public.zones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  code text not null,
  name text not null,
  pk_start text,
  pk_end text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(project_id, code)
);

create table if not exists public.phases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  zone_id uuid not null references public.zones(id) on delete cascade,
  code text not null,
  name text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(zone_id, code)
);

create table if not exists public.work_packages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  sort_order integer not null default 0,
  active boolean not null default true,
  user_configurable boolean not null default true,
  created_at timestamptz not null default now(),
  unique(project_id, code)
);

create table if not exists public.work_package_items (
  id uuid primary key default gen_random_uuid(),
  work_package_id uuid not null references public.work_packages(id) on delete cascade,
  code text,
  name text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.activities add column if not exists zone_id uuid references public.zones(id) on delete set null;
alter table public.activities add column if not exists phase_id uuid references public.phases(id) on delete set null;
alter table public.activities add column if not exists work_package_id uuid references public.work_packages(id) on delete set null;
alter table public.activities add column if not exists work_package_item_id uuid references public.work_package_items(id) on delete set null;
alter table public.activities add column if not exists pk_start text;
alter table public.activities add column if not exists pk_end text;

alter table public.tasks add column if not exists zone_id uuid references public.zones(id) on delete set null;
alter table public.tasks add column if not exists phase_id uuid references public.phases(id) on delete set null;
alter table public.tasks add column if not exists work_package_id uuid references public.work_packages(id) on delete set null;

create table if not exists public.quality_tools (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  code text not null,
  name text not null,
  category text,
  manufacturer text,
  serial_number text,
  location text,
  responsible text,
  condition text not null default 'serviceable' check(condition in ('serviceable','maintenance','out_of_service')),
  calibration_required boolean not null default false,
  last_calibration_date date,
  next_calibration_date date,
  certificate_reference text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, code)
);

create table if not exists public.quality_4m (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  activity_id uuid not null references public.activities(id) on delete cascade,
  man_status text not null default 'pending',
  machine_status text not null default 'pending',
  method_status text not null default 'pending',
  material_status text not null default 'pending',
  man_notes text,
  machine_notes text,
  method_notes text,
  material_notes text,
  updated_at timestamptz not null default now(),
  unique(activity_id)
);

create table if not exists public.quality_ncr (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  activity_id uuid references public.activities(id) on delete set null,
  zone_id uuid references public.zones(id) on delete set null,
  phase_id uuid references public.phases(id) on delete set null,
  reference text not null,
  title text not null,
  description text,
  root_cause text,
  corrective_action text,
  owner text,
  due_date date,
  status text not null default 'open' check(status in ('open','analysis','corrective_action','verification','closed')),
  severity text not null default 'minor' check(severity in ('minor','major','critical')),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  unique(project_id, reference)
);

create table if not exists public.quality_checklists (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  activity_id uuid references public.activities(id) on delete cascade,
  title text not null,
  checklist_type text,
  completed_items integer not null default 0,
  total_items integer not null default 0,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

create index if not exists zones_project_idx on public.zones(project_id);
create index if not exists phases_zone_idx on public.phases(zone_id);
create index if not exists work_packages_project_idx on public.work_packages(project_id);
create index if not exists quality_tools_project_idx on public.quality_tools(project_id);
create index if not exists quality_tools_next_cal_idx on public.quality_tools(next_calibration_date);
create index if not exists quality_ncr_project_idx on public.quality_ncr(project_id);

create or replace function public.opc_set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists quality_tools_set_updated_at on public.quality_tools;
create trigger quality_tools_set_updated_at before update on public.quality_tools for each row execute function public.opc_set_updated_at();

alter table public.zones enable row level security;
alter table public.phases enable row level security;
alter table public.work_packages enable row level security;
alter table public.work_package_items enable row level security;
alter table public.quality_tools enable row level security;
alter table public.quality_4m enable row level security;
alter table public.quality_ncr enable row level security;
alter table public.quality_checklists enable row level security;

do $$ declare t text; begin
  foreach t in array array['zones','phases','work_packages','work_package_items','quality_tools','quality_4m','quality_ncr','quality_checklists'] loop
    execute format('drop policy if exists "authenticated manage %s" on public.%I', t, t);
    execute format('create policy "authenticated manage %s" on public.%I for all to authenticated using (true) with check (true)', t, t);
  end loop;
end $$;

with p as (select id from public.projects where code='PDD' limit 1)
insert into public.zones(project_id,code,name,sort_order)
select p.id,v.code,v.name,v.ord from p cross join (values
('Z1','Zone 1',1),('Z2','Zone 2',2),('Z3','Zone 3',3),('Z4','Zone 4',4)
) v(code,name,ord) on conflict(project_id,code) do nothing;

with z as (select z.id,z.project_id from public.zones z join public.projects p on p.id=z.project_id where p.code='PDD')
insert into public.phases(project_id,zone_id,code,name,sort_order)
select z.project_id,z.id,v.code,v.name,v.ord from z cross join (values
('PH1','Phase 1',1),('PH2','Phase 2',2),('PH3','Phase 3',3)
) v(code,name,ord) on conflict(zone_id,code) do nothing;

with p as (select id from public.projects where code='PDD' limit 1)
insert into public.work_packages(project_id,code,name,description,sort_order,user_configurable)
select p.id,v.code,v.name,v.description,v.ord,true from p cross join (values
('GC','Génie civil','Artères de câbles, tranchées, bâtiments, massifs et infrastructures',1),
('CAB','Déroulage de câble','Déroulage, pose, identification et raccordements',2),
('POSTE','Installation équipement poste','Contenu entièrement personnalisable par le projet',3),
('CAMP','Installation équipement campagne','Contenu entièrement personnalisable par le projet',4),
('VTP','VT poste','Vérifications techniques poste',5),
('VTC','VT campagne','Vérifications techniques campagne',6)
) v(code,name,description,ord) on conflict(project_id,code) do nothing;

with wp as (select id,code from public.work_packages wp join public.projects p on p.id=wp.project_id where p.code='PDD')
insert into public.work_package_items(work_package_id,code,name,sort_order)
select wp.id,v.code,v.name,v.ord from wp join (values
('GC','AC','Artère de câble',1),
('GC','TR','Tranchée',2),
('GC','BAT','Construction bâtiment',3),
('GC','MASSIF','Confection massif potence / portique / mât',4),
('GC','STRUCT','Installation structures potence / portique / mât',5),
('CAB','DER','Déroulage',1),
('CAB','RACC','Raccordement',2),
('CAB','ID','Identification',3)
) v(wp_code,code,name,ord) on v.wp_code=wp.code
where not exists(select 1 from public.work_package_items i where i.work_package_id=wp.id and i.code=v.code);
