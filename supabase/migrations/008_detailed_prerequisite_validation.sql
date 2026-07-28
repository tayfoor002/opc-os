-- Explicit validation by prerequisite category and by assigned collaborator.

alter table public.task_required_certifications
  add column if not exists collaborator_id uuid
    references public.collaborators(id) on delete cascade,
  add column if not exists validated boolean not null default false;

alter table public.task_required_certifications
  drop constraint if exists
    task_required_certifications_task_id_certification_name_key;

alter table public.task_tools
  add column if not exists validated boolean not null default false;

alter table public.task_equipment
  add column if not exists validated boolean not null default false;

alter table public.task_document_requirements
  add column if not exists validated boolean not null default false;

create index if not exists task_required_certifications_person_idx
  on public.task_required_certifications(task_id, collaborator_id);
create unique index if not exists task_required_certifications_unique_person_idx
  on public.task_required_certifications(
    task_id,
    collaborator_id,
    certification_name
  );

drop view if exists public.task_prerequisite_status;
create view public.task_prerequisite_status
with (security_invoker = true)
as
select
  task.id as task_id,
  task.activity_id,
  (
    select count(*) from public.task_required_certifications requirement
    where requirement.task_id = task.id
  ) +
  (
    select count(*) from public.task_document_requirements requirement
    where requirement.task_id = task.id and requirement.required
  ) +
  (
    select count(*) from public.task_tools link where link.task_id = task.id
  ) +
  (
    select count(*) from public.task_equipment link where link.task_id = task.id
  ) +
  (
    select count(*) from public.task_prerequisite_items item
    where item.task_id = task.id and item.required
  ) as total_requirements,
  (
    select count(*)
    from public.task_required_certifications requirement
    where requirement.task_id = task.id
      and (
        not requirement.validated
        or not exists (
          select 1
          from public.collaborator_certifications certification
          where lower(certification.certification_name) =
                lower(requirement.certification_name)
            and (
              certification.valid_until is null
              or certification.valid_until >= current_date
            )
            and (
              (
                requirement.collaborator_id is not null
                and certification.collaborator_id =
                    requirement.collaborator_id
              )
              or (
                requirement.collaborator_id is null
                and (
                  certification.collaborator_id =
                      task.alstom_supervisor_id
                  or certification.collaborator_id =
                      task.avanzit_site_manager_id
                  or exists (
                    select 1
                    from public.task_personnel personnel
                    where personnel.task_id = task.id
                      and personnel.collaborator_id =
                          certification.collaborator_id
                  )
                )
              )
            )
        )
      )
  ) as missing_certifications,
  (
    select count(*)
    from public.task_document_requirements requirement
    where requirement.task_id = task.id
      and requirement.required
      and (
        requirement.document_id is null
        or not requirement.validated
      )
  ) as missing_documents,
  (
    select count(*)
    from public.task_tools link
    join public.quality_tools tool on tool.id = link.tool_id
    where link.task_id = task.id
      and (
        not link.validated
        or tool.condition <> 'serviceable'
        or (
          tool.calibration_required
          and (
            tool.next_calibration_date is null
            or tool.next_calibration_date < current_date
          )
        )
        or (
          tool.asset_type = 'machine'
          and (
            tool.technical_sheet_reference is null
            or (
              tool.technical_sheet_valid_until is not null
              and tool.technical_sheet_valid_until < current_date
            )
            or (
              tool.inspection_valid_until is not null
              and tool.inspection_valid_until < current_date
            )
          )
        )
      )
  ) as invalid_tools,
  (
    select count(*)
    from public.task_equipment link
    join public.project_equipment equipment
      on equipment.id = link.equipment_id
    where link.task_id = task.id
      and (
        not link.validated
        or equipment.status = 'out_of_service'
      )
  ) as invalid_equipment,
  (
    select count(*)
    from public.task_prerequisite_items item
    where item.task_id = task.id
      and item.required
      and not item.satisfied
  ) as missing_manual_items
from public.tasks task;

grant select on public.task_prerequisite_status to authenticated;

notify pgrst, 'reload schema';
