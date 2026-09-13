-- Lestra After — activity composer, editing and deterministic conflict intelligence v1
-- Additive/backward-compatible migration for the second product transformation phase.

alter table after.calendar_events
  add column if not exists status text not null default 'scheduled',
  add column if not exists travel_minutes integer not null default 0,
  add column if not exists series_id uuid,
  add column if not exists recurrence_rule text not null default 'none',
  add column if not exists occurrence_index integer not null default 0;

alter table after.academic_items
  add column if not exists estimated_minutes integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='after.calendar_events'::regclass and conname='calendar_events_status_check') then
    alter table after.calendar_events add constraint calendar_events_status_check check (status in ('scheduled','cancelled'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid='after.calendar_events'::regclass and conname='calendar_events_travel_minutes_check') then
    alter table after.calendar_events add constraint calendar_events_travel_minutes_check check (travel_minutes between 0 and 240);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='after.calendar_events'::regclass and conname='calendar_events_recurrence_rule_check') then
    alter table after.calendar_events add constraint calendar_events_recurrence_rule_check check (recurrence_rule in ('none','daily','weekly'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid='after.calendar_events'::regclass and conname='calendar_events_occurrence_index_check') then
    alter table after.calendar_events add constraint calendar_events_occurrence_index_check check (occurrence_index between 0 and 365);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='after.academic_items'::regclass and conname='academic_items_estimated_minutes_check') then
    alter table after.academic_items add constraint academic_items_estimated_minutes_check check (estimated_minutes is null or estimated_minutes between 5 and 480);
  end if;
end $$;

create index if not exists after_calendar_events_family_status_starts_idx
  on after.calendar_events(family_id,status,starts_at);
create index if not exists after_calendar_events_student_status_starts_idx
  on after.calendar_events(student_id,status,starts_at) where student_id is not null;
create index if not exists after_calendar_events_series_idx
  on after.calendar_events(series_id,occurrence_index) where series_id is not null;

create or replace function public.after_create_calendar_event_v2(
  p_family_id uuid,
  p_student_id uuid,
  p_category text,
  p_title text,
  p_starts_at timestamptz,
  p_duration_minutes integer default 60,
  p_travel_minutes integer default 0,
  p_location text default null,
  p_notes text default null,
  p_sensitivity text default 'normal',
  p_repeat text default 'none',
  p_repeat_count integer default 1
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text := nullif(btrim(p_title),'');
  v_location text := nullif(btrim(coalesce(p_location,'')),'');
  v_notes text := nullif(btrim(coalesce(p_notes,'')),'');
  v_count integer := case when p_repeat='none' then 1 else p_repeat_count end;
  v_series uuid := case when p_repeat='none' then null else gen_random_uuid() end;
  v_start timestamptz;
  v_end timestamptz;
  v_id uuid;
  v_ids jsonb := '[]'::jsonb;
  i integer;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if not after_private.is_family_member(p_family_id) then raise exception 'family_access_denied'; end if;
  if p_student_id is not null and not exists(
    select 1 from after.students s where s.id=p_student_id and s.family_id=p_family_id and s.status='active'
  ) then raise exception 'student_not_available'; end if;
  if v_title is null or char_length(v_title)>180 then raise exception 'invalid_title'; end if;
  if p_starts_at is null then raise exception 'starts_at_required'; end if;
  if p_duration_minutes is null or p_duration_minutes<5 or p_duration_minutes>720 then raise exception 'invalid_duration'; end if;
  if p_travel_minutes is null or p_travel_minutes<0 or p_travel_minutes>240 then raise exception 'invalid_travel_minutes'; end if;
  if p_category not in ('school','study','sport','health','social','family','other') then raise exception 'invalid_category'; end if;
  if p_sensitivity not in ('normal','private') then raise exception 'invalid_sensitivity'; end if;
  if p_repeat not in ('none','daily','weekly') then raise exception 'invalid_repeat'; end if;
  if v_count<1 or v_count>52 then raise exception 'invalid_repeat_count'; end if;
  if v_location is not null and char_length(v_location)>240 then raise exception 'location_too_long'; end if;
  if v_notes is not null and char_length(v_notes)>2000 then raise exception 'notes_too_long'; end if;

  for i in 0..v_count-1 loop
    v_start := p_starts_at + case when p_repeat='daily' then make_interval(days=>i) when p_repeat='weekly' then make_interval(days=>i*7) else interval '0' end;
    v_end := v_start + make_interval(mins=>p_duration_minutes);

    insert into after.calendar_events(
      family_id,student_id,category,title,starts_at,ends_at,location,sensitivity,notes,created_by,
      status,travel_minutes,series_id,recurrence_rule,occurrence_index
    ) values (
      p_family_id,p_student_id,p_category,v_title,v_start,v_end,v_location,p_sensitivity,v_notes,auth.uid(),
      'scheduled',p_travel_minutes,v_series,p_repeat,i
    ) returning id into v_id;

    v_ids := v_ids || jsonb_build_array(v_id);
  end loop;

  return jsonb_build_object('ids',v_ids,'series_id',v_series,'count',v_count);
end;
$$;

create or replace function public.after_create_school_item_v2(
  p_student_id uuid,
  p_type text,
  p_title text,
  p_description text default null,
  p_due_at timestamptz default null,
  p_priority text default 'normal',
  p_subject_name text default null,
  p_materials text[] default '{}'::text[],
  p_estimated_minutes integer default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_subject_id uuid;
  v_title text := nullif(btrim(p_title),'');
  v_description text := nullif(btrim(coalesce(p_description,'')),'');
  v_subject text := nullif(btrim(coalesce(p_subject_name,'')),'');
  v_material text;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if not after_private.student_in_my_family(p_student_id) then raise exception 'student_access_denied'; end if;
  if v_title is null or char_length(v_title)>180 then raise exception 'invalid_title'; end if;
  if p_type not in ('task','test','exam','project','material','school_event') then raise exception 'invalid_type'; end if;
  if p_priority not in ('low','normal','high','urgent') then raise exception 'invalid_priority'; end if;
  if p_estimated_minutes is not null and (p_estimated_minutes<5 or p_estimated_minutes>480) then raise exception 'invalid_estimated_minutes'; end if;
  if v_description is not null and char_length(v_description)>2000 then raise exception 'description_too_long'; end if;
  if v_subject is not null and char_length(v_subject)>100 then raise exception 'subject_too_long'; end if;

  if v_subject is not null then
    select s.id into v_subject_id from after.subjects s
    where s.student_id=p_student_id and lower(s.name)=lower(v_subject) limit 1;
    if v_subject_id is null then
      insert into after.subjects(student_id,name,active) values(p_student_id,v_subject,true) on conflict do nothing;
      select s.id into v_subject_id from after.subjects s
      where s.student_id=p_student_id and lower(s.name)=lower(v_subject) limit 1;
    end if;
  end if;

  insert into after.academic_items(
    student_id,subject_id,type,title,description,due_at,status,priority,source,created_by,estimated_minutes
  ) values (
    p_student_id,v_subject_id,p_type,v_title,v_description,p_due_at,'pending',p_priority,'manual',auth.uid(),p_estimated_minutes
  ) returning id into v_id;

  foreach v_material in array coalesce(p_materials,'{}'::text[]) loop
    v_material := nullif(btrim(v_material),'');
    if v_material is not null and char_length(v_material)<=120 then
      insert into after.academic_materials(academic_item_id,student_id,name,created_by)
      values(v_id,p_student_id,v_material,auth.uid());
    end if;
  end loop;

  return v_id;
end;
$$;

create or replace function public.after_activity_detail(p_kind text,p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if p_kind='event' then
    select jsonb_build_object(
      'kind','event','id',e.id,'family_id',e.family_id,'student_id',e.student_id,'title',e.title,
      'category',e.category,'starts_at',e.starts_at,'ends_at',e.ends_at,'location',e.location,
      'notes',e.notes,'sensitivity',e.sensitivity,'status',e.status,'travel_minutes',e.travel_minutes,
      'series_id',e.series_id,'recurrence_rule',e.recurrence_rule,'occurrence_index',e.occurrence_index
    ) into v_result
    from after.calendar_events e
    where e.id=p_id and after_private.is_family_member(e.family_id);
  elsif p_kind='academic' then
    select jsonb_build_object(
      'kind','academic','id',a.id,'student_id',a.student_id,'title',a.title,'category',a.type,
      'description',a.description,'starts_at',a.due_at,'priority',a.priority,'status',a.status,
      'estimated_minutes',a.estimated_minutes,'subject',sub.name,
      'materials',coalesce((select jsonb_agg(m.name order by m.created_at) from after.academic_materials m where m.academic_item_id=a.id),'[]'::jsonb)
    ) into v_result
    from after.academic_items a
    left join after.subjects sub on sub.id=a.subject_id
    where a.id=p_id and after_private.student_in_my_family(a.student_id);
  else
    raise exception 'invalid_activity_kind';
  end if;

  if v_result is null then raise exception 'activity_not_available'; end if;
  return v_result;
end;
$$;

create or replace function public.after_update_calendar_event_v2(
  p_event_id uuid,
  p_student_id uuid,
  p_category text,
  p_title text,
  p_starts_at timestamptz,
  p_duration_minutes integer,
  p_travel_minutes integer default 0,
  p_location text default null,
  p_notes text default null,
  p_sensitivity text default 'normal'
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event after.calendar_events%rowtype;
  v_title text := nullif(btrim(p_title),'');
  v_location text := nullif(btrim(coalesce(p_location,'')),'');
  v_notes text := nullif(btrim(coalesce(p_notes,'')),'');
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select * into v_event from after.calendar_events e
  where e.id=p_event_id and after_private.is_family_member(e.family_id) for update;
  if v_event.id is null then raise exception 'event_access_denied'; end if;
  if p_student_id is not null and not exists(
    select 1 from after.students s where s.id=p_student_id and s.family_id=v_event.family_id and s.status='active'
  ) then raise exception 'student_not_available'; end if;
  if v_title is null or char_length(v_title)>180 then raise exception 'invalid_title'; end if;
  if p_starts_at is null then raise exception 'starts_at_required'; end if;
  if p_duration_minutes is null or p_duration_minutes<5 or p_duration_minutes>720 then raise exception 'invalid_duration'; end if;
  if p_travel_minutes is null or p_travel_minutes<0 or p_travel_minutes>240 then raise exception 'invalid_travel_minutes'; end if;
  if p_category not in ('school','study','sport','health','social','family','other') then raise exception 'invalid_category'; end if;
  if p_sensitivity not in ('normal','private') then raise exception 'invalid_sensitivity'; end if;
  if v_location is not null and char_length(v_location)>240 then raise exception 'location_too_long'; end if;
  if v_notes is not null and char_length(v_notes)>2000 then raise exception 'notes_too_long'; end if;

  update after.calendar_events set
    student_id=p_student_id,category=p_category,title=v_title,starts_at=p_starts_at,
    ends_at=p_starts_at+make_interval(mins=>p_duration_minutes),travel_minutes=p_travel_minutes,
    location=v_location,notes=v_notes,sensitivity=p_sensitivity,updated_at=now()
  where id=p_event_id;
  return true;
end;
$$;

create or replace function public.after_update_school_item_v2(
  p_item_id uuid,
  p_type text,
  p_title text,
  p_description text default null,
  p_due_at timestamptz default null,
  p_priority text default 'normal',
  p_subject_name text default null,
  p_materials text[] default '{}'::text[],
  p_estimated_minutes integer default null
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item after.academic_items%rowtype;
  v_subject_id uuid;
  v_subject text := nullif(btrim(coalesce(p_subject_name,'')),'');
  v_title text := nullif(btrim(p_title),'');
  v_description text := nullif(btrim(coalesce(p_description,'')),'');
  v_material text;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select * into v_item from after.academic_items a
  where a.id=p_item_id and after_private.student_in_my_family(a.student_id) for update;
  if v_item.id is null then raise exception 'item_access_denied'; end if;
  if v_title is null or char_length(v_title)>180 then raise exception 'invalid_title'; end if;
  if p_type not in ('task','test','exam','project','material','school_event') then raise exception 'invalid_type'; end if;
  if p_priority not in ('low','normal','high','urgent') then raise exception 'invalid_priority'; end if;
  if p_estimated_minutes is not null and (p_estimated_minutes<5 or p_estimated_minutes>480) then raise exception 'invalid_estimated_minutes'; end if;
  if v_description is not null and char_length(v_description)>2000 then raise exception 'description_too_long'; end if;
  if v_subject is not null and char_length(v_subject)>100 then raise exception 'subject_too_long'; end if;

  if v_subject is not null then
    select s.id into v_subject_id from after.subjects s
    where s.student_id=v_item.student_id and lower(s.name)=lower(v_subject) limit 1;
    if v_subject_id is null then
      insert into after.subjects(student_id,name,active) values(v_item.student_id,v_subject,true) on conflict do nothing;
      select s.id into v_subject_id from after.subjects s
      where s.student_id=v_item.student_id and lower(s.name)=lower(v_subject) limit 1;
    end if;
  end if;

  update after.academic_items set
    type=p_type,title=v_title,description=v_description,due_at=p_due_at,priority=p_priority,
    subject_id=v_subject_id,estimated_minutes=p_estimated_minutes,updated_at=now()
  where id=p_item_id;

  delete from after.academic_materials where academic_item_id=p_item_id;
  foreach v_material in array coalesce(p_materials,'{}'::text[]) loop
    v_material := nullif(btrim(v_material),'');
    if v_material is not null and char_length(v_material)<=120 then
      insert into after.academic_materials(academic_item_id,student_id,name,created_by)
      values(p_item_id,v_item.student_id,v_material,auth.uid());
    end if;
  end loop;
  return true;
end;
$$;

create or replace function public.after_cancel_calendar_event(p_event_id uuid,p_cancelled boolean default true)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if not exists(select 1 from after.calendar_events e where e.id=p_event_id and after_private.is_family_member(e.family_id)) then
    raise exception 'event_access_denied';
  end if;
  update after.calendar_events set status=case when p_cancelled then 'cancelled' else 'scheduled' end,updated_at=now() where id=p_event_id;
  return found;
end;
$$;

create or replace function public.after_duplicate_activity(p_kind text,p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event after.calendar_events%rowtype;
  v_item after.academic_items%rowtype;
  v_new_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if p_kind='event' then
    select * into v_event from after.calendar_events e where e.id=p_id and after_private.is_family_member(e.family_id);
    if v_event.id is null then raise exception 'event_access_denied'; end if;
    insert into after.calendar_events(
      family_id,student_id,category,title,starts_at,ends_at,location,responsible_member_id,sensitivity,notes,created_by,
      status,travel_minutes,series_id,recurrence_rule,occurrence_index
    ) values (
      v_event.family_id,v_event.student_id,v_event.category,v_event.title,v_event.starts_at,v_event.ends_at,v_event.location,
      v_event.responsible_member_id,v_event.sensitivity,v_event.notes,auth.uid(),'scheduled',v_event.travel_minutes,null,'none',0
    ) returning id into v_new_id;
    return jsonb_build_object('kind','event','id',v_new_id);
  elsif p_kind='academic' then
    select * into v_item from after.academic_items a where a.id=p_id and after_private.student_in_my_family(a.student_id);
    if v_item.id is null then raise exception 'item_access_denied'; end if;
    insert into after.academic_items(
      student_id,subject_id,type,title,description,due_at,status,priority,source,created_by,estimated_minutes
    ) values (
      v_item.student_id,v_item.subject_id,v_item.type,v_item.title,v_item.description,v_item.due_at,'pending',v_item.priority,'manual',auth.uid(),v_item.estimated_minutes
    ) returning id into v_new_id;
    insert into after.academic_materials(academic_item_id,student_id,name,created_by)
    select v_new_id,m.student_id,m.name,auth.uid() from after.academic_materials m where m.academic_item_id=p_id;
    return jsonb_build_object('kind','academic','id',v_new_id);
  end if;
  raise exception 'invalid_activity_kind';
end;
$$;

create or replace function public.after_event_conflicts(p_days integer default 14)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with fam as (
    select fm.family_id from after.family_members fm join after.families f on f.id=fm.family_id
    where fm.user_id=auth.uid() and fm.status='active' and f.status='active'
    order by fm.created_at limit 1
  ), events as (
    select e.* from after.calendar_events e join fam on fam.family_id=e.family_id
    where e.status='scheduled' and e.student_id is not null
      and e.starts_at>=date_trunc('day',now())
      and e.starts_at<date_trunc('day',now())+make_interval(days=>greatest(1,least(coalesce(p_days,14),60)))
  ), overlaps as (
    select
      'overlap'::text conflict_type,a.student_id,a.id first_id,b.id second_id,
      a.title first_title,b.title second_title,b.starts_at conflict_at,
      'Estas actividades se superponen.'::text message
    from events a join events b on b.student_id=a.student_id and a.id<b.id
    where a.ends_at is not null and b.ends_at is not null
      and a.starts_at<b.ends_at and b.starts_at<a.ends_at
  ), travel as (
    select
      'travel'::text conflict_type,a.student_id,a.id first_id,b.id second_id,
      a.title first_title,b.title second_title,b.starts_at conflict_at,
      ('Faltan '||b.travel_minutes||' min de traslado antes de la siguiente actividad.')::text message
    from events a join events b on b.student_id=a.student_id and a.id<>b.id
    where a.ends_at is not null and b.travel_minutes>0 and a.ends_at<=b.starts_at
      and a.ends_at+make_interval(mins=>b.travel_minutes)>b.starts_at
      and not exists(
        select 1 from events c where c.student_id=a.student_id and c.starts_at>a.starts_at and c.starts_at<b.starts_at
      )
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'type',x.conflict_type,'student_id',x.student_id,'first_id',x.first_id,'second_id',x.second_id,
    'first_title',x.first_title,'second_title',x.second_title,'conflict_at',x.conflict_at,'message',x.message
  ) order by x.conflict_at),'[]'::jsonb)
  from (select * from overlaps union all select * from travel) x;
$$;

create or replace function public.after_agenda(p_days integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with fam as (
    select m.family_id from after.family_members m join after.families f on f.id=m.family_id
    where m.user_id=auth.uid() and m.status='active' and f.status='active'
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
    from after.academic_items a join after.students s on s.id=a.student_id join fam on fam.family_id=s.family_id
    where a.status in ('pending','in_progress')
      and (a.due_at is null or a.due_at<now()+make_interval(days=>greatest(1,least(coalesce(p_days,30),90))))
  )
  select coalesce(jsonb_agg(obj order by sort_at),'[]'::jsonb)
  from (select * from events union all select * from academics) x;
$$;

create or replace function public.after_school_overview()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with fam as (
    select fm.family_id from after.family_members fm join after.families f on f.id=fm.family_id
    where fm.user_id=auth.uid() and fm.status='active' and f.status='active'
    order by fm.created_at limit 1
  ), academic as (
    select a.*,s.family_id,coalesce(sub.name,'') subject_name
    from after.academic_items a join after.students s on s.id=a.student_id join fam on fam.family_id=s.family_id
    left join after.subjects sub on sub.id=a.subject_id
    where a.status in ('pending','in_progress')
  ), events as (
    select e.* from after.calendar_events e join fam on fam.family_id=e.family_id
    where e.status='scheduled'
      and e.starts_at>=date_trunc('day',now())
      and e.starts_at<date_trunc('day',now())+interval '8 days'
  )
  select jsonb_build_object(
    'overdue',coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind','academic','id',a.id,'student_id',a.student_id,'title',a.title,'category',a.type,'starts_at',a.due_at,
        'status',a.status,'priority',a.priority,'subject',a.subject_name,'estimated_minutes',a.estimated_minutes
      ) order by a.due_at) from academic a where a.due_at<date_trunc('day',now())
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

revoke all on function public.after_create_calendar_event_v2(uuid,uuid,text,text,timestamptz,integer,integer,text,text,text,text,integer) from public,anon;
revoke all on function public.after_create_school_item_v2(uuid,text,text,text,timestamptz,text,text,text[],integer) from public,anon;
revoke all on function public.after_activity_detail(text,uuid) from public,anon;
revoke all on function public.after_update_calendar_event_v2(uuid,uuid,text,text,timestamptz,integer,integer,text,text,text) from public,anon;
revoke all on function public.after_update_school_item_v2(uuid,text,text,text,timestamptz,text,text,text[],integer) from public,anon;
revoke all on function public.after_cancel_calendar_event(uuid,boolean) from public,anon;
revoke all on function public.after_duplicate_activity(text,uuid) from public,anon;
revoke all on function public.after_event_conflicts(integer) from public,anon;
revoke all on function public.after_agenda(integer) from public,anon;
revoke all on function public.after_school_overview() from public,anon;

grant execute on function public.after_create_calendar_event_v2(uuid,uuid,text,text,timestamptz,integer,integer,text,text,text,text,integer) to authenticated;
grant execute on function public.after_create_school_item_v2(uuid,text,text,text,timestamptz,text,text,text[],integer) to authenticated;
grant execute on function public.after_activity_detail(text,uuid) to authenticated;
grant execute on function public.after_update_calendar_event_v2(uuid,uuid,text,text,timestamptz,integer,integer,text,text,text) to authenticated;
grant execute on function public.after_update_school_item_v2(uuid,text,text,text,timestamptz,text,text,text[],integer) to authenticated;
grant execute on function public.after_cancel_calendar_event(uuid,boolean) to authenticated;
grant execute on function public.after_duplicate_activity(text,uuid) to authenticated;
grant execute on function public.after_event_conflicts(integer) to authenticated;
grant execute on function public.after_agenda(integer) to authenticated;
grant execute on function public.after_school_overview() to authenticated;
