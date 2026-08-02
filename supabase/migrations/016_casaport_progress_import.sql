-- Import des rapports d'avancement image de la gare Casa-Port.
-- Ajoute des clés stables pour éviter les doublons à chaque nouvel import.

alter table public.activities
  add column if not exists external_progress_key text;

alter table public.tasks
  add column if not exists external_progress_key text,
  add column if not exists progress_source text not null default 'manual',
  add column if not exists last_external_update_at timestamptz;

create unique index if not exists activities_project_external_progress_key_idx
  on public.activities(project_id, external_progress_key);

create unique index if not exists tasks_project_external_progress_key_idx
  on public.tasks(project_id, external_progress_key);

update public.activities
set external_progress_key = 'casaport:' || case code
  when 'CP-01' then 'buildings'
  when 'CP-02' then 'arteries'
  when 'CP-03' then 'massifs'
  when 'CP-04' then 'masts'
  when 'CP-05' then 'campaign'
  when 'CP-06' then 'posts'
end
where code in ('CP-01', 'CP-02', 'CP-03', 'CP-04', 'CP-05', 'CP-06')
  and external_progress_key is null;

alter table public.task_progress_updates
  add column if not exists source text not null default 'manual',
  add column if not exists source_file_name text,
  add column if not exists completed_quantity numeric(12,2);

create index if not exists task_progress_updates_source_idx
  on public.task_progress_updates(source, update_date desc);

create table if not exists public.progress_imports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  zone_element_id uuid references public.zone_elements(id) on delete set null,
  report_date date not null,
  source_file_name text not null,
  global_progress numeric(5,2) not null default 0
    check (global_progress between 0 and 100),
  parsed_payload jsonb not null default '{}'::jsonb,
  activities_updated integer not null default 0,
  tasks_updated integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists progress_imports_project_date_idx
  on public.progress_imports(project_id, report_date desc, created_at desc);

alter table public.progress_imports enable row level security;
drop policy if exists "authenticated manage progress imports"
  on public.progress_imports;
create policy "authenticated manage progress imports"
on public.progress_imports for all to authenticated
using (true) with check (true);

-- Le rapport Casa-Port contient un seul jalon "Dallage armé". Préserver le
-- meilleur avancement des anciens jalons Niv 0 / Niv 1 avant de les retirer.
insert into public.task_building_phases(
  task_id, code, label, weight, progress, sort_order
)
select
  phase.task_id,
  'dallage_arme',
  'Dallage armé',
  1,
  max(phase.progress),
  90
from public.task_building_phases phase
join public.tasks task on task.id = phase.task_id
where task.progress_mode = 'building'
  and task.work_type = 'gc_building'
  and phase.code in ('dallage_niv_0', 'dallage_niv_1', 'dallage_arme')
group by phase.task_id
on conflict(task_id, code) do update
set label = excluded.label,
    weight = excluded.weight,
    progress = greatest(
      public.task_building_phases.progress,
      excluded.progress
    ),
    sort_order = excluded.sort_order;

delete from public.task_building_phases
where code in ('dallage_niv_0', 'dallage_niv_1');

create or replace function public.opc_initialize_building_phases()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.progress_mode = 'building' and new.work_type = 'gc_building' then
    insert into public.task_building_phases(
      task_id, code, label, weight, sort_order
    )
    values
      (new.id, 'installation_implantation', 'Installation et implantation', 1, 10),
      (new.id, 'terrassement', 'Terrassement', 1, 20),
      (new.id, 'beton_proprete', 'Béton de propreté', 1, 30),
      (new.id, 'semelles_ba', 'Semelles BA', 1, 40),
      (new.id, 'longrines_ba', 'Longrines BA', 1, 50),
      (new.id, 'poteaux_ba', 'Poteaux BA', 1, 60),
      (new.id, 'caniveaux_regards', 'Caniveaux et regards', 1, 70),
      (new.id, 'remblaiement_compactage', 'Remblaiement et compactage', 1, 80),
      (new.id, 'dallage_arme', 'Dallage armé', 1, 90),
      (new.id, 'maconnerie', 'Maçonnerie', 1, 100),
      (new.id, 'chainages', 'Chaînages', 1, 110),
      (new.id, 'poutres_plancher_haut', 'Poutres et plancher haut', 1, 120),
      (new.id, 'etancheite', 'Étanchéité', 1, 130),
      (new.id, 'enduits', 'Enduits', 1, 140),
      (new.id, 'eclairage', 'Éclairage', 1, 150),
      (new.id, 'climatisation', 'Climatisation', 1, 160),
      (new.id, 'nettoyage', 'Nettoyage', 1, 170)
    on conflict(task_id, code) do update
      set label = excluded.label,
          weight = excluded.weight,
          sort_order = excluded.sort_order;
  end if;
  return new;
end;
$$;

-- Compléter les tâches bâtiment existantes avec la structure exacte du PDF.
insert into public.task_building_phases(
  task_id, code, label, weight, sort_order
)
select task.id, step.code, step.label, 1, step.sort_order
from public.tasks task
cross join (
  values
    ('installation_implantation', 'Installation et implantation', 10),
    ('terrassement', 'Terrassement', 20),
    ('beton_proprete', 'Béton de propreté', 30),
    ('semelles_ba', 'Semelles BA', 40),
    ('longrines_ba', 'Longrines BA', 50),
    ('poteaux_ba', 'Poteaux BA', 60),
    ('caniveaux_regards', 'Caniveaux et regards', 70),
    ('remblaiement_compactage', 'Remblaiement et compactage', 80),
    ('dallage_arme', 'Dallage armé', 90),
    ('maconnerie', 'Maçonnerie', 100),
    ('chainages', 'Chaînages', 110),
    ('poutres_plancher_haut', 'Poutres et plancher haut', 120),
    ('etancheite', 'Étanchéité', 130),
    ('enduits', 'Enduits', 140),
    ('eclairage', 'Éclairage', 150),
    ('climatisation', 'Climatisation', 160),
    ('nettoyage', 'Nettoyage', 170)
) as step(code, label, sort_order)
where task.progress_mode = 'building'
  and task.work_type = 'gc_building'
on conflict(task_id, code) do update
set label = excluded.label,
    weight = excluded.weight,
    sort_order = excluded.sort_order;

notify pgrst, 'reload schema';
