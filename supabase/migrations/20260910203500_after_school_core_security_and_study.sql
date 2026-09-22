-- Lestra After — harden the new school core after security-advisor review.

create policy academic_materials_family_select
on after.academic_materials
for select
to authenticated
using (after_private.student_in_my_family(student_id));

create policy academic_materials_family_insert
on after.academic_materials
for insert
to authenticated
with check (
  after_private.student_in_my_family(student_id)
  and created_by = (select auth.uid())
  and exists (
    select 1
    from after.academic_items a
    where a.id = academic_materials.academic_item_id
      and a.student_id = academic_materials.student_id
      and after_private.student_in_my_family(a.student_id)
  )
);

create policy academic_materials_family_update
on after.academic_materials
for update
to authenticated
using (after_private.student_in_my_family(student_id))
with check (
  after_private.student_in_my_family(student_id)
  and exists (
    select 1
    from after.academic_items a
    where a.id = academic_materials.academic_item_id
      and a.student_id = academic_materials.student_id
      and after_private.student_in_my_family(a.student_id)
  )
);

grant select, insert on after.academic_materials to authenticated;
grant update(packed, updated_at) on after.academic_materials to authenticated;

alter function public.after_create_school_item(uuid,text,text,text,timestamptz,text,text,text[],uuid) security invoker;
alter function public.after_update_academic_status(uuid,text) security invoker;
alter function public.after_set_material_packed(uuid,boolean) security invoker;
alter function public.after_school_overview() security invoker;
alter function public.after_accept_document_candidate(uuid) security invoker;
alter function public.after_reject_document_candidate(uuid) security invoker;

create or replace function public.after_school_overview()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with fam as (
    select fm.family_id
    from after.family_members fm
    join after.families f on f.id=fm.family_id
    where fm.user_id=(select auth.uid()) and fm.status='active' and f.status='active'
    order by fm.created_at limit 1
  ),
  academic as (
    select a.*, s.family_id, coalesce(sub.name,'') subject_name
    from after.academic_items a
    join after.students s on s.id=a.student_id
    join fam on fam.family_id=s.family_id
    left join after.subjects sub on sub.id=a.subject_id
    where a.status in ('pending','in_progress')
  ),
  events as (
    select e.* from after.calendar_events e join fam on fam.family_id=e.family_id
    where e.starts_at >= date_trunc('day',now())
      and e.starts_at < date_trunc('day',now()) + interval '8 days'
  )
  select jsonb_build_object(
    'overdue', coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind','academic','id',a.id,'student_id',a.student_id,'title',a.title,'category',a.type,'starts_at',a.due_at,
        'status',a.status,'priority',a.priority,'subject',a.subject_name
      ) order by a.due_at)
      from academic a where a.due_at < date_trunc('day',now())
    ),'[]'::jsonb),
    'today', coalesce((
      select jsonb_agg(x.obj order by x.sort_at) from (
        select a.due_at sort_at, jsonb_build_object(
          'kind','academic','id',a.id,'student_id',a.student_id,'title',a.title,'category',a.type,
          'starts_at',a.due_at,'status',a.status,'priority',a.priority,'subject',a.subject_name
        ) obj from academic a
        where a.due_at >= date_trunc('day',now()) and a.due_at < date_trunc('day',now()) + interval '1 day'
        union all
        select e.starts_at, jsonb_build_object(
          'kind','event','id',e.id,'student_id',e.student_id,'title',e.title,'category',e.category,
          'starts_at',e.starts_at,'ends_at',e.ends_at,'location',e.location,'sensitivity',e.sensitivity
        ) from events e
        where e.starts_at < date_trunc('day',now()) + interval '1 day'
      ) x
    ),'[]'::jsonb),
    'tomorrow', coalesce((
      select jsonb_agg(x.obj order by x.sort_at) from (
        select a.due_at sort_at, jsonb_build_object(
          'kind','academic','id',a.id,'student_id',a.student_id,'title',a.title,'category',a.type,
          'starts_at',a.due_at,'status',a.status,'priority',a.priority,'subject',a.subject_name
        ) obj from academic a
        where a.due_at >= date_trunc('day',now()) + interval '1 day'
          and a.due_at < date_trunc('day',now()) + interval '2 days'
        union all
        select e.starts_at, jsonb_build_object(
          'kind','event','id',e.id,'student_id',e.student_id,'title',e.title,'category',e.category,
          'starts_at',e.starts_at,'ends_at',e.ends_at,'location',e.location,'sensitivity',e.sensitivity
        ) from events e
        where e.starts_at >= date_trunc('day',now()) + interval '1 day'
          and e.starts_at < date_trunc('day',now()) + interval '2 days'
      ) x
    ),'[]'::jsonb),
    'week', coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind','academic','id',a.id,'student_id',a.student_id,'title',a.title,'category',a.type,'starts_at',a.due_at,
        'status',a.status,'priority',a.priority,'subject',a.subject_name
      ) order by a.due_at)
      from academic a
      where a.due_at >= date_trunc('day',now()) + interval '2 days'
        and a.due_at < date_trunc('day',now()) + interval '8 days'
    ),'[]'::jsonb),
    'tomorrow_materials', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',m.id,'academic_item_id',m.academic_item_id,'student_id',m.student_id,
        'name',m.name,'packed',m.packed,'task_title',a.title
      ) order by a.due_at,m.created_at)
      from after.academic_materials m
      join academic a on a.id=m.academic_item_id
      where a.due_at >= date_trunc('day',now()) + interval '1 day'
        and a.due_at < date_trunc('day',now()) + interval '2 days'
    ),'[]'::jsonb)
  );
$$;

create or replace function public.after_study_targets(p_days integer default 30)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,
    'student_id',a.student_id,
    'student_name',coalesce(s.preferred_name,s.first_name),
    'title',a.title,
    'type',a.type,
    'subject',sub.name,
    'due_at',a.due_at,
    'priority',a.priority,
    'has_study_plan',exists(
      select 1 from after.study_plans sp
      where sp.academic_item_id=a.id and sp.status='active'
    )
  ) order by a.due_at nulls last),'[]'::jsonb)
  from after.academic_items a
  join after.students s on s.id=a.student_id
  left join after.subjects sub on sub.id=a.subject_id
  where after_private.student_in_my_family(a.student_id)
    and a.status in ('pending','in_progress')
    and a.type in ('test','exam','project','task')
    and (a.due_at is null or a.due_at < now() + make_interval(days => greatest(1,least(coalesce(p_days,30),90))));
$$;

revoke all on function public.after_study_targets(integer) from public, anon;
grant execute on function public.after_study_targets(integer) to authenticated;
