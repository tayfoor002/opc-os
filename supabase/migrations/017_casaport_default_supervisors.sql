-- Affectations par défaut pour toutes les activités et tâches de Casa-Port.
-- Les responsables déjà choisis manuellement sont toujours conservés.

with defaults as (
  select
    project.id as project_id,
    (
      select collaborator.id
      from public.collaborators collaborator
      where collaborator.project_id = project.id
        and collaborator.active = true
        and lower(collaborator.company) like '%alstom%'
        and lower(collaborator.full_name) like '%ahmed%'
        and lower(collaborator.full_name) like '%ad%ar%'
      order by collaborator.sort_order nulls last
      limit 1
    ) as alstom_id,
    (
      select collaborator.id
      from public.collaborators collaborator
      where collaborator.project_id = project.id
        and collaborator.active = true
        and lower(collaborator.company) like '%avanzit%'
        and lower(collaborator.full_name) like '%soufiane%'
        and lower(collaborator.full_name) like '%ait%'
        and lower(collaborator.full_name) like '%taleb%'
      order by collaborator.sort_order nulls last
      limit 1
    ) as avanzit_id
  from public.projects project
  where project.code = 'PDD'
)
update public.activities activity
set alstom_supervisor_id = coalesce(activity.alstom_supervisor_id, defaults.alstom_id),
    avanzit_site_manager_id = coalesce(activity.avanzit_site_manager_id, defaults.avanzit_id)
from defaults
where activity.project_id = defaults.project_id
  and activity.zone_element_id in (
    select element.id
    from public.zone_elements element
    where element.project_id = defaults.project_id
      and (
        element.code = 'CASA-PORT'
        or lower(replace(element.name, '-', ' ')) like '%casa port%'
      )
  );

with defaults as (
  select
    project.id as project_id,
    (
      select collaborator.id
      from public.collaborators collaborator
      where collaborator.project_id = project.id
        and collaborator.active = true
        and lower(collaborator.company) like '%alstom%'
        and lower(collaborator.full_name) like '%ahmed%'
        and lower(collaborator.full_name) like '%ad%ar%'
      order by collaborator.sort_order nulls last
      limit 1
    ) as alstom_id,
    (
      select collaborator.id
      from public.collaborators collaborator
      where collaborator.project_id = project.id
        and collaborator.active = true
        and lower(collaborator.company) like '%avanzit%'
        and lower(collaborator.full_name) like '%soufiane%'
        and lower(collaborator.full_name) like '%ait%'
        and lower(collaborator.full_name) like '%taleb%'
      order by collaborator.sort_order nulls last
      limit 1
    ) as avanzit_id
  from public.projects project
  where project.code = 'PDD'
)
update public.tasks task
set alstom_supervisor_id = coalesce(task.alstom_supervisor_id, defaults.alstom_id),
    avanzit_site_manager_id = coalesce(task.avanzit_site_manager_id, defaults.avanzit_id),
    owner = case
      when task.alstom_supervisor_id is null and defaults.alstom_id is not null
        then 'ADDAR Ahmed'
      else task.owner
    end
from defaults
where task.project_id = defaults.project_id
  and task.zone_element_id in (
    select element.id
    from public.zone_elements element
    where element.project_id = defaults.project_id
      and (
        element.code = 'CASA-PORT'
        or lower(replace(element.name, '-', ' ')) like '%casa port%'
      )
  );

notify pgrst, 'reload schema';
