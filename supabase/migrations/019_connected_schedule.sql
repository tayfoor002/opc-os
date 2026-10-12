-- Planning edits/imports use existing tasks. Every batch is one transaction.
begin;
create table if not exists public.schedule_bindings (
  project_id uuid not null references public.projects(id) on delete cascade,
  source_name text not null,
  source_key text not null,
  task_id uuid not null references public.tasks(id) on delete cascade,
  source_metadata jsonb not null default '{}'::jsonb,
  primary key (project_id, source_name, source_key)
);
create table if not exists public.schedule_changes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  actor_id uuid not null default auth.uid(),
  source_name text not null,
  changes jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.schedule_bindings enable row level security;
alter table public.schedule_changes enable row level security;
grant select, insert, update, delete on public.schedule_bindings to authenticated;
grant select, insert on public.schedule_changes to authenticated;
-- Match the existing project's authenticated access model, without bypassing RLS.
drop policy if exists "authenticated schedule bindings" on public.schedule_bindings;
create policy "authenticated schedule bindings" on public.schedule_bindings for all to authenticated using (true) with check (true);
drop policy if exists "authenticated schedule history" on public.schedule_changes;
create policy "authenticated schedule history" on public.schedule_changes for select to authenticated using (true);
drop policy if exists "authenticated insert schedule history" on public.schedule_changes;
create policy "authenticated insert schedule history" on public.schedule_changes for insert to authenticated with check (actor_id = auth.uid());

create or replace function public.apply_schedule_changes(p_project_id uuid, p_source_name text, p_rows jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  r jsonb; existing public.tasks%rowtype; activity public.activities%rowtype;
  target_id uuid; start_value date; finish_value date; audit jsonb := '[]'::jsonb;
  seen uuid[] := '{}'; source_keys text[] := '{}'; bound_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if length(trim(p_source_name)) not between 1 and 200 then raise exception 'Source invalide'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) not between 1 and 1000 then raise exception 'Lot invalide'; end if;
  perform 1 from public.projects where id = p_project_id for update;
  if not found then raise exception 'Projet inaccessible'; end if;
  for r in select value from jsonb_array_elements(p_rows) loop
    if coalesce(r->>'title','') = '' or length(r->>'title') > 250 then raise exception 'Libellé invalide'; end if;
    if coalesce(r->>'start','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(r->>'finish','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Dates invalides'; end if;
    start_value := (r->>'start')::date; finish_value := (r->>'finish')::date;
    if start_value > finish_value then raise exception 'La fin précède le début'; end if;
    if coalesce(r->>'source_key','') <> '' then
      if (r->>'source_key') = any(source_keys) then raise exception 'Identifiant source dupliqué'; end if;
      source_keys := array_append(source_keys,r->>'source_key');
      select task_id into bound_id from public.schedule_bindings where project_id=p_project_id and source_name=p_source_name and source_key=r->>'source_key';
    else bound_id := null; end if;
    target_id := nullif(r->>'task_id','')::uuid;
    if bound_id is not null and target_id is distinct from bound_id then raise exception 'Correspondance source modifiée : recharge le planning'; end if;
    if target_id is not null then
      if target_id = any(seen) then raise exception 'La même tâche apparaît plusieurs fois'; end if;
      select * into existing from public.tasks where id=target_id and project_id=p_project_id for update;
      if not found then raise exception 'Tâche inaccessible'; end if;
      if existing.start_date is distinct from nullif(r->>'expected_start','')::date or existing.due_date is distinct from nullif(r->>'expected_finish','')::date then
        raise exception 'Les dates ont changé depuis l’aperçu. Actualise avant de réessayer.';
      end if;
      audit := audit || jsonb_build_array(jsonb_build_object('task_id',target_id,'title',existing.title,'before_start',existing.start_date,'before_finish',existing.due_date,'after_start',start_value,'after_finish',finish_value,'created',false));
      update public.tasks set start_date=start_value,due_date=finish_value,updated_at=now() where id=target_id;
    else
      select * into activity from public.activities where id=nullif(r->>'activity_id','')::uuid and project_id=p_project_id;
      if not found then raise exception 'Sélectionne une activité pour chaque nouvelle tâche'; end if;
      insert into public.tasks(project_id,activity_id,zone_id,phase_id,zone_element_id,title,start_date,due_date,status,priority,progress)
      values(p_project_id,activity.id,activity.zone_id,activity.phase_id,activity.zone_element_id,r->>'title',start_value,finish_value,'todo','medium',0) returning id into target_id;
      audit := audit || jsonb_build_array(jsonb_build_object('task_id',target_id,'title',r->>'title','after_start',start_value,'after_finish',finish_value,'created',true));
    end if;
    seen := array_append(seen,target_id);
    if coalesce(r->>'source_key','') <> '' then
      insert into public.schedule_bindings(project_id,source_name,source_key,task_id,source_metadata)
      values(p_project_id,p_source_name,r->>'source_key',target_id,coalesce(r->'metadata','{}'::jsonb))
      on conflict(project_id,source_name,source_key) do update set source_metadata=excluded.source_metadata;
    end if;
    select activity_id into target_id from public.tasks where id=target_id;
    perform public.sync_activity_dates_from_tasks(target_id);
  end loop;
  insert into public.schedule_changes(project_id,actor_id,source_name,changes) values(p_project_id,auth.uid(),p_source_name,audit);
  return jsonb_build_object('count',jsonb_array_length(audit));
end;
$$;
revoke all on function public.apply_schedule_changes(uuid,text,jsonb) from public,anon;
grant execute on function public.apply_schedule_changes(uuid,text,jsonb) to authenticated;
commit;
