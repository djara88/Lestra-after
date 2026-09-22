-- Lestra After — connected study flow v1
-- Connects academic obligations to study sessions and places those sessions in the same temporal flow.

create or replace function public.after_plan_study_for_item(
  p_academic_item_id uuid,
  p_scheduled_start timestamptz,
  p_planned_minutes integer default 30,
  p_objective text default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item after.academic_items%rowtype;
  v_plan_id uuid;
  v_session_id uuid;
  v_objective text := nullif(btrim(coalesce(p_objective,'')), '');
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if p_scheduled_start is null then raise exception 'scheduled_start_required'; end if;
  if p_planned_minutes < 5 or p_planned_minutes > 240 then raise exception 'invalid_minutes'; end if;
  if v_objective is not null and char_length(v_objective) > 1000 then raise exception 'objective_too_long'; end if;

  select * into v_item
  from after.academic_items a
  where a.id=p_academic_item_id
    and a.status in ('pending','in_progress')
    and a.type in ('task','test','exam','project')
    and after_private.student_in_my_family(a.student_id);

  if v_item.id is null then raise exception 'academic_item_not_available'; end if;

  select p.id into v_plan_id
  from after.study_plans p
  where p.academic_item_id=v_item.id
    and p.student_id=v_item.student_id
    and p.status in ('draft','active')
  order by p.created_at desc
  limit 1;

  if v_plan_id is null then
    insert into after.study_plans(student_id,academic_item_id,title,objective,status,generated_by_ai,created_by)
    values(v_item.student_id,v_item.id,'Preparar: '||v_item.title,v_objective,'active',false,auth.uid())
    returning id into v_plan_id;
  else
    update after.study_plans
    set title='Preparar: '||v_item.title,
        objective=v_objective,
        status='active',
        updated_at=now()
    where id=v_plan_id;
  end if;

  select s.id into v_session_id
  from after.study_sessions s
  where s.study_plan_id=v_plan_id and s.completed_at is null
  order by s.scheduled_start
  limit 1;

  if v_session_id is null then
    insert into after.study_sessions(study_plan_id,scheduled_start,planned_minutes)
    values(v_plan_id,p_scheduled_start,p_planned_minutes)
    returning id into v_session_id;
  else
    update after.study_sessions
    set scheduled_start=p_scheduled_start,
        planned_minutes=p_planned_minutes
    where id=v_session_id;
  end if;

  return jsonb_build_object('plan_id',v_plan_id,'session_id',v_session_id);
end;
$$;

create or replace function public.after_complete_study_session_v2(p_session_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_plan_id uuid;
  v_has_pending boolean;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;

  select s.study_plan_id into v_plan_id
  from after.study_sessions s
  join after.study_plans p on p.id=s.study_plan_id
  where s.id=p_session_id
    and s.completed_at is null
    and after_private.student_in_my_family(p.student_id)
  for update of s;

  if v_plan_id is null then return false; end if;

  update after.study_sessions set completed_at=now() where id=p_session_id;

  select exists(
    select 1 from after.study_sessions s
    where s.study_plan_id=v_plan_id and s.completed_at is null
  ) into v_has_pending;

  if not v_has_pending then
    update after.study_plans set status='completed',updated_at=now() where id=v_plan_id;
  end if;

  return true;
end;
$$;

create or replace function public.after_reschedule_study_session(
  p_session_id uuid,
  p_scheduled_start timestamptz,
  p_planned_minutes integer,
  p_objective text default null
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_plan_id uuid;
  v_objective text := nullif(btrim(coalesce(p_objective,'')), '');
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if p_scheduled_start is null then raise exception 'scheduled_start_required'; end if;
  if p_planned_minutes < 5 or p_planned_minutes > 240 then raise exception 'invalid_minutes'; end if;
  if v_objective is not null and char_length(v_objective)>1000 then raise exception 'objective_too_long'; end if;

  select s.study_plan_id into v_plan_id
  from after.study_sessions s
  join after.study_plans p on p.id=s.study_plan_id
  where s.id=p_session_id
    and s.completed_at is null
    and after_private.student_in_my_family(p.student_id)
  for update of s;

  if v_plan_id is null then raise exception 'study_session_not_available'; end if;

  update after.study_sessions
  set scheduled_start=p_scheduled_start,planned_minutes=p_planned_minutes
  where id=p_session_id;

  update after.study_plans
  set objective=v_objective,updated_at=now()
  where id=v_plan_id;

  return true;
end;
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
    'estimated_minutes',a.estimated_minutes,
    'has_study_plan',exists(
      select 1 from after.study_plans sp
      where sp.academic_item_id=a.id and sp.status in ('draft','active')
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

create or replace function public.after_study_plans()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(obj order by scheduled_start nulls last),'[]'::jsonb)
  from (
    select jsonb_build_object(
      'id',p.id,
      'session_id',ss.id,
      'student_id',p.student_id,
      'student_name',coalesce(st.preferred_name,st.first_name),
      'academic_item_id',p.academic_item_id,
      'academic_title',a.title,
      'academic_due_at',a.due_at,
      'title',p.title,
      'objective',p.objective,
      'status',p.status,
      'scheduled_start',ss.scheduled_start,
      'planned_minutes',ss.planned_minutes,
      'completed_at',ss.completed_at
    ) obj,
    ss.scheduled_start
    from after.study_plans p
    join after.students st on st.id=p.student_id
    left join after.academic_items a on a.id=p.academic_item_id
    join lateral (
      select x.id,x.scheduled_start,x.planned_minutes,x.completed_at
      from after.study_sessions x
      where x.study_plan_id=p.id and x.completed_at is null
      order by x.scheduled_start
      limit 1
    ) ss on true
    where p.status in ('draft','active')
      and after_private.student_in_my_family(p.student_id)
  ) q;
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
    from after.family_members m
    join after.families f on f.id=m.family_id
    where m.user_id=(select auth.uid()) and m.status='active' and f.status='active'
    order by m.created_at limit 1
  ), events as (
    select jsonb_build_object(
      'kind','event','id',e.id,'student_id',e.student_id,'title',e.title,'category',e.category,
      'starts_at',e.starts_at,'ends_at',e.ends_at,'location',e.location,'sensitivity',e.sensitivity,
      'travel_minutes',e.travel_minutes,'status',e.status
    ) obj,e.starts_at sort_at
    from after.calendar_events e join fam on fam.family_id=e.family_id
    where e.status='scheduled'
      and e.starts_at>=now()-interval '1 day'
      and e.starts_at<now()+make_interval(days=>greatest(1,least(coalesce(p_days,30),90)))
  ), academics as (
    select jsonb_build_object(
      'kind','academic','id',a.id,'student_id',a.student_id,'title',a.title,'category',a.type,
      'starts_at',a.due_at,'status',a.status,'priority',a.priority,'estimated_minutes',a.estimated_minutes
    ) obj,coalesce(a.due_at,now()) sort_at
    from after.academic_items a
    join after.students st on st.id=a.student_id
    join fam on fam.family_id=st.family_id
    where a.status in ('pending','in_progress')
      and (a.due_at is null or a.due_at<now()+make_interval(days=>greatest(1,least(coalesce(p_days,30),90))))
  ), studies as (
    select jsonb_build_object(
      'kind','study','id',ss.id,'study_plan_id',sp.id,'academic_item_id',sp.academic_item_id,
      'student_id',sp.student_id,'title',sp.title,'category','study','starts_at',ss.scheduled_start,
      'ends_at',ss.scheduled_start+make_interval(mins=>ss.planned_minutes),'planned_minutes',ss.planned_minutes,
      'objective',sp.objective,'academic_title',a.title,'status',sp.status
    ) obj,ss.scheduled_start sort_at
    from after.study_sessions ss
    join after.study_plans sp on sp.id=ss.study_plan_id
    join after.students st on st.id=sp.student_id
    join fam on fam.family_id=st.family_id
    left join after.academic_items a on a.id=sp.academic_item_id
    where sp.status in ('draft','active')
      and ss.completed_at is null
      and ss.scheduled_start>=now()-interval '1 day'
      and ss.scheduled_start<now()+make_interval(days=>greatest(1,least(coalesce(p_days,30),90)))
  )
  select coalesce(jsonb_agg(obj order by sort_at),'[]'::jsonb)
  from (
    select * from events
    union all select * from academics
    union all select * from studies
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
    from after.family_members fm
    join after.families f on f.id=fm.family_id
    where fm.user_id=(select auth.uid()) and fm.status='active' and f.status='active'
    order by fm.created_at limit 1
  ), academic as (
    select a.*,st.family_id,coalesce(sub.name,'') subject_name
    from after.academic_items a
    join after.students st on st.id=a.student_id
    join fam on fam.family_id=st.family_id
    left join after.subjects sub on sub.id=a.subject_id
    where a.status in ('pending','in_progress')
  ), events as (
    select e.* from after.calendar_events e join fam on fam.family_id=e.family_id
    where e.status='scheduled'
      and e.starts_at>=date_trunc('day',now())
      and e.starts_at<date_trunc('day',now())+interval '8 days'
  ), studies as (
    select ss.id session_id,ss.scheduled_start,ss.planned_minutes,
           sp.id study_plan_id,sp.academic_item_id,sp.student_id,sp.title,sp.objective,sp.status,
           a.title academic_title
    from after.study_sessions ss
    join after.study_plans sp on sp.id=ss.study_plan_id
    join after.students st on st.id=sp.student_id
    join fam on fam.family_id=st.family_id
    left join after.academic_items a on a.id=sp.academic_item_id
    where sp.status in ('draft','active') and ss.completed_at is null
      and ss.scheduled_start>=date_trunc('day',now())
      and ss.scheduled_start<date_trunc('day',now())+interval '8 days'
  )
  select jsonb_build_object(
    'overdue',coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind','academic','id',a.id,'student_id',a.student_id,'title',a.title,'category',a.type,'starts_at',a.due_at,
        'status',a.status,'priority',a.priority,'subject',a.subject_name,'estimated_minutes',a.estimated_minutes
      ) order by a.due_at)
      from academic a where a.due_at<date_trunc('day',now())
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

revoke all on function public.after_plan_study_for_item(uuid,timestamptz,integer,text) from public,anon;
revoke all on function public.after_complete_study_session_v2(uuid) from public,anon;
revoke all on function public.after_reschedule_study_session(uuid,timestamptz,integer,text) from public,anon;
revoke all on function public.after_study_targets(integer) from public,anon;
revoke all on function public.after_study_plans() from public,anon;
revoke all on function public.after_agenda(integer) from public,anon;
revoke all on function public.after_school_overview() from public,anon;

grant execute on function public.after_plan_study_for_item(uuid,timestamptz,integer,text) to authenticated;
grant execute on function public.after_complete_study_session_v2(uuid) to authenticated;
grant execute on function public.after_reschedule_study_session(uuid,timestamptz,integer,text) to authenticated;
grant execute on function public.after_study_targets(integer) to authenticated;
grant execute on function public.after_study_plans() to authenticated;
grant execute on function public.after_agenda(integer) to authenticated;
grant execute on function public.after_school_overview() to authenticated;
