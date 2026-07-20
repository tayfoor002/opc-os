create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  activity_id uuid references public.activities(id) on delete set null,
  title text not null,
  description text,
  owner text,
  due_date date,
  priority text not null default 'medium' check (priority in ('low','medium','high','critical')),
  status text not null default 'todo' check (status in ('todo','in_progress','blocked','done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_project_id_idx on public.tasks(project_id);
create index if not exists tasks_activity_id_idx on public.tasks(activity_id);
create index if not exists tasks_due_date_idx on public.tasks(due_date);
create index if not exists tasks_status_idx on public.tasks(status);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

alter table public.tasks enable row level security;
drop policy if exists "authenticated manage tasks" on public.tasks;
create policy "authenticated manage tasks" on public.tasks
for all to authenticated using (true) with check (true);

alter publication supabase_realtime add table public.tasks;
