alter table public.tasks
  add column if not exists start_date date;

update public.tasks
set start_date = due_date
where start_date is null
  and due_date is not null;

create index if not exists tasks_start_date_idx
  on public.tasks(start_date);

alter table public.tasks
  drop constraint if exists tasks_date_range_check;

alter table public.tasks
  add constraint tasks_date_range_check
  check (
    start_date is null
    or due_date is null
    or start_date <= due_date
  );

create or replace function public.sync_activity_dates_from_tasks(
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
    start_date = (
      select min(coalesce(task.start_date, task.due_date))
      from public.tasks as task
      where task.activity_id = target_activity_id
    ),
    finish_date = (
      select max(coalesce(task.due_date, task.start_date))
      from public.tasks as task
      where task.activity_id = target_activity_id
    )
  where id = target_activity_id;
end;
$$;

create or replace function public.sync_task_activity_dates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.sync_activity_dates_from_tasks(old.activity_id);
    return old;
  end if;

  perform public.sync_activity_dates_from_tasks(new.activity_id);

  if tg_op = 'UPDATE' and old.activity_id is distinct from new.activity_id then
    perform public.sync_activity_dates_from_tasks(old.activity_id);
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_sync_activity_dates on public.tasks;

create trigger tasks_sync_activity_dates
after insert or update or delete
on public.tasks
for each row
execute function public.sync_task_activity_dates();

do $$
declare
  activity_record record;
begin
  for activity_record in
    select distinct activity_id
    from public.tasks
    where activity_id is not null
  loop
    perform public.sync_activity_dates_from_tasks(activity_record.activity_id);
  end loop;
end $$;
