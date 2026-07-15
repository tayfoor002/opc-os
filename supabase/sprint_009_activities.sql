create extension if not exists pgcrypto;
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(), code text not null unique, name text not null,
  client text, status text not null default 'active', created_at timestamptz not null default now()
);
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
  code text not null, name text not null, zone text, responsible text, start_date date, finish_date date,
  progress numeric(5,2) not null default 0 check (progress between 0 and 100),
  status text not null default 'not_started' check (status in ('not_started','in_progress','blocked','completed')),
  critical boolean not null default false, created_at timestamptz not null default now(), unique(project_id, code)
);
alter table public.projects enable row level security;
alter table public.activities enable row level security;
drop policy if exists "authenticated manage projects" on public.projects;
create policy "authenticated manage projects" on public.projects for all to authenticated using (true) with check (true);
drop policy if exists "authenticated manage activities" on public.activities;
create policy "authenticated manage activities" on public.activities for all to authenticated using (true) with check (true);
insert into public.projects (code, name, client) values ('PDD','PDD','ONCF') on conflict (code) do nothing;
