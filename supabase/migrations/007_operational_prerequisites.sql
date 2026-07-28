-- Operational prerequisites, personnel authorizations, tools, machines and equipment.
-- Equipment automatic reservation/installation is intentionally deferred.

alter table public.quality_tools
  add column if not exists asset_type text not null default 'tool'
    check (asset_type in ('tool', 'machine')),
  add column if not exists technical_sheet_reference text,
  add column if not exists technical_sheet_valid_until date,
  add column if not exists inspection_date date,
  add column if not exists inspection_valid_until date,
  add column if not exists operator_authorization_required boolean not null default false;

create table if not exists public.collaborator_certifications (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  collaborator_id uuid not null references public.collaborators(id) on delete cascade,
  certification_code text not null,
  certification_name text not null,
  issuer text,
  issued_at date,
  valid_until date,
  document_reference text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(collaborator_id, certification_code)
);

create table if not exists public.project_equipment (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  code text not null,
  name text not null,
  equipment_type text not null default 'material'
    check (equipment_type in ('material', 'equipment')),
  manufacturer text,
  serial_number text,
  quantity numeric(12,2) not null default 1,
  unit text not null default 'u',
  status text not null default 'available'
    check (status in ('available', 'reserved', 'installed', 'out_of_service')),
  location text,
  technical_reference text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, code)
);

create table if not exists public.task_personnel (
  task_id uuid not null references public.tasks(id) on delete cascade,
  collaborator_id uuid not null references public.collaborators(id) on delete cascade,
  assignment_role text,
  created_at timestamptz not null default now(),
  primary key (task_id, collaborator_id)
);

create table if not exists public.task_required_certifications (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  certification_name text not null,
  notes text,
  created_at timestamptz not null default now(),
  unique(task_id, certification_name)
);

create table if not exists public.task_tools (
  task_id uuid not null references public.tasks(id) on delete cascade,
  tool_id uuid not null references public.quality_tools(id) on delete cascade,
  usage_notes text,
  created_at timestamptz not null default now(),
  primary key (task_id, tool_id)
);

create table if not exists public.task_equipment (
  task_id uuid not null references public.tasks(id) on delete cascade,
  equipment_id uuid not null references public.project_equipment(id) on delete cascade,
  quantity numeric(12,2) not null default 1,
  usage_status text not null default 'planned'
    check (usage_status in ('planned', 'used', 'installed')),
  notes text,
  created_at timestamptz not null default now(),
  primary key (task_id, equipment_id)
);

create table if not exists public.task_document_requirements (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  document_id uuid references public.documents(id) on delete set null,
  requirement_type text not null default 'other'
    check (requirement_type in ('plan', 'procedure', 'method', 'permit', 'other')),
  label text not null,
  required boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.task_prerequisite_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  category text not null default 'other'
    check (category in ('personnel', 'document', 'tool', 'machine', 'material', 'safety', 'other')),
  label text not null,
  required boolean not null default true,
  satisfied boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists collaborator_certifications_person_idx
  on public.collaborator_certifications(collaborator_id, valid_until);
create index if not exists project_equipment_project_idx
  on public.project_equipment(project_id, equipment_type, status);
create index if not exists task_personnel_task_idx on public.task_personnel(task_id);
create index if not exists task_tools_task_idx on public.task_tools(task_id);
create index if not exists task_equipment_task_idx on public.task_equipment(task_id);
create index if not exists task_document_requirements_task_idx
  on public.task_document_requirements(task_id);
create index if not exists task_prerequisite_items_task_idx
  on public.task_prerequisite_items(task_id);

alter table public.collaborator_certifications enable row level security;
alter table public.project_equipment enable row level security;
alter table public.task_personnel enable row level security;
alter table public.task_required_certifications enable row level security;
alter table public.task_tools enable row level security;
alter table public.task_equipment enable row level security;
alter table public.task_document_requirements enable row level security;
alter table public.task_prerequisite_items enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'collaborator_certifications',
    'project_equipment',
    'task_personnel',
    'task_required_certifications',
    'task_tools',
    'task_equipment',
    'task_document_requirements',
    'task_prerequisite_items'
  ]
  loop
    execute format(
      'drop policy if exists "authenticated manage %s" on public.%I',
      table_name,
      table_name
    );
    execute format(
      'create policy "authenticated manage %s" on public.%I for all to authenticated using (true) with check (true)',
      table_name,
      table_name
    );
  end loop;
end $$;

drop trigger if exists collaborator_certifications_set_updated_at
  on public.collaborator_certifications;
create trigger collaborator_certifications_set_updated_at
before update on public.collaborator_certifications
for each row execute function public.opc_set_updated_at();

drop trigger if exists project_equipment_set_updated_at
  on public.project_equipment;
create trigger project_equipment_set_updated_at
before update on public.project_equipment
for each row execute function public.opc_set_updated_at();

drop trigger if exists task_prerequisite_items_set_updated_at
  on public.task_prerequisite_items;
create trigger task_prerequisite_items_set_updated_at
before update on public.task_prerequisite_items
for each row execute function public.opc_set_updated_at();

create or replace view public.task_prerequisite_status
with (security_invoker = true)
as
select
  task.id as task_id,
  task.activity_id,
  (
    select count(*) from public.task_required_certifications requirement
    where requirement.task_id = task.id
  ) +
  (
    select count(*) from public.task_document_requirements requirement
    where requirement.task_id = task.id and requirement.required
  ) +
  (
    select count(*) from public.task_tools link where link.task_id = task.id
  ) +
  (
    select count(*) from public.task_prerequisite_items item
    where item.task_id = task.id and item.required
  ) as total_requirements,
  (
    select count(*)
    from public.task_required_certifications requirement
    where requirement.task_id = task.id
      and not exists (
        select 1
        from public.collaborator_certifications certification
        where lower(certification.certification_name) =
              lower(requirement.certification_name)
          and (
            certification.valid_until is null
            or certification.valid_until >= current_date
          )
          and (
            certification.collaborator_id = task.alstom_supervisor_id
            or certification.collaborator_id = task.avanzit_site_manager_id
            or exists (
              select 1
              from public.task_personnel personnel
              where personnel.task_id = task.id
                and personnel.collaborator_id = certification.collaborator_id
            )
          )
      )
  ) as missing_certifications,
  (
    select count(*)
    from public.task_document_requirements requirement
    where requirement.task_id = task.id
      and requirement.required
      and requirement.document_id is null
  ) as missing_documents,
  (
    select count(*)
    from public.task_tools link
    join public.quality_tools tool on tool.id = link.tool_id
    where link.task_id = task.id
      and (
        tool.condition <> 'serviceable'
        or (
          tool.calibration_required
          and (
            tool.next_calibration_date is null
            or tool.next_calibration_date < current_date
          )
        )
        or (
          tool.asset_type = 'machine'
          and (
            tool.technical_sheet_reference is null
            or (
              tool.technical_sheet_valid_until is not null
              and tool.technical_sheet_valid_until < current_date
            )
            or (
              tool.inspection_valid_until is not null
              and tool.inspection_valid_until < current_date
            )
          )
        )
      )
  ) as invalid_tools,
  (
    select count(*)
    from public.task_prerequisite_items item
    where item.task_id = task.id
      and item.required
      and not item.satisfied
  ) as missing_manual_items
from public.tasks task;

grant select on public.task_prerequisite_status to authenticated;
