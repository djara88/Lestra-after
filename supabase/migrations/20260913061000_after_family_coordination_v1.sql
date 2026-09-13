-- Lestra After — family coordination v1
-- Gives responsibilities a deadline/context and places actionable family coordination in the temporal flow.

alter table after.responsibilities
  add column if not exists due_at timestamptz,
  add column if not exists context_text text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='after.responsibilities'::regclass
      and conname='responsibilities_context_text_check'
  ) then
    alter table after.responsibilities
      add constraint responsibilities_context_text_check
      check (context_text is null or char_length(context_text) <= 1000);
  end if;
end $$;

create index if not exists after_responsibilities_family_due_status_idx
  on after.responsibilities(family_id,due_at,status)
  where status <> 'completed';

create or replace function public.after_create_responsibility_v2(
  p_family_id uuid,
  p_student_id uuid,
  p_title text,
  p_assigned_member_id uuid,
  p_due_at timestamptz,
  p_context_text text default null
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_title text := nullif(btrim(p_title),'');
  v_context text := nullif(btrim(coalesce(p_context_text,'')),'');
  v_status text;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if not after_private.is_family_member(p_family_id) then raise exception 'family_access_denied'; end if;
  if v_title is null or char_length(v_title)<2 or char_length(v_title)>180 then raise exception 'invalid_title'; end if;
  if p_due_at is null then raise exception 'due_at_required'; end if;
  if v_context is not null and char_length(v_context)>1000 then raise exception 'context_too_long'; end if;
  if p_student_id is not null and not exists(
    select 1 from after.students s where s.id=p_student_id and s.family_id=p_family_id and s.status='active'
  ) then raise exception 'student_not_available'; end if;
  if p_assigned_member_id is not null and not exists(
    select 1 from after.family_members fm where fm.id=p_assigned_member_id and fm.family_id=p_family_id and fm.status='active'
  ) then raise exception 'member_not_available'; end if;

  v_status := case when p_assigned_member_id is null then 'unassigned' else 'proposed' end;
  insert into after.responsibilities(
    family_id,student_id,assigned_member_id,title,status,assigned_by,due_at,context_text
  ) values (
    p_family_id,p_student_id,p_assigned_member_id,v_title,v_status,auth.uid(),p_due_at,v_context
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.after_update_responsibility_v2(
  p_responsibility_id uuid,
  p_student_id uuid,
  p_title text,
  p_assigned_member_id uuid,
  p_due_at timestamptz,
  p_context_text text default null
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row after.responsibilities%rowtype;
  v_title text := nullif(btrim(p_title),'');
  v_context text := nullif(btrim(coalesce(p_context_text,'')),'');
  v_status text;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;

  select * into v_row
  from after.responsibilities r
  where r.id=p_responsibility_id and after_private.is_family_member(r.family_id)
  for update;

  if v_row.id is null then raise exception 'responsibility_access_denied'; end if;
  if v_row.status='completed' then raise exception 'responsibility_already_completed'; end if;
  if v_title is null or char_length(v_title)<2 or char_length(v_title)>180 then raise exception 'invalid_title'; end if;
  if p_due_at is null then raise exception 'due_at_required'; end if;
  if v_context is not null and char_length(v_context)>1000 then raise exception 'context_too_long'; end if;
  if p_student_id is not null and not exists(
    select 1 from after.students s where s.id=p_student_id and s.family_id=v_row.family_id and s.status='active'
  ) then raise exception 'student_not_available'; end if;
  if p_assigned_member_id is not null and not exists(
    select 1 from after.family_members fm where fm.id=p_assigned_member_id and fm.family_id=v_row.family_id and fm.status='active'
  ) then raise exception 'member_not_available'; end if;

  v_status := case
    when p_assigned_member_id is null then 'unassigned'
    when v_row.assigned_member_id is distinct from p_assigned_member_id then 'proposed'
    when v_row.status in ('unassigned','declined') then 'proposed'
    else v_row.status
  end;

  update after.responsibilities
  set student_id=p_student_id,
      title=v_title,
      assigned_member_id=p_assigned_member_id,
      due_at=p_due_at,
      context_text=v_context,
      status=v_status,
      assigned_by=auth.uid(),
      responded_at=case when v_status='proposed' then null else responded_at end,
      updated_at=now()
  where id=p_responsibility_id;
  return true;
end;
$$;

create or replace function public.after_responsibility_detail(p_responsibility_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((
    select jsonb_build_object(
      'id',r.id,
      'family_id',r.family_id,
      'student_id',r.student_id,
      'assigned_member_id',r.assigned_member_id,
      'assigned_name',fm.display_name,
      'title',r.title,
      'status',r.status,
      'due_at',r.due_at,
      'context_text',r.context_text,
      'calendar_event_id',r.calendar_event_id,
      'assigned_by',r.assigned_by,
      'responded_at',r.responded_at
    )
    from after.responsibilities r
    left join after.family_members fm on fm.id=r.assigned_member_id and fm.family_id=r.family_id
    where r.id=p_responsibility_id and after_private.is_family_member(r.family_id)
  ),'{}'::jsonb);
$$;

create or replace function public.after_family_workspace()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with mine as (
    select fm.family_id
    from after.family_members fm
    join after.families f on f.id=fm.family_id
    where fm.user_id=(select auth.uid()) and fm.status='active' and f.status='active'
    order by fm.created_at limit 1
  )
  select coalesce((
    select jsonb_build_object(
      'family_id',m.family_id,
      'members',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',fm.id,'display_name',fm.display_name,'role',fm.role,'is_me',fm.user_id=(select auth.uid())
        ) order by fm.created_at)
        from after.family_members fm where fm.family_id=m.family_id and fm.status='active'
      ),'[]'::jsonb),
      'students',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',s.id,'name',coalesce(s.preferred_name,s.first_name),'first_name',s.first_name,
          'preferred_name',s.preferred_name,'relationship_label',s.relationship_label,
          'school_name',s.school_name,'grade_level',s.grade_level
        ) order by s.created_at)
        from after.students s where s.family_id=m.family_id and s.status='active'
      ),'[]'::jsonb),
      'responsibilities',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',r.id,'student_id',r.student_id,'assigned_member_id',r.assigned_member_id,
          'title',r.title,'status',r.status,'due_at',r.due_at,'context_text',r.context_text,
          'created_at',r.created_at,'assigned_name',fm.display_name
        ) order by r.due_at nulls last,r.created_at desc)
        from after.responsibilities r
        left join after.family_members fm on fm.id=r.assigned_member_id and fm.family_id=r.family_id
        where r.family_id=m.family_id and r.status <> 'completed'
      ),'[]'::jsonb)
    ) from mine m
  ),'{}'::jsonb);
$$;

create or replace function public.after_agenda(p_days integer default 30)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with fam as (
    select m.family_id
    from after.family_members m join after.families f on f.id=m.family_id
    where m.user_id=(select auth.uid()) and m.status='active' and f.status='active'
    order by m.created_at limit 1
  ), events as (
    select jsonb_build_object(
      'kind','event','id',e.id,'student_id',e.student_id,'title',e.title,'category',e.category,
      'starts_at',e.starts_at,'ends_at',e.ends_at,'location',e.location,'sensitivity',e.sensitivity,
      'travel_minutes',e.travel_minutes,'status',e.status
    ) obj,e.starts_at sort_at
    from after.calendar_events e join fam on fam.family_id=e.family_id
    where e.status='scheduled' and e.starts_at>=now()-interval '1 day'
      and e.starts_at<now()+make_interval(days=>greatest(1,least(coalesce(p_days,30),90)))
  ), academics as (
    select jsonb_build_object(
      'kind','academic','id',a.id,'student_id',a.student_id,'title',a.title,'category',a.type,
      'starts_at',a.due_at,'status',a.status,'priority',a.priority,'estimated_minutes',a.estimated_minutes
    ) obj,coalesce(a.due_at,now()) sort_at
    from after.academic_items a join after.students st on st.id=a.student_id join fam on fam.family_id=st.family_id
    where a.status in ('pending','in_progress')
      and (a.due_at is null or a.due_at<now()+make_interval(days=>greatest(1,least(coalesce(p_days,30),90))))
  ), studies as (
    select jsonb_build_object(
      'kind','study','id',ss.id,'study_plan_id',sp.id,'academic_item_id',sp.academic_item_id,
      'student_id',sp.student_id,'title',sp.title,'category','study','starts_at',ss.scheduled_start,
      'ends_at',ss.scheduled_start+make_interval(mins=>ss.planned_minutes),'planned_minutes',ss.planned_minutes,
      'objective',sp.objective,'academic_title',a.title,'status',sp.status
    ) obj,ss.scheduled_start sort_at
    from after.study_sessions ss join after.study_plans sp on sp.id=ss.study_plan_id
    join after.students st on st.id=sp.student_id join fam on fam.family_id=st.family_id
    left join after.academic_items a on a.id=sp.academic_item_id
    where sp.status in ('draft','active') and ss.completed_at is null
      and ss.scheduled_start>=now()-interval '1 day'
      and ss.scheduled_start<now()+make_interval(days=>greatest(1,least(coalesce(p_days,30),90)))
  ), responsibilities as (
    select jsonb_build_object(
      'kind','responsibility','id',r.id,'student_id',r.student_id,'title',r.title,'category','family',
      'starts_at',r.due_at,'status',r.status,'assigned_member_id',r.assigned_member_id,
      'assigned_name',fm.display_name,'context_text',r.context_text
    ) obj,r.due_at sort_at
    from after.responsibilities r join fam on fam.family_id=r.family_id
    left join after.family_members fm on fm.id=r.assigned_member_id and fm.family_id=r.family_id
    where r.status <> 'completed' and r.due_at is not null
      and r.due_at>=now()-interval '1 day'
      and r.due_at<now()+make_interval(days=>greatest(1,least(coalesce(p_days,30),90)))
  )
  select coalesce(jsonb_agg(obj order by sort_at),'[]'::jsonb)
  from (
    select * from events
    union all select * from academics
    union all select * from studies
    union all select * from responsibilities
  ) x;
$$;

create or replace function public.after_school_overview()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with fam as (
    select fm.family_id
    from after.family_members fm join after.families f on f.id=fm.family_id
    where fm.user_id=(select auth.uid()) and fm.status='active' and f.status='active'
    order by fm.created_at limit 1
  ), academic as (
    select a.*,st.family_id,coalesce(sub.name,'') subject_name
    from after.academic_items a join after.students st on st.id=a.student_id join fam on fam.family_id=st.family_id
    left join after.subjects sub on sub.id=a.subject_id
    where a.status in ('pending','in_progress')
  ), events as (
    select e.* from after.calendar_events e join fam on fam.family_id=e.family_id
    where e.status='scheduled' and e.starts_at>=date_trunc('day',now())
      and e.starts_at<date_trunc('day',now())+interval '8 days'
  ), studies as (
    select ss.id session_id,ss.scheduled_start,ss.planned_minutes,sp.id study_plan_id,sp.academic_item_id,
           sp.student_id,sp.title,sp.objective,sp.status,a.title academic_title
    from after.study_sessions ss join after.study_plans sp on sp.id=ss.study_plan_id
    join after.students st on st.id=sp.student_id join fam on fam.family_id=st.family_id
    left join after.academic_items a on a.id=sp.academic_item_id
    where sp.status in ('draft','active') and ss.completed_at is null
      and ss.scheduled_start>=date_trunc('day',now())
      and ss.scheduled_start<date_trunc('day',now())+interval '8 days'
  ), responsibilities as (
    select r.*,fm.display_name assigned_name
    from after.responsibilities r join fam on fam.family_id=r.family_id
    left join after.family_members fm on fm.id=r.assigned_member_id and fm.family_id=r.family_id
    where r.status <> 'completed' and r.due_at is not null
      and r.due_at<date_trunc('day',now())+interval '8 days'
  )
  select jsonb_build_object(
    'overdue',coalesce((
      select jsonb_agg(x.obj order by x.sort_at) from (
        select a.due_at sort_at,jsonb_build_object(
          'kind','academic','id',a.id,'student_id',a.student_id,'title',a.title,'category',a.type,'starts_at',a.due_at,
          'status',a.status,'priority',a.priority,'subject',a.subject_name,'estimated_minutes',a.estimated_minutes
        ) obj from academic a where a.due_at<date_trunc('day',now())
        union all
        select r.due_at,jsonb_build_object(
          'kind','responsibility','id',r.id,'student_id',r.student_id,'title',r.title,'category','family','starts_at',r.due_at,
          'status',r.status,'assigned_member_id',r.assigned_member_id,'assigned_name',r.assigned_name,'context_text',r.context_text
        ) from responsibilities r where r.due_at<date_trunc('day',now())
      ) x
    ),'[]'::jsonb),
    'today',coalesce((
      select jsonb_agg(x.obj order by x.sort_at) from (
        select a.due_at sort_at,jsonb_build_object(
          'kind','academic','id',a.id,'student_id',a.student_id,'title',a.title,'category',a.type,
          'starts_at',a.due_at,'status',a.status,'priority',a.priority,'subject',a.subject_name,'estimated_minutes',a.estimated_minutes
        ) obj from academic a where a.due_at>=date_trunc('day',now()) and a.due_at<date_trunc('day',now())+interval '1 day'
        union all
        select e.starts_at,jsonb_build_object(
          'kind','event','id',e.id,'student_id',e.student_id,'title',e.title,'category',e.category,
          'starts_at',e.starts_at,'ends_at',e.ends_at,'location',e.location,'sensitivity',e.sensitivity,'travel_minutes',e.travel_minutes
        ) from events e where e.starts_at<date_trunc('day',now())+interval '1 day'
        union all
        select s.scheduled_start,jsonb_build_object(
          'kind','study','id',s.session_id,'study_plan_id',s.study_plan_id,'academic_item_id',s.academic_item_id,
          'student_id',s.student_id,'title',s.title,'category','study','starts_at',s.scheduled_start,
          'ends_at',s.scheduled_start+make_interval(mins=>s.planned_minutes),'planned_minutes',s.planned_minutes,
          'objective',s.objective,'academic_title',s.academic_title,'status',s.status
        ) from studies s where s.scheduled_start<date_trunc('day',now())+interval '1 day'
        union all
        select r.due_at,jsonb_build_object(
          'kind','responsibility','id',r.id,'student_id',r.student_id,'title',r.title,'category','family','starts_at',r.due_at,
          'status',r.status,'assigned_member_id',r.assigned_member_id,'assigned_name',r.assigned_name,'context_text',r.context_text
        ) from responsibilities r where r.due_at>=date_trunc('day',now()) and r.due_at<date_trunc('day',now())+interval '1 day'
      ) x
    ),'[]'::jsonb),
    'tomorrow',coalesce((
      select jsonb_agg(x.obj order by x.sort_at) from (
        select a.due_at sort_at,jsonb_build_object(
          'kind','academic','id',a.id,'student_id',a.student_id,'title',a.title,'category',a.type,
          'starts_at',a.due_at,'status',a.status,'priority',a.priority,'subject',a.subject_name,'estimated_minutes',a.estimated_minutes
        ) obj from academic a where a.due_at>=date_trunc('day',now())+interval '1 day' and a.due_at<date_trunc('day',now())+interval '2 days'
        union all
        select e.starts_at,jsonb_build_object(
          'kind','event','id',e.id,'student_id',e.student_id,'title',e.title,'category',e.category,
          'starts_at',e.starts_at,'ends_at',e.ends_at,'location',e.location,'sensitivity',e.sensitivity,'travel_minutes',e.travel_minutes
        ) from events e where e.starts_at>=date_trunc('day',now())+interval '1 day' and e.starts_at<date_trunc('day',now())+interval '2 days'
        union all
        select s.scheduled_start,jsonb_build_object(
          'kind','study','id',s.session_id,'study_plan_id',s.study_plan_id,'academic_item_id',s.academic_item_id,
          'student_id',s.student_id,'title',s.title,'category','study','starts_at',s.scheduled_start,
          'ends_at',s.scheduled_start+make_interval(mins=>s.planned_minutes),'planned_minutes',s.planned_minutes,
          'objective',s.objective,'academic_title',s.academic_title,'status',s.status
        ) from studies s where s.scheduled_start>=date_trunc('day',now())+interval '1 day' and s.scheduled_start<date_trunc('day',now())+interval '2 days'
        union all
        select r.due_at,jsonb_build_object(
          'kind','responsibility','id',r.id,'student_id',r.student_id,'title',r.title,'category','family','starts_at',r.due_at,
          'status',r.status,'assigned_member_id',r.assigned_member_id,'assigned_name',r.assigned_name,'context_text',r.context_text
        ) from responsibilities r where r.due_at>=date_trunc('day',now())+interval '1 day' and r.due_at<date_trunc('day',now())+interval '2 days'
      ) x
    ),'[]'::jsonb),
    'week',coalesce((
      select jsonb_agg(x.obj order by x.sort_at) from (
        select a.due_at sort_at,jsonb_build_object(
          'kind','academic','id',a.id,'student_id',a.student_id,'title',a.title,'category',a.type,
          'starts_at',a.due_at,'status',a.status,'priority',a.priority,'subject',a.subject_name,'estimated_minutes',a.estimated_minutes
        ) obj from academic a where a.due_at>=date_trunc('day',now())+interval '2 days' and a.due_at<date_trunc('day',now())+interval '8 days'
        union all
        select e.starts_at,jsonb_build_object(
          'kind','event','id',e.id,'student_id',e.student_id,'title',e.title,'category',e.category,
          'starts_at',e.starts_at,'ends_at',e.ends_at,'location',e.location,'sensitivity',e.sensitivity,'travel_minutes',e.travel_minutes
        ) from events e where e.starts_at>=date_trunc('day',now())+interval '2 days' and e.starts_at<date_trunc('day',now())+interval '8 days'
        union all
        select s.scheduled_start,jsonb_build_object(
          'kind','study','id',s.session_id,'study_plan_id',s.study_plan_id,'academic_item_id',s.academic_item_id,
          'student_id',s.student_id,'title',s.title,'category','study','starts_at',s.scheduled_start,
          'ends_at',s.scheduled_start+make_interval(mins=>s.planned_minutes),'planned_minutes',s.planned_minutes,
          'objective',s.objective,'academic_title',s.academic_title,'status',s.status
        ) from studies s where s.scheduled_start>=date_trunc('day',now())+interval '2 days' and s.scheduled_start<date_trunc('day',now())+interval '8 days'
        union all
        select r.due_at,jsonb_build_object(
          'kind','responsibility','id',r.id,'student_id',r.student_id,'title',r.title,'category','family','starts_at',r.due_at,
          'status',r.status,'assigned_member_id',r.assigned_member_id,'assigned_name',r.assigned_name,'context_text',r.context_text
        ) from responsibilities r where r.due_at>=date_trunc('day',now())+interval '2 days' and r.due_at<date_trunc('day',now())+interval '8 days'
      ) x
    ),'[]'::jsonb),
    'tomorrow_materials',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',m.id,'academic_item_id',m.academic_item_id,'student_id',m.student_id,'name',m.name,
        'packed',m.packed,'task_title',a.title
      ) order by a.due_at,m.created_at)
      from after.academic_materials m join academic a on a.id=m.academic_item_id
      where a.due_at>=date_trunc('day',now())+interval '1 day' and a.due_at<date_trunc('day',now())+interval '2 days'
    ),'[]'::jsonb)
  );
$$;

revoke all on function public.after_create_responsibility_v2(uuid,uuid,text,uuid,timestamptz,text) from public,anon;
revoke all on function public.after_update_responsibility_v2(uuid,uuid,text,uuid,timestamptz,text) from public,anon;
revoke all on function public.after_responsibility_detail(uuid) from public,anon;
revoke all on function public.after_family_workspace() from public,anon;
revoke all on function public.after_agenda(integer) from public,anon;
revoke all on function public.after_school_overview() from public,anon;

grant execute on function public.after_create_responsibility_v2(uuid,uuid,text,uuid,timestamptz,text) to authenticated;
grant execute on function public.after_update_responsibility_v2(uuid,uuid,text,uuid,timestamptz,text) to authenticated;
grant execute on function public.after_responsibility_detail(uuid) to authenticated;
grant execute on function public.after_family_workspace() to authenticated;
grant execute on function public.after_agenda(integer) to authenticated;
grant execute on function public.after_school_overview() to authenticated;
