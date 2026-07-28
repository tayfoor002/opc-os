create table if not exists public.collaborators (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  employee_code text not null,
  full_name text not null,
  company text not null check (company in ('ALSTOM', 'AVANZIT')),
  role text not null,
  profile text,
  phone text,
  email text,
  parent_id uuid references public.collaborators(id) on delete set null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, employee_code)
);

create table if not exists public.zone_elements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  zone_id uuid not null references public.zones(id) on delete cascade,
  code text not null,
  name text not null,
  element_type text not null default 'site'
    check (element_type in ('site', 'bal')),
  from_element text,
  to_element text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(zone_id, code)
);

create table if not exists public.phase_zone_elements (
  phase_id uuid not null references public.phases(id) on delete cascade,
  zone_element_id uuid not null references public.zone_elements(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (phase_id, zone_element_id)
);

alter table public.tasks
  add column if not exists alstom_supervisor_id uuid
    references public.collaborators(id) on delete set null,
  add column if not exists avanzit_site_manager_id uuid
    references public.collaborators(id) on delete set null,
  add column if not exists zone_element_id uuid
    references public.zone_elements(id) on delete set null;

alter table public.activities
  add column if not exists alstom_supervisor_id uuid
    references public.collaborators(id) on delete set null,
  add column if not exists avanzit_site_manager_id uuid
    references public.collaborators(id) on delete set null,
  add column if not exists zone_element_id uuid
    references public.zone_elements(id) on delete set null;

create index if not exists collaborators_project_company_idx
  on public.collaborators(project_id, company, active);
create index if not exists collaborators_parent_idx
  on public.collaborators(parent_id);
create index if not exists zone_elements_zone_idx
  on public.zone_elements(zone_id, sort_order);
create index if not exists tasks_supervision_idx
  on public.tasks(alstom_supervisor_id, avanzit_site_manager_id);
create index if not exists activities_supervision_idx
  on public.activities(alstom_supervisor_id, avanzit_site_manager_id);

alter table public.collaborators enable row level security;
alter table public.zone_elements enable row level security;
alter table public.phase_zone_elements enable row level security;

drop policy if exists "authenticated manage collaborators"
  on public.collaborators;
create policy "authenticated manage collaborators"
on public.collaborators for all to authenticated
using (true) with check (true);

drop policy if exists "authenticated manage zone elements"
  on public.zone_elements;
create policy "authenticated manage zone elements"
on public.zone_elements for all to authenticated
using (true) with check (true);

drop policy if exists "authenticated manage phase zone elements"
  on public.phase_zone_elements;
create policy "authenticated manage phase zone elements"
on public.phase_zone_elements for all to authenticated
using (true) with check (true);

drop trigger if exists collaborators_set_updated_at on public.collaborators;
create trigger collaborators_set_updated_at
before update on public.collaborators
for each row execute function public.opc_set_updated_at();

with project as (
  select id from public.projects where code = 'PDD' limit 1
)
update public.zones
set
  name = case code
    when 'Z1' then 'Zone Casa'
    when 'Z2' then 'Zone Rabat & Benslimane'
    when 'Z3' then 'Zone Casa - Settat'
    else name
  end,
  active = case when code = 'Z4' then false else active end
where project_id = (select id from project)
  and code in ('Z1', 'Z2', 'Z3', 'Z4');

with project as (
  select id from public.projects where code = 'PDD' limit 1
)
insert into public.zones(project_id, code, name, sort_order, active)
select project.id, zone.code, zone.name, zone.sort_order, true
from project
cross join (values
  ('Z1', 'Zone Casa', 1),
  ('Z2', 'Zone Rabat & Benslimane', 2),
  ('Z3', 'Zone Casa - Settat', 3)
) as zone(code, name, sort_order)
on conflict(project_id, code) do update
set name = excluded.name,
    sort_order = excluded.sort_order,
    active = true;

with target_zones as (
  select zone.id, zone.project_id, zone.code
  from public.zones as zone
  join public.projects as project on project.id = zone.project_id
  where project.code = 'PDD' and zone.code in ('Z1', 'Z2', 'Z3')
)
insert into public.phases(project_id, zone_id, code, name, sort_order, active)
select target_zones.project_id, target_zones.id, phase.code, phase.name,
  phase.sort_order, true
from target_zones
cross join (values
  ('PH1', 'Phase 1', 1),
  ('PH2', 'Phase 2', 2),
  ('PH3', 'Phase 3', 3)
) as phase(code, name, sort_order)
on conflict(zone_id, code) do update
set name = excluded.name,
    sort_order = excluded.sort_order,
    active = true;

with target_zones as (
  select zone.id, zone.project_id, zone.code
  from public.zones as zone
  join public.projects as project on project.id = zone.project_id
  where project.code = 'PDD' and zone.code in ('Z1', 'Z2', 'Z3')
),
elements(zone_code, code, name, element_type, from_element, to_element, sort_order) as (
  values
    ('Z1','CASA-PORT','Casa-Port','site',null,null,1),
    ('Z1','BAL-CP-CV','BAL Casa-Port - Casa Voyageurs','bal','Casa-Port','Casa Voyageurs',2),
    ('Z1','CASA-VOY','Casa Voyageurs','site',null,null,3),
    ('Z1','BAL-CV-AS','BAL Casa Voyageurs - Aïn Sebaâ','bal','Casa Voyageurs','Aïn Sebaâ',4),
    ('Z1','AIN-SEBAA','Aïn Sebaâ','site',null,null,5),
    ('Z1','BAL-AS-TR','BAL Aïn Sebaâ - Triangle','bal','Aïn Sebaâ','Triangle',6),
    ('Z1','TRIANGLE','Triangle','site',null,null,7),
    ('Z2','ZENATA','Zenata','site',null,null,1),
    ('Z2','BAL-ZE-MO','BAL Zenata - Mohammedia','bal','Zenata','Mohammedia',2),
    ('Z2','MOHAMMEDIA','Mohammedia','site',null,null,3),
    ('Z2','BAL-MO-BO','BAL Mohammedia - Bouznika','bal','Mohammedia','Bouznika',4),
    ('Z2','BOUZNIKA','Bouznika','site',null,null,5),
    ('Z2','BAL-BO-SK','BAL Bouznika - Skhirat','bal','Bouznika','Skhirat',6),
    ('Z2','SKHIRAT','Skhirat','site',null,null,7),
    ('Z2','BAL-SK-TE','BAL Skhirat - Témara','bal','Skhirat','Témara',8),
    ('Z2','TEMARA','Témara','site',null,null,9),
    ('Z2','BAL-TE-RA','BAL Témara - Rabat','bal','Témara','Rabat',10),
    ('Z2','RABAT','Rabat','site',null,null,11),
    ('Z3','BOUSKOURA','Bouskoura','site',null,null,1),
    ('Z3','BAL-BO-SE','BAL Bouskoura - Settat','bal','Bouskoura','Settat',2),
    ('Z3','SETTAT','Settat','site',null,null,3)
)
insert into public.zone_elements(
  project_id, zone_id, code, name, element_type,
  from_element, to_element, sort_order, active
)
select target_zones.project_id, target_zones.id, elements.code,
  elements.name, elements.element_type, elements.from_element,
  elements.to_element, elements.sort_order, true
from elements
join target_zones on target_zones.code = elements.zone_code
on conflict(zone_id, code) do update
set name = excluded.name,
    element_type = excluded.element_type,
    from_element = excluded.from_element,
    to_element = excluded.to_element,
    sort_order = excluded.sort_order,
    active = true;

insert into public.phase_zone_elements(phase_id, zone_element_id)
select phase.id, element.id
from public.phases as phase
join public.zone_elements as element on element.zone_id = phase.zone_id
join public.projects as project on project.id = phase.project_id
where project.code = 'PDD'
  and phase.active
  and element.active
on conflict do nothing;

with project as (
  select id from public.projects where code = 'PDD' limit 1
),
people(employee_code, full_name, role, profile, sort_order) as (
  values
    ('ALS-001','Yves BOSCHEREL','Project Signal Director','Director',1),
    ('ALS-002','Hmidani Othman','Project Operations Manager','Operations Manager',2),
    ('ALS-003','Ayoub Rachidy','OPC Travaux','OPC',3),
    ('ALS-004','Firdaus','Material Planning Leader','Materials',4),
    ('ALS-005','Hanan','Civil Works Engineer','Civil Works',5),
    ('ALS-006','EL KOTB Essam','Team Leader - Vérification Technique','VT',6),
    ('ALS-007','Ezzayoud El Mehdi','Logistics Manager','Logistics',7),
    ('ALS-008','Nini Saida','Assistant Project','Project Support',8),
    ('ALS-009','Sefiani Youssef','SIG Installation Campaign Leader','Installation',9),
    ('ALS-010','Tijani Yassine','SIG Installation Team Leader','Installation',10),
    ('ALS-011','EL OUARDIGHI Adil','Team Leader SIG','Installation',11),
    ('ALS-012','Adarre Ahmed','SIG Installation','Installation',12),
    ('ALS-013','Qadi Soufiane','SIG Installation','Installation',13),
    ('ALS-014','Younes Boutaroua','OPC Manager','OPC',14)
)
insert into public.collaborators(
  project_id, employee_code, full_name, company, role, profile, sort_order
)
select project.id, people.employee_code, people.full_name, 'ALSTOM',
  people.role, people.profile, people.sort_order
from project cross join people
on conflict(project_id, employee_code) do update
set full_name = excluded.full_name,
    company = excluded.company,
    role = excluded.role,
    profile = excluded.profile,
    sort_order = excluded.sort_order,
    active = true;

with project as (
  select id from public.projects where code = 'PDD' limit 1
),
relations(child_code, parent_code) as (
  values
    ('ALS-002','ALS-001'),
    ('ALS-003','ALS-002'),
    ('ALS-004','ALS-002'),
    ('ALS-005','ALS-002'),
    ('ALS-006','ALS-002'),
    ('ALS-007','ALS-002'),
    ('ALS-008','ALS-002'),
    ('ALS-009','ALS-002'),
    ('ALS-010','ALS-009'),
    ('ALS-011','ALS-009'),
    ('ALS-012','ALS-009'),
    ('ALS-013','ALS-009'),
    ('ALS-014','ALS-001')
)
update public.collaborators as child
set parent_id = parent.id
from relations
join public.collaborators as parent
  on parent.employee_code = relations.parent_code
  and parent.project_id = (select id from project)
where child.employee_code = relations.child_code
  and child.project_id = (select id from project);

update public.tasks
set alstom_supervisor_id = collaborator.id
from public.collaborators as collaborator
where collaborator.employee_code = 'ALS-012'
  and lower(public.tasks.owner) in ('ahmed adar', 'adarre ahmed')
  and public.tasks.project_id = collaborator.project_id;
