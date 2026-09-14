alter table after.students add column if not exists relationship_label text;
alter table after.students drop constraint if exists students_relationship_label_check;
alter table after.students add constraint students_relationship_label_check check (relationship_label is null or char_length(relationship_label) between 1 and 40);

create or replace function public.after_create_student(
  p_family_id uuid,
  p_first_name text,
  p_preferred_name text default null,
  p_birth_date date default null,
  p_school_name text default null,
  p_grade_level text default null,
  p_relationship_label text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_first text := nullif(btrim(p_first_name),'');
  v_preferred text := nullif(btrim(p_preferred_name),'');
  v_school text := nullif(btrim(p_school_name),'');
  v_grade text := nullif(btrim(p_grade_level),'');
  v_relationship text := nullif(btrim(p_relationship_label),'');
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if not after_private.is_family_member(p_family_id) then raise exception 'family_access_denied'; end if;
  if v_first is null or char_length(v_first) > 80 then raise exception 'invalid_first_name'; end if;
  if v_preferred is not null and char_length(v_preferred) > 80 then raise exception 'invalid_preferred_name'; end if;
  if v_school is not null and char_length(v_school) > 160 then raise exception 'invalid_school_name'; end if;
  if v_grade is not null and char_length(v_grade) > 80 then raise exception 'invalid_grade_level'; end if;
  if v_relationship is not null and char_length(v_relationship) > 40 then raise exception 'invalid_relationship_label'; end if;
  if p_birth_date is not null and p_birth_date > current_date then raise exception 'invalid_birth_date'; end if;
  insert into after.students(family_id,first_name,preferred_name,birth_date,school_name,grade_level,relationship_label)
  values(p_family_id,v_first,v_preferred,p_birth_date,v_school,v_grade,v_relationship)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.after_update_student_identity(
  p_student_id uuid,
  p_preferred_name text default null,
  p_relationship_label text default null,
  p_school_name text default null,
  p_grade_level text default null
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_preferred text := nullif(btrim(coalesce(p_preferred_name,'')),'');
  v_relationship text := nullif(btrim(coalesce(p_relationship_label,'')),'');
  v_school text := nullif(btrim(coalesce(p_school_name,'')),'');
  v_grade text := nullif(btrim(coalesce(p_grade_level,'')),'');
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if not after_private.student_in_my_family(p_student_id) then raise exception 'student_access_denied'; end if;
  if v_preferred is not null and char_length(v_preferred) > 80 then raise exception 'invalid_preferred_name'; end if;
  if v_relationship is not null and char_length(v_relationship) > 40 then raise exception 'invalid_relationship_label'; end if;
  if v_school is not null and char_length(v_school) > 160 then raise exception 'invalid_school_name'; end if;
  if v_grade is not null and char_length(v_grade) > 80 then raise exception 'invalid_grade_level'; end if;
  update after.students set preferred_name=v_preferred, relationship_label=v_relationship, school_name=v_school, grade_level=v_grade, updated_at=now() where id=p_student_id;
  return found;
end;
$$;

create or replace function public.after_my_context()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select coalesce((
    select jsonb_build_object(
      'family_id', f.id,
      'family_name', f.name,
      'member_id', m.id,
      'member_role', m.role,
      'display_name', m.display_name,
      'students', coalesce((select jsonb_agg(jsonb_build_object(
        'id',s.id,'first_name',s.first_name,'preferred_name',s.preferred_name,'relationship_label',s.relationship_label,'school_name',s.school_name,'grade_level',s.grade_level
      ) order by s.created_at) from after.students s where s.family_id=f.id and s.status='active'),'[]'::jsonb)
    )
    from after.family_members m join after.families f on f.id=m.family_id
    where m.user_id=auth.uid() and m.status='active' and f.status='active'
    order by m.created_at limit 1
  ), '{}'::jsonb);
$$;

create or replace function public.after_family_workspace()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select fm.family_id from after.family_members fm join after.families f on f.id=fm.family_id
    where fm.user_id=auth.uid() and fm.status='active' and f.status='active'
    order by fm.created_at limit 1
  )
  select coalesce((select jsonb_build_object(
    'family_id',m.family_id,
    'members',coalesce((select jsonb_agg(jsonb_build_object('id',fm.id,'display_name',fm.display_name,'role',fm.role,'is_me',fm.user_id=auth.uid()) order by fm.created_at) from after.family_members fm where fm.family_id=m.family_id and fm.status='active'),'[]'::jsonb),
    'students',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',coalesce(s.preferred_name,s.first_name),'first_name',s.first_name,'preferred_name',s.preferred_name,'relationship_label',s.relationship_label,'school_name',s.school_name,'grade_level',s.grade_level) order by s.created_at) from after.students s where s.family_id=m.family_id and s.status='active'),'[]'::jsonb),
    'responsibilities',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'student_id',r.student_id,'assigned_member_id',r.assigned_member_id,'title',r.title,'status',r.status,'created_at',r.created_at,'assigned_name',fm.display_name) order by r.created_at desc) from after.responsibilities r left join after.family_members fm on fm.id=r.assigned_member_id and fm.family_id=r.family_id where r.family_id=m.family_id and r.status<>'completed'),'[]'::jsonb)
  ) from mine m), '{}'::jsonb);
$$;

grant execute on function public.after_create_student(uuid,text,text,date,text,text,text) to authenticated;
grant execute on function public.after_update_student_identity(uuid,text,text,text,text) to authenticated;
grant execute on function public.after_my_context() to authenticated;
grant execute on function public.after_family_workspace() to authenticated;
