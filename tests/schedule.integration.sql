begin;
select set_config('request.jwt.claim.sub',(select id::text from auth.users order by created_at limit 1),true);
set local role authenticated;
do $$
declare p uuid; a uuid; t public.tasks%rowtype; result jsonb; created_id uuid; count_before integer; original_progress numeric; caught boolean:=false; payload jsonb;
begin
select id into p from public.projects where code='PDD';
select * into t from public.tasks where project_id=p and activity_id is not null order by id limit 1;
a:=t.activity_id; original_progress:=t.progress;
payload:=jsonb_build_object('task_id',t.id,'activity_id',a,'title',t.title,'start','2026-06-01','finish','2026-06-05','expected_start',t.start_date,'expected_finish',t.due_date);
result:=public.apply_schedule_changes(p,'Rollback test',jsonb_build_array(payload));
if (result->>'count')::int<>1 then raise exception 'Count assertion failed';end if;
if (select progress from public.tasks where id=t.id) is distinct from original_progress then raise exception 'Progress was changed';end if;
if (select start_date from public.tasks where id=t.id)<>'2026-06-01'::date then raise exception 'Task dates assertion failed';end if;
if (select start_date from public.activities where id=a) is distinct from (select min(coalesce(start_date,due_date)) from public.tasks where activity_id=a) then raise exception 'Activity rollup assertion failed';end if;
select count(*) into count_before from public.tasks where project_id=p;
result:=public.apply_schedule_changes(p,'Rollback XML test',jsonb_build_array(jsonb_build_object('activity_id',a,'title','OPC rollback fixture','start','2026-06-10','finish','2026-06-12','source_key','fixture-1')));
select task_id into created_id from public.schedule_bindings where project_id=p and source_name='Rollback XML test' and source_key='fixture-1';
if created_id is null then raise exception 'Binding assertion failed';end if;
result:=public.apply_schedule_changes(p,'Rollback XML test',jsonb_build_array(jsonb_build_object('task_id',created_id,'activity_id',a,'title','OPC rollback fixture','start','2026-06-11','finish','2026-06-13','expected_start','2026-06-10','expected_finish','2026-06-12','source_key','fixture-1')));
if (select count(*) from public.tasks where project_id=p)<>count_before+1 then raise exception 'Reimport duplicated task';end if;
begin
result:=public.apply_schedule_changes(p,'Atomic conflict test',jsonb_build_array(jsonb_build_object('task_id',t.id,'activity_id',a,'title',t.title,'start','2026-07-01','finish','2026-07-05','expected_start','2026-06-01','expected_finish','2026-06-05'),jsonb_build_object('task_id',created_id,'activity_id',a,'title','OPC rollback fixture','start','2026-07-10','finish','2026-07-12','expected_start','2000-01-01','expected_finish','2000-01-02')));
exception when others then if SQLERRM not like 'Les dates ont changé%' then raise;end if;caught:=true;
end;
if not caught then raise exception 'Concurrent edit was not rejected';end if;
if (select start_date from public.tasks where id=t.id)<>'2026-06-01'::date then raise exception 'Batch was partially committed';end if;
end;$$;
rollback;
select 'PASS: task dates, parent rollup, preserved progress, reimport without duplicates, concurrent conflict, atomic rollback; fixture writes rolled back' as verification;