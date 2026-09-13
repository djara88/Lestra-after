-- Lestra After — school timetable + daily backpack routine v1
-- Additive: weekly class schedule, permanent materials per subject and per-day packing state.

create table if not exists after.school_schedule_entries (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references after.students(id) on delete cascade,
  subject_id uuid not null references after.subjects(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  period_order smallint not null check (period_order between 1 and 20),
  start_time time without time zone,
  end_time time without time zone,
  room text,
  notes text,
  active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_schedule_time_order check (start_time is null or end_time is null or end_time > start_time),
  constraint school_schedule_room_length check (room is null or char_length(room) <= 80),
  constraint school_schedule_notes_length check (notes is null or char_length(notes) <= 500)
);

create unique index if not exists school_schedule_student_day_period_uidx
  on after.school_schedule_entries(student_id, weekday, period_order)
  where active;
create index if not exists school_schedule_student_weekday_idx
  on after.school_schedule_entries(student_id, weekday, period_order)
  where active;

create table if not exists after.subject_backpack_items (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references after.students(id) on delete cascade,
  subject_id uuid not null references after.subjects(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists subject_backpack_items_name_uidx
  on after.subject_backpack_items(student_id, subject_id, lower(name));
create index if not exists subject_backpack_items_subject_idx
  on after.subject_backpack_items(subject_id)
  where active;

create table if not exists after.backpack_daily_checks (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references after.students(id) on delete cascade,
  target_date date not null,
  item_key text not null check (char_length(item_key) between 3 and 180),
  packed boolean not null default false,
  packed_by uuid references auth.users(id) on delete set null,
  packed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(student_id, target_date, item_key)
);
create index if not exists backpack_daily_checks_student_date_idx
  on after.backpack_daily_checks(student_id, target_date);

alter table after.school_schedule_entries enable row level security;
alter table after.subject_backpack_items enable row level security;
alter table after.backpack_daily_checks enable row level security;

revoke all on after.school_schedule_entries from anon, authenticated;
revoke all on after.subject_backpack_items from anon, authenticated;
revoke all on after.backpack_daily_checks from anon, authenticated;

create policy school_schedule_family_select on after.school_schedule_entries
  for select to authenticated
  using (after_private.student_in_my_family(student_id));
create policy school_schedule_family_insert on after.school_schedule_entries
  for insert to authenticated
  with check (after_private.student_in_my_family(student_id) and created_by = (select auth.uid()));
create policy school_schedule_family_update on after.school_schedule_entries
  for update to authenticated
  using (after_private.student_in_my_family(student_id))
  with check (after_private.student_in_my_family(student_id));
create policy school_schedule_family_delete on after.school_schedule_entries
  for delete to authenticated
  using (after_private.student_in_my_family(student_id));

create policy subject_backpack_family_select on after.subject_backpack_items
  for select to authenticated
  using (after_private.student_in_my_family(student_id));
create policy subject_backpack_family_insert on after.subject_backpack_items
  for insert to authenticated
  with check (after_private.student_in_my_family(student_id) and created_by = (select auth.uid()));
create policy subject_backpack_family_update on after.subject_backpack_items
  for update to authenticated
  using (after_private.student_in_my_family(student_id))
  with check (after_private.student_in_my_family(student_id));
create policy subject_backpack_family_delete on after.subject_backpack_items
  for delete to authenticated
  using (after_private.student_in_my_family(student_id));

create policy backpack_checks_family_select on after.backpack_daily_checks
  for select to authenticated
  using (after_private.student_in_my_family(student_id));
create policy backpack_checks_family_insert on after.backpack_daily_checks
  for insert to authenticated
  with check (after_private.student_in_my_family(student_id));
create policy backpack_checks_family_update on after.backpack_daily_checks
  for update to authenticated
  using (after_private.student_in_my_family(student_id))
  with check (after_private.student_in_my_family(student_id));
create policy backpack_checks_family_delete on after.backpack_daily_checks
  for delete to authenticated
  using (after_private.student_in_my_family(student_id));

create or replace function public.after_save_school_schedule_entry(
  p_entry_id uuid,
  p_student_id uuid,
  p_weekday integer,
  p_period_order integer,
  p_subject_name text,
  p_start_time time without time zone default null,
  p_end_time time without time zone default null,
  p_room text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject_id uuid;
  v_entry_id uuid;
  v_subject_name text := nullif(btrim(coalesce(p_subject_name,'')), '');
  v_room text := nullif(btrim(coalesce(p_room,'')), '');
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if not after_private.student_in_my_family(p_student_id) then raise exception 'student_access_denied'; end if;
  if p_weekday < 1 or p_weekday > 7 then raise exception 'invalid_weekday'; end if;
  if p_period_order < 1 or p_period_order > 20 then raise exception 'invalid_period_order'; end if;
  if v_subject_name is null or char_length(v_subject_name) > 100 then raise exception 'invalid_subject'; end if;
  if v_room is not null and char_length(v_room) > 80 then raise exception 'room_too_long'; end if;
  if p_start_time is not null and p_end_time is not null and p_end_time <= p_start_time then raise exception 'invalid_time_range'; end if;

  select s.id into v_subject_id
  from after.subjects s
  where s.student_id = p_student_id and lower(s.name) = lower(v_subject_name)
  limit 1;

  if v_subject_id is null then
    insert into after.subjects(student_id, name, active)
    values(p_student_id, v_subject_name, true)
    on conflict do nothing;
    select s.id into v_subject_id
    from after.subjects s
    where s.student_id = p_student_id and lower(s.name) = lower(v_subject_name)
    limit 1;
  end if;

  if p_entry_id is null then
    insert into after.school_schedule_entries(
      student_id, subject_id, weekday, period_order, start_time, end_time, room, created_by
    ) values (
      p_student_id, v_subject_id, p_weekday, p_period_order, p_start_time, p_end_time, v_room, auth.uid()
    ) returning id into v_entry_id;
  else
    if not exists (
      select 1 from after.school_schedule_entries e
      where e.id = p_entry_id and e.student_id = p_student_id and after_private.student_in_my_family(e.student_id)
    ) then raise exception 'schedule_entry_access_denied'; end if;

    update after.school_schedule_entries
    set subject_id = v_subject_id,
        weekday = p_weekday,
        period_order = p_period_order,
        start_time = p_start_time,
        end_time = p_end_time,
        room = v_room,
        active = true,
        updated_at = now()
    where id = p_entry_id
    returning id into v_entry_id;
  end if;

  return v_entry_id;
end;
$$;

create or replace function public.after_delete_school_schedule_entry(p_entry_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if not exists (
    select 1 from after.school_schedule_entries e
    where e.id = p_entry_id and after_private.student_in_my_family(e.student_id)
  ) then raise exception 'schedule_entry_access_denied'; end if;

  delete from after.school_schedule_entries where id = p_entry_id;
  return found;
end;
$$;

create or replace function public.after_set_subject_backpack_items(
  p_student_id uuid,
  p_subject_id uuid,
  p_items text[]
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item text;
  v_count integer := 0;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if not after_private.student_in_my_family(p_student_id) then raise exception 'student_access_denied'; end if;
  if not exists(select 1 from after.subjects s where s.id=p_subject_id and s.student_id=p_student_id) then raise exception 'subject_access_denied'; end if;

  delete from after.subject_backpack_items
  where student_id=p_student_id and subject_id=p_subject_id;

  foreach v_item in array coalesce(p_items,'{}'::text[]) loop
    v_item := nullif(btrim(v_item),'');
    if v_item is not null and char_length(v_item) <= 120 then
      insert into after.subject_backpack_items(student_id, subject_id, name, created_by)
      values(p_student_id, p_subject_id, v_item, auth.uid())
      on conflict do nothing;
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

create or replace function public.after_toggle_backpack_item(
  p_student_id uuid,
  p_target_date date,
  p_item_key text,
  p_packed boolean
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if not after_private.student_in_my_family(p_student_id) then raise exception 'student_access_denied'; end if;
  if p_target_date < current_date - 14 or p_target_date > current_date + 60 then raise exception 'date_out_of_range'; end if;
  if p_item_key is null or char_length(p_item_key) < 3 or char_length(p_item_key) > 180 then raise exception 'invalid_item_key'; end if;

  insert into after.backpack_daily_checks(student_id,target_date,item_key,packed,packed_by,packed_at,updated_at)
  values(
    p_student_id,p_target_date,p_item_key,coalesce(p_packed,false),
    case when coalesce(p_packed,false) then auth.uid() else null end,
    case when coalesce(p_packed,false) then now() else null end,
    now()
  )
  on conflict(student_id,target_date,item_key) do update
  set packed=excluded.packed,
      packed_by=excluded.packed_by,
      packed_at=excluded.packed_at,
      updated_at=now();
  return true;
end;
$$;

create or replace function public.after_backpack_workspace(
  p_student_id uuid,
  p_target_date date default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_target date;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if not after_private.student_in_my_family(p_student_id) then raise exception 'student_access_denied'; end if;

  if p_target_date is not null then
    v_target := p_target_date;
  else
    select d::date into v_target
    from generate_series(current_date + 1, current_date + 7, interval '1 day') d
    where exists (
      select 1 from after.school_schedule_entries e
      where e.student_id=p_student_id and e.active and e.weekday=extract(isodow from d)::integer
    )
    order by d
    limit 1;
    v_target := coalesce(v_target,current_date + 1);
  end if;

  with student as (
    select s.id,s.first_name,s.preferred_name,s.school_name,s.grade_level
    from after.students s where s.id=p_student_id
  ), schedule as (
    select e.id,e.weekday,e.period_order,e.start_time,e.end_time,e.room,
           sub.id subject_id,sub.name subject_name
    from after.school_schedule_entries e
    join after.subjects sub on sub.id=e.subject_id
    where e.student_id=p_student_id and e.active
  ), classes as (
    select * from schedule where weekday=extract(isodow from v_target)::integer
  ), permanent_items as (
    select
      'subject:'||bi.id::text item_key,
      bi.id source_id,
      'subject'::text source_type,
      bi.name,
      bi.subject_id,
      sub.name subject_name,
      null::uuid academic_item_id
    from after.subject_backpack_items bi
    join after.subjects sub on sub.id=bi.subject_id
    where bi.student_id=p_student_id and bi.active
      and exists(select 1 from classes c where c.subject_id=bi.subject_id)
  ), academic_items as (
    select
      'academic:'||m.id::text item_key,
      m.id source_id,
      'academic'::text source_type,
      m.name,
      a.subject_id,
      coalesce(sub.name,'Pendiente escolar') subject_name,
      a.id academic_item_id
    from after.academic_materials m
    join after.academic_items a on a.id=m.academic_item_id
    left join after.subjects sub on sub.id=a.subject_id
    where m.student_id=p_student_id
      and a.status in ('pending','in_progress')
      and a.due_at is not null
      and (a.due_at at time zone 'America/Santiago')::date=v_target
  ), items as (
    select * from permanent_items
    union all
    select * from academic_items
  )
  select jsonb_build_object(
    'student',coalesce((select to_jsonb(s) from student s),'{}'::jsonb),
    'target_date',v_target,
    'target_weekday',extract(isodow from v_target)::integer,
    'schedule',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',s.id,'weekday',s.weekday,'period_order',s.period_order,'start_time',s.start_time,
        'end_time',s.end_time,'room',s.room,'subject_id',s.subject_id,'subject_name',s.subject_name
      ) order by s.weekday,s.period_order) from schedule s
    ),'[]'::jsonb),
    'classes',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',c.id,'period_order',c.period_order,'start_time',c.start_time,'end_time',c.end_time,
        'room',c.room,'subject_id',c.subject_id,'subject_name',c.subject_name
      ) order by c.period_order) from classes c
    ),'[]'::jsonb),
    'subjects',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',sub.id,'name',sub.name,
        'items',coalesce((select jsonb_agg(jsonb_build_object('id',bi.id,'name',bi.name) order by bi.created_at)
                          from after.subject_backpack_items bi
                          where bi.student_id=p_student_id and bi.subject_id=sub.id and bi.active),'[]'::jsonb)
      ) order by sub.name)
      from after.subjects sub
      where sub.student_id=p_student_id and sub.active
    ),'[]'::jsonb),
    'checklist',coalesce((
      select jsonb_agg(jsonb_build_object(
        'item_key',i.item_key,'source_id',i.source_id,'source_type',i.source_type,'name',i.name,
        'subject_id',i.subject_id,'subject_name',i.subject_name,'academic_item_id',i.academic_item_id,
        'packed',coalesce(ch.packed,false)
      ) order by i.subject_name,i.source_type,i.name)
      from items i
      left join after.backpack_daily_checks ch
        on ch.student_id=p_student_id and ch.target_date=v_target and ch.item_key=i.item_key
    ),'[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.after_save_school_schedule_entry(uuid,uuid,integer,integer,text,time without time zone,time without time zone,text) from public, anon;
revoke all on function public.after_delete_school_schedule_entry(uuid) from public, anon;
revoke all on function public.after_set_subject_backpack_items(uuid,uuid,text[]) from public, anon;
revoke all on function public.after_toggle_backpack_item(uuid,date,text,boolean) from public, anon;
revoke all on function public.after_backpack_workspace(uuid,date) from public, anon;

grant execute on function public.after_save_school_schedule_entry(uuid,uuid,integer,integer,text,time without time zone,time without time zone,text) to authenticated;
grant execute on function public.after_delete_school_schedule_entry(uuid) to authenticated;
grant execute on function public.after_set_subject_backpack_items(uuid,uuid,text[]) to authenticated;
grant execute on function public.after_toggle_backpack_item(uuid,date,text,boolean) to authenticated;
grant execute on function public.after_backpack_workspace(uuid,date) to authenticated;
