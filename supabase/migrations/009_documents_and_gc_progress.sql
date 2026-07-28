-- Document classification and extensible GC task progress models.

alter table public.documents
  add column if not exists document_type text not null default 'other'
    check (
      document_type in (
        'plan',
        'procedure',
        'pv',
        'icp',
        'pvi',
        'ndc',
        'other'
      )
    ),
  add column if not exists document_subcategory text,
  add column if not exists execution_status text not null
    default 'not_applicable'
    check (
      execution_status in (
        'not_applicable',
        'pending',
        'approved',
        'rejected'
      )
    );

create index if not exists documents_type_created_idx
  on public.documents(document_type, created_at desc);
create index if not exists documents_reference_created_idx
  on public.documents(reference, created_at desc);

update public.documents
set document_type = case
  when lower(coalesce(category, '')) like '%plan%' then 'plan'
  when lower(coalesce(category, '')) like '%proc%' then 'procedure'
  when lower(coalesce(category, '')) like '%pvi%' then 'pvi'
  when lower(coalesce(category, '')) like '%icp%' then 'icp'
  when lower(coalesce(category, '')) like '%pv%' then 'pv'
  when lower(coalesce(category, '')) like '%calcul%' then 'ndc'
  else document_type
end
where document_type = 'other';

alter table public.tasks
  add column if not exists progress_mode text not null default 'manual'
    check (progress_mode in ('manual', 'quantity', 'building')),
  add column if not exists work_type text not null default 'standard'
    check (
      work_type in (
        'standard',
        'gc_excavation_trench',
        'gc_concrete_trench',
        'gc_building'
      )
    ),
  add column if not exists target_quantity numeric(12,2),
  add column if not exists completed_quantity numeric(12,2) not null default 0,
  add column if not exists progress_unit text not null default '%';

alter table public.tasks
  drop constraint if exists tasks_quantities_check;
alter table public.tasks
  add constraint tasks_quantities_check
  check (
    completed_quantity >= 0
    and (
      target_quantity is null
      or (
        target_quantity > 0
        and completed_quantity <= target_quantity
      )
    )
  );

create table if not exists public.task_building_phases (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  code text not null,
  label text not null,
  weight numeric(5,2) not null default 1 check (weight > 0),
  progress numeric(5,2) not null default 0 check (progress between 0 and 100),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(task_id, code)
);

create index if not exists task_building_phases_task_idx
  on public.task_building_phases(task_id, sort_order);

alter table public.task_building_phases enable row level security;
drop policy if exists "authenticated manage task building phases"
  on public.task_building_phases;
create policy "authenticated manage task building phases"
on public.task_building_phases for all to authenticated
using (true) with check (true);

drop trigger if exists task_building_phases_set_updated_at
  on public.task_building_phases;
create trigger task_building_phases_set_updated_at
before update on public.task_building_phases
for each row execute function public.opc_set_updated_at();

create or replace function public.opc_calculate_quantity_task_progress()
returns trigger
language plpgsql
as $$
begin
  if new.progress_mode = 'quantity' then
    if new.target_quantity is null or new.target_quantity <= 0 then
      new.progress := 0;
    else
      new.progress := round(
        least(100, greatest(0, new.completed_quantity / new.target_quantity * 100)),
        2
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_calculate_quantity_progress on public.tasks;
create trigger tasks_calculate_quantity_progress
before insert or update of
  progress_mode,
  target_quantity,
  completed_quantity
on public.tasks
for each row execute function public.opc_calculate_quantity_task_progress();

create or replace function public.opc_initialize_building_phases()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.progress_mode = 'building' and new.work_type = 'gc_building' then
    insert into public.task_building_phases(
      task_id,
      code,
      label,
      weight,
      sort_order
    )
    values
      (new.id, 'implantation', 'Implantation et préparation', 5, 10),
      (new.id, 'terrassement', 'Terrassement', 10, 20),
      (new.id, 'fondations', 'Fondations', 15, 30),
      (new.id, 'structure', 'Structure béton / élévation', 25, 40),
      (new.id, 'maconnerie', 'Maçonnerie et cloisons', 15, 50),
      (new.id, 'toiture', 'Toiture et étanchéité', 10, 60),
      (new.id, 'second_oeuvre', 'Second œuvre et réseaux', 10, 70),
      (new.id, 'finitions', 'Équipements, finitions et réception', 10, 80)
    on conflict(task_id, code) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_initialize_building_phases on public.tasks;
create trigger tasks_initialize_building_phases
after insert or update of progress_mode, work_type
on public.tasks
for each row execute function public.opc_initialize_building_phases();

create or replace function public.opc_sync_building_task_progress()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_task_id uuid;
  calculated_progress numeric(5,2);
begin
  target_task_id := coalesce(new.task_id, old.task_id);
  select coalesce(
    round(sum(progress * weight) / nullif(sum(weight), 0), 2),
    0
  )
  into calculated_progress
  from public.task_building_phases
  where task_id = target_task_id;

  update public.tasks
  set progress = calculated_progress,
      status = case
        when calculated_progress >= 100 then 'done'
        when calculated_progress > 0 and status <> 'blocked' then 'in_progress'
        else status
      end
  where id = target_task_id
    and progress_mode = 'building';

  return coalesce(new, old);
end;
$$;

drop trigger if exists task_building_phases_sync_task
  on public.task_building_phases;
create trigger task_building_phases_sync_task
after insert or update of progress, weight or delete
on public.task_building_phases
for each row execute function public.opc_sync_building_task_progress();

-- Ensure the activity dates, status and progress are entirely task-driven.
do $$
declare
  activity_record record;
begin
  for activity_record in
    select distinct activity_id
    from public.tasks
    where activity_id is not null
  loop
    update public.activities activity
    set
      start_date = summary.min_start,
      finish_date = summary.max_finish,
      progress = summary.average_progress,
      status = case
        when summary.task_count > 0
          and summary.completed_count = summary.task_count then 'completed'
        when summary.blocked_count > 0 then 'blocked'
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
      where activity_id = activity_record.activity_id
    ) summary
    where activity.id = activity_record.activity_id;
  end loop;
end $$;

notify pgrst, 'reload schema';
