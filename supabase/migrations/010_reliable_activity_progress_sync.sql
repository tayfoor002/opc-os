-- Keep every parent activity strictly synchronized with its child tasks.

create or replace function public.opc_recalculate_activity(
  target_activity_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_activity_id is null then
    return;
  end if;

  update public.activities
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
    where activity_id = target_activity_id
  ) as summary
  where activities.id = target_activity_id;
end;
$$;

create or replace function public.opc_sync_activity_from_tasks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.opc_recalculate_activity(old.activity_id);
    return old;
  end if;

  perform public.opc_recalculate_activity(new.activity_id);

  if tg_op = 'UPDATE' and old.activity_id is distinct from new.activity_id then
    perform public.opc_recalculate_activity(old.activity_id);
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_sync_parent_activity on public.tasks;
create trigger tasks_sync_parent_activity
after insert or update of activity_id, start_date, due_date, progress, status
or delete on public.tasks
for each row execute function public.opc_sync_activity_from_tasks();

-- Repair existing values, including activities that currently have no tasks.
do $$
declare
  activity_record record;
begin
  for activity_record in select id from public.activities loop
    perform public.opc_recalculate_activity(activity_record.id);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
