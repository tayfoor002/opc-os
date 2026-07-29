-- Replace the initial GC building phases with the detailed guérite / LT steps.
-- Every step has the same weight, so task progress is their arithmetic mean.

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
      (new.id, 'installation_implantation', 'Installation et implantation', 1, 10),
      (new.id, 'terrassement', 'Terrassement', 1, 20),
      (new.id, 'beton_proprete', 'Béton de propreté', 1, 30),
      (new.id, 'semelles_ba', 'Semelles BA', 1, 40),
      (new.id, 'longrines_ba', 'Longrines BA', 1, 50),
      (new.id, 'dallage_niv_0', 'Dallage Niv 0', 1, 60),
      (new.id, 'poteaux_ba', 'Poteaux BA', 1, 70),
      (new.id, 'caniveaux_regards', 'Caniveaux et regards', 1, 80),
      (new.id, 'remblaiement_compactage', 'Remblaiement et compactage', 1, 90),
      (new.id, 'dallage_niv_1', 'Dallage niv1', 1, 100),
      (new.id, 'maconnerie', 'Maçonnerie', 1, 110),
      (new.id, 'chainages', 'Chaînages', 1, 120),
      (new.id, 'poutres_plancher_haut', 'Poutres et plancher haut', 1, 130),
      (new.id, 'etancheite', 'Étanchéité', 1, 140),
      (new.id, 'enduits', 'Enduits', 1, 150),
      (new.id, 'eclairage', 'Éclairage', 1, 160),
      (new.id, 'climatisation', 'Climatisation', 1, 170),
      (new.id, 'nettoyage', 'Nettoyage', 1, 180)
    on conflict(task_id, code) do update
      set label = excluded.label,
          weight = excluded.weight,
          sort_order = excluded.sort_order;
  end if;
  return new;
end;
$$;

-- Preserve the progress of the closest matching legacy phases.
do $$
declare
  phase_map record;
begin
  for phase_map in
    select *
    from (
      values
        ('implantation', 'installation_implantation', 'Installation et implantation', 10),
        ('fondations', 'semelles_ba', 'Semelles BA', 40),
        ('structure', 'poteaux_ba', 'Poteaux BA', 70),
        ('toiture', 'etancheite', 'Étanchéité', 140),
        ('second_oeuvre', 'eclairage', 'Éclairage', 160),
        ('finitions', 'nettoyage', 'Nettoyage', 180)
    ) as mapping(old_code, new_code, new_label, new_sort_order)
  loop
    update public.task_building_phases phase
    set code = phase_map.new_code,
        label = phase_map.new_label,
        weight = 1,
        sort_order = phase_map.new_sort_order
    where phase.code = phase_map.old_code
      and not exists (
        select 1
        from public.task_building_phases existing
        where existing.task_id = phase.task_id
          and existing.code = phase_map.new_code
      );
  end loop;
end;
$$;

insert into public.task_building_phases(
  task_id,
  code,
  label,
  weight,
  sort_order
)
select
  task.id,
  step.code,
  step.label,
  1,
  step.sort_order
from public.tasks task
cross join (
  values
    ('installation_implantation', 'Installation et implantation', 10),
    ('terrassement', 'Terrassement', 20),
    ('beton_proprete', 'Béton de propreté', 30),
    ('semelles_ba', 'Semelles BA', 40),
    ('longrines_ba', 'Longrines BA', 50),
    ('dallage_niv_0', 'Dallage Niv 0', 60),
    ('poteaux_ba', 'Poteaux BA', 70),
    ('caniveaux_regards', 'Caniveaux et regards', 80),
    ('remblaiement_compactage', 'Remblaiement et compactage', 90),
    ('dallage_niv_1', 'Dallage niv1', 100),
    ('maconnerie', 'Maçonnerie', 110),
    ('chainages', 'Chaînages', 120),
    ('poutres_plancher_haut', 'Poutres et plancher haut', 130),
    ('etancheite', 'Étanchéité', 140),
    ('enduits', 'Enduits', 150),
    ('eclairage', 'Éclairage', 160),
    ('climatisation', 'Climatisation', 170),
    ('nettoyage', 'Nettoyage', 180)
) as step(code, label, sort_order)
where task.progress_mode = 'building'
  and task.work_type = 'gc_building'
on conflict(task_id, code) do update
  set label = excluded.label,
      weight = excluded.weight,
      sort_order = excluded.sort_order;

delete from public.task_building_phases phase
using public.tasks task
where phase.task_id = task.id
  and task.progress_mode = 'building'
  and task.work_type = 'gc_building'
  and phase.code not in (
    'installation_implantation',
    'terrassement',
    'beton_proprete',
    'semelles_ba',
    'longrines_ba',
    'dallage_niv_0',
    'poteaux_ba',
    'caniveaux_regards',
    'remblaiement_compactage',
    'dallage_niv_1',
    'maconnerie',
    'chainages',
    'poutres_plancher_haut',
    'etancheite',
    'enduits',
    'eclairage',
    'climatisation',
    'nettoyage'
  );

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
        when calculated_progress = 0 and status <> 'blocked' then 'todo'
        else status
      end
  where id = target_task_id
    and progress_mode = 'building';

  return coalesce(new, old);
end;
$$;

-- Recalculate every existing GC building task after the detailed steps are in place.
update public.task_building_phases
set weight = 1
where task_id in (
  select id
  from public.tasks
  where progress_mode = 'building'
    and work_type = 'gc_building'
);

notify pgrst, 'reload schema';
