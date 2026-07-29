-- Professional meeting minutes with archived participant and agenda snapshots.

create table if not exists public.meeting_minutes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  meeting_date date not null,
  start_time time,
  end_time time,
  location text,
  meeting_type text not null default 'coordination'
    check (meeting_type in ('coordination', 'site', 'technical', 'safety', 'client', 'other')),
  objective text,
  introduction text,
  participants jsonb not null default '[]'::jsonb,
  agenda_points jsonb not null default '[]'::jsonb,
  general_notes text,
  next_meeting_date date,
  status text not null default 'draft'
    check (status in ('draft', 'finalized')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meeting_minutes_participants_array
    check (jsonb_typeof(participants) = 'array'),
  constraint meeting_minutes_agenda_points_array
    check (jsonb_typeof(agenda_points) = 'array'),
  constraint meeting_minutes_time_order
    check (start_time is null or end_time is null or end_time > start_time)
);

create index if not exists meeting_minutes_project_date_idx
  on public.meeting_minutes(project_id, meeting_date desc, created_at desc);
create index if not exists meeting_minutes_status_idx
  on public.meeting_minutes(project_id, status);

alter table public.meeting_minutes enable row level security;

drop policy if exists "authenticated manage meeting minutes"
  on public.meeting_minutes;
create policy "authenticated manage meeting minutes"
on public.meeting_minutes for all to authenticated
using (true) with check (true);

drop trigger if exists meeting_minutes_set_updated_at
  on public.meeting_minutes;
create trigger meeting_minutes_set_updated_at
before update on public.meeting_minutes
for each row execute function public.opc_set_updated_at();

notify pgrst, 'reload schema';
