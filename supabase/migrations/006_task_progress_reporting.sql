alter table public.tasks
  add column if not exists progress numeric(5,2) not null default 0
    check (progress between 0 and 100);

create table if not exists public.task_progress_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  update_date date not null default current_date,
  progress numeric(5,2) not null check (progress between 0 and 100),
  work_done text,
  ongoing_work text,
  blockers text,
  next_steps text,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.task_progress_photos (
  id uuid primary key default gen_random_uuid(),
  update_id uuid not null references public.task_progress_updates(id) on delete cascade,
  file_path text not null,
  caption text,
  created_at timestamptz not null default now()
);

create index if not exists task_progress_updates_task_date_idx
  on public.task_progress_updates(task_id, update_date desc);
create index if not exists task_progress_updates_project_date_idx
  on public.task_progress_updates(project_id, update_date desc);
create index if not exists task_progress_photos_update_idx
  on public.task_progress_photos(update_id);

alter table public.task_progress_updates enable row level security;
alter table public.task_progress_photos enable row level security;

drop policy if exists "authenticated manage task progress"
  on public.task_progress_updates;
create policy "authenticated manage task progress"
on public.task_progress_updates for all to authenticated
using (true) with check (true);

drop policy if exists "authenticated manage task progress photos"
  on public.task_progress_photos;
create policy "authenticated manage task progress photos"
on public.task_progress_photos for all to authenticated
using (true) with check (true);

drop trigger if exists task_progress_updates_set_updated_at
  on public.task_progress_updates;
create trigger task_progress_updates_set_updated_at
before update on public.task_progress_updates
for each row execute function public.opc_set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'task-progress',
  'task-progress',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "authenticated task progress storage select"
  on storage.objects;
create policy "authenticated task progress storage select"
on storage.objects for select to authenticated
using (bucket_id = 'task-progress');

drop policy if exists "authenticated task progress storage insert"
  on storage.objects;
create policy "authenticated task progress storage insert"
on storage.objects for insert to authenticated
with check (bucket_id = 'task-progress');

drop policy if exists "authenticated task progress storage update"
  on storage.objects;
create policy "authenticated task progress storage update"
on storage.objects for update to authenticated
using (bucket_id = 'task-progress')
with check (bucket_id = 'task-progress');

drop policy if exists "authenticated task progress storage delete"
  on storage.objects;
create policy "authenticated task progress storage delete"
on storage.objects for delete to authenticated
using (bucket_id = 'task-progress');

with project as (
  select id from public.projects where code = 'PDD' limit 1
),
people(employee_code, full_name, role, profile, sort_order) as (
  values
    ('AVZ-001','Sara','Owner','Direction',1),
    ('AVZ-002','Kamal','Directeur','Direction',2),
    ('AVZ-003','Imad','Directeur des opérations','Operations',3),
    ('AVZ-004','Driss','Manager Operations','Operations',4),
    ('AVZ-005','Soufiane Ait Taleb','Chef de chantier','Chantier',5),
    ('AVZ-006','Soufiane Boukerma','Chef de chantier','Chantier',6),
    ('AVZ-007','Mohammed Chadmi','Chef de chantier','Chantier',7),
    ('AVZ-008','Errayess','Chef de chantier','Chantier',8),
    ('AVZ-009','Ilham','OPC Project','OPC',9),
    ('AVZ-010','Mouhcine','EHS Supervisor','EHS',10)
)
insert into public.collaborators(
  project_id, employee_code, full_name, company, role, profile, sort_order
)
select project.id, people.employee_code, people.full_name, 'AVANZIT',
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
    ('AVZ-002','AVZ-001'),
    ('AVZ-003','AVZ-002'),
    ('AVZ-004','AVZ-003'),
    ('AVZ-005','AVZ-004'),
    ('AVZ-006','AVZ-004'),
    ('AVZ-007','AVZ-004'),
    ('AVZ-008','AVZ-004'),
    ('AVZ-009','AVZ-003'),
    ('AVZ-010','AVZ-003')
)
update public.collaborators as child
set parent_id = parent.id
from relations
join public.collaborators as parent
  on parent.employee_code = relations.parent_code
  and parent.project_id = (select id from project)
where child.employee_code = relations.child_code
  and child.project_id = (select id from project);

create or replace function public.opc_sync_activity_from_tasks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_activity_id uuid;
begin
  target_activity_id := coalesce(new.activity_id, old.activity_id);
  if target_activity_id is null then
    return coalesce(new, old);
  end if;

  update public.activities
  set
    start_date = summary.min_start,
    finish_date = summary.max_finish,
    progress = summary.average_progress,
    status = case
      when summary.task_count > 0 and summary.completed_count = summary.task_count
        then 'completed'
      when summary.blocked_count > 0
        then 'blocked'
      when summary.started_count > 0 or summary.average_progress > 0
        then 'in_progress'
      else 'not_started'
    end
  from (
    select
      min(start_date) as min_start,
      max(due_date) as max_finish,
      coalesce(round(avg(progress), 2), 0) as average_progress,
      count(*) as task_count,
      count(*) filter (where status = 'done') as completed_count,
      count(*) filter (where status = 'blocked') as blocked_count,
      count(*) filter (where status = 'in_progress') as started_count
    from public.tasks
    where activity_id = target_activity_id
  ) as summary
  where activities.id = target_activity_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists tasks_sync_parent_activity on public.tasks;
create trigger tasks_sync_parent_activity
after insert or update of activity_id, start_date, due_date, progress, status
or delete on public.tasks
for each row execute function public.opc_sync_activity_from_tasks();
