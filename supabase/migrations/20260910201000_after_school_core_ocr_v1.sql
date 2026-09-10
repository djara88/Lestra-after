-- Lestra After — school core + OCR review pipeline v1
-- Additive migration: preserves the current app while introducing the new school-first product model.

alter table after.source_documents
  add column if not exists ocr_text text,
  add column if not exists ocr_provider text,
  add column if not exists ocr_processed_at timestamptz,
  add column if not exists ocr_error text;

alter table after.academic_items
  add column if not exists source_document_id uuid references after.source_documents(id) on delete set null;

alter table after.calendar_events
  add column if not exists source_document_id uuid references after.source_documents(id) on delete set null;

create table if not exists after.academic_materials (
  id uuid primary key default gen_random_uuid(),
  academic_item_id uuid not null references after.academic_items(id) on delete cascade,
  student_id uuid not null references after.students(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  packed boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table after.academic_materials enable row level security;
revoke all on after.academic_materials from anon, authenticated;

create unique index if not exists after_subjects_student_name_ci_uidx
  on after.subjects(student_id, lower(name));
create index if not exists after_academic_items_due_student_idx
  on after.academic_items(student_id, due_at) where status in ('pending','in_progress');
create index if not exists after_academic_materials_item_idx
  on after.academic_materials(academic_item_id);
create index if not exists after_academic_materials_student_packed_idx
  on after.academic_materials(student_id, packed);
create index if not exists after_document_candidates_source_status_idx
  on after.document_candidates(source_document_id, status);

create or replace function public.after_create_school_item(
  p_student_id uuid,
  p_type text,
  p_title text,
  p_description text default null,
  p_due_at timestamptz default null,
  p_priority text default 'normal',
  p_subject_name text default null,
  p_materials text[] default '{}'::text[],
  p_source_document_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_subject_id uuid;
  v_title text := nullif(btrim(p_title), '');
  v_description text := nullif(btrim(coalesce(p_description,'')), '');
  v_subject text := nullif(btrim(coalesce(p_subject_name,'')), '');
  v_material text;
  v_source text := case when p_source_document_id is null then 'manual' else 'document' end;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if not after_private.student_in_my_family(p_student_id) then raise exception 'student_access_denied'; end if;
  if v_title is null or char_length(v_title) > 180 then raise exception 'invalid_title'; end if;
  if p_type not in ('task','test','exam','project','material','school_event') then raise exception 'invalid_type'; end if;
  if p_priority not in ('low','normal','high','urgent') then raise exception 'invalid_priority'; end if;
  if v_description is not null and char_length(v_description) > 2000 then raise exception 'description_too_long'; end if;
  if v_subject is not null and char_length(v_subject) > 100 then raise exception 'subject_too_long'; end if;

  if p_source_document_id is not null and not exists (
    select 1 from after.source_documents d
    where d.id = p_source_document_id
      and d.uploaded_by = auth.uid()
      and after_private.is_family_member(d.family_id)
      and (d.student_id is null or d.student_id = p_student_id)
  ) then
    raise exception 'source_document_access_denied';
  end if;

  if v_subject is not null then
    select s.id into v_subject_id
    from after.subjects s
    where s.student_id = p_student_id and lower(s.name) = lower(v_subject)
    limit 1;

    if v_subject_id is null then
      insert into after.subjects(student_id,name,active)
      values(p_student_id,v_subject,true)
      on conflict do nothing;
      select s.id into v_subject_id
      from after.subjects s
      where s.student_id = p_student_id and lower(s.name) = lower(v_subject)
      limit 1;
    end if;
  end if;

  insert into after.academic_items(
    student_id,subject_id,type,title,description,due_at,status,priority,source,source_document_id,created_by
  ) values (
    p_student_id,v_subject_id,p_type,v_title,v_description,p_due_at,'pending',p_priority,v_source,p_source_document_id,auth.uid()
  ) returning id into v_id;

  foreach v_material in array coalesce(p_materials,'{}'::text[]) loop
    v_material := nullif(btrim(v_material), '');
    if v_material is not null and char_length(v_material) <= 120 then
      insert into after.academic_materials(academic_item_id,student_id,name,created_by)
      values(v_id,p_student_id,v_material,auth.uid());
    end if;
  end loop;

  return v_id;
end;
$$;

create or replace function public.after_update_academic_status(p_item_id uuid, p_status text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if p_status not in ('pending','in_progress','done','cancelled') then raise exception 'invalid_status'; end if;
  if not exists (
    select 1 from after.academic_items a
    where a.id=p_item_id and after_private.student_in_my_family(a.student_id)
  ) then raise exception 'item_access_denied'; end if;

  update after.academic_items set status=p_status, updated_at=now() where id=p_item_id;
  return found;
end;
$$;

create or replace function public.after_set_material_packed(p_material_id uuid, p_packed boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if not exists (
    select 1 from after.academic_materials m
    where m.id=p_material_id and after_private.student_in_my_family(m.student_id)
  ) then raise exception 'material_access_denied'; end if;

  update after.academic_materials
  set packed=coalesce(p_packed,false), updated_at=now()
  where id=p_material_id;
  return found;
end;
$$;

create or replace function public.after_school_overview()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with fam as (
    select fm.family_id
    from after.family_members fm
    join after.families f on f.id=fm.family_id
    where fm.user_id=auth.uid() and fm.status='active' and f.status='active'
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
        'id',a.id,'student_id',a.student_id,'title',a.title,'type',a.type,'due_at',a.due_at,
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
        'id',a.id,'student_id',a.student_id,'title',a.title,'type',a.type,'due_at',a.due_at,
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

create or replace function public.after_claim_source_document_for_ocr(p_document_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_doc after.source_documents%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;

  select * into v_doc
  from after.source_documents d
  where d.id=p_document_id
    and d.uploaded_by=auth.uid()
    and after_private.is_family_member(d.family_id)
  for update;

  if v_doc.id is null then raise exception 'document_access_denied'; end if;

  update after.source_documents
  set processing_status='processing', ocr_error=null
  where id=v_doc.id;

  return jsonb_build_object(
    'id',v_doc.id,'family_id',v_doc.family_id,'student_id',v_doc.student_id,
    'storage_path',v_doc.storage_path,'original_name',v_doc.original_name,
    'mime_type',v_doc.mime_type,'size_bytes',v_doc.size_bytes
  );
end;
$$;

create or replace function public.after_save_ocr_result(
  p_document_id uuid,
  p_ocr_text text,
  p_provider text,
  p_candidates jsonb
) returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_doc after.source_documents%rowtype;
  v_candidate jsonb;
  v_count integer := 0;
  v_type text;
  v_title text;
  v_description text;
  v_conf numeric;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if p_ocr_text is null or char_length(p_ocr_text) > 50000 then raise exception 'invalid_ocr_text'; end if;
  if jsonb_typeof(coalesce(p_candidates,'[]'::jsonb)) <> 'array' then raise exception 'invalid_candidates'; end if;

  select * into v_doc
  from after.source_documents d
  where d.id=p_document_id
    and d.uploaded_by=auth.uid()
    and after_private.is_family_member(d.family_id)
  for update;

  if v_doc.id is null then raise exception 'document_access_denied'; end if;

  delete from after.document_candidates c
  where c.source_document_id=v_doc.id and c.status='pending';

  for v_candidate in select value from jsonb_array_elements(coalesce(p_candidates,'[]'::jsonb)) loop
    v_type := coalesce(v_candidate->>'candidate_type','note');
    if v_type not in ('academic_item','calendar_event','material','payment','note') then
      v_type := 'note';
    end if;
    v_title := left(nullif(btrim(coalesce(v_candidate->>'title','')),''),180);
    if v_title is null then continue; end if;
    v_description := left(nullif(btrim(coalesce(v_candidate->>'description','')),''),2000);
    begin
      v_conf := nullif(v_candidate->>'confidence','')::numeric;
    exception when others then
      v_conf := null;
    end;
    if v_conf is not null then v_conf := greatest(0,least(1,v_conf)); end if;

    insert into after.document_candidates(
      family_id,student_id,source_document_id,candidate_type,title,description,
      starts_at,due_at,extracted_payload,confidence,status
    ) values (
      v_doc.family_id,v_doc.student_id,v_doc.id,v_type,v_title,v_description,
      case when coalesce(v_candidate->>'starts_at','') ~ '^\\d{4}-\\d{2}-\\d{2}T' then (v_candidate->>'starts_at')::timestamptz else null end,
      case when coalesce(v_candidate->>'due_at','') ~ '^\\d{4}-\\d{2}-\\d{2}T' then (v_candidate->>'due_at')::timestamptz else null end,
      v_candidate, v_conf, 'pending'
    );
    v_count := v_count + 1;
  end loop;

  update after.source_documents
  set ocr_text=p_ocr_text,
      ocr_provider=left(coalesce(p_provider,'ocr'),80),
      ocr_processed_at=now(),
      ocr_error=null,
      processing_status='ready'
  where id=v_doc.id;

  return v_count;
end;
$$;

create or replace function public.after_mark_ocr_failed(p_document_id uuid, p_error text default null)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  update after.source_documents d
  set processing_status='failed',
      ocr_error=left(coalesce(nullif(btrim(p_error),''),'No fue posible leer el documento.'),500)
  where d.id=p_document_id
    and d.uploaded_by=auth.uid()
    and after_private.is_family_member(d.family_id);
  return found;
end;
$$;

create or replace function public.after_document_review(p_document_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((
    select jsonb_build_object(
      'document',jsonb_build_object(
        'id',d.id,'student_id',d.student_id,'original_name',d.original_name,
        'processing_status',d.processing_status,'ocr_text',d.ocr_text,'ocr_error',d.ocr_error,
        'ocr_processed_at',d.ocr_processed_at
      ),
      'candidates',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',c.id,'candidate_type',c.candidate_type,'title',c.title,'description',c.description,
          'starts_at',c.starts_at,'due_at',c.due_at,'confidence',c.confidence,
          'status',c.status,'payload',c.extracted_payload
        ) order by c.created_at)
        from after.document_candidates c
        where c.source_document_id=d.id
      ),'[]'::jsonb)
    )
    from after.source_documents d
    where d.id=p_document_id
      and d.uploaded_by=auth.uid()
      and after_private.is_family_member(d.family_id)
  ),'{}'::jsonb);
$$;

create or replace function public.after_accept_document_candidate(p_candidate_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c after.document_candidates%rowtype;
  v_doc after.source_documents%rowtype;
  v_id uuid;
  v_academic_type text;
  v_subject text;
  v_materials text[] := '{}'::text[];
  v_priority text;
  v_start timestamptz;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;

  select c.* into v_c
  from after.document_candidates c
  where c.id=p_candidate_id and c.status='pending'
  for update;
  if v_c.id is null then raise exception 'candidate_not_available'; end if;

  select * into v_doc from after.source_documents d
  where d.id=v_c.source_document_id
    and d.uploaded_by=auth.uid()
    and after_private.is_family_member(d.family_id);
  if v_doc.id is null then raise exception 'candidate_access_denied'; end if;
  if v_c.student_id is null then raise exception 'candidate_student_required'; end if;

  if v_c.candidate_type in ('academic_item','material') then
    v_academic_type := coalesce(v_c.extracted_payload->>'academic_type', case when v_c.candidate_type='material' then 'material' else 'task' end);
    if v_academic_type not in ('task','test','exam','project','material','school_event') then v_academic_type := 'task'; end if;
    v_subject := nullif(btrim(coalesce(v_c.extracted_payload->>'subject','')), '');
    v_priority := coalesce(v_c.extracted_payload->>'priority','normal');
    if v_priority not in ('low','normal','high','urgent') then v_priority := 'normal'; end if;
    if jsonb_typeof(v_c.extracted_payload->'materials')='array' then
      select coalesce(array_agg(left(btrim(value),120)) filter(where btrim(value)<>''),'{}'::text[])
      into v_materials
      from jsonb_array_elements_text(v_c.extracted_payload->'materials');
    end if;

    v_id := public.after_create_school_item(
      v_c.student_id,v_academic_type,v_c.title,v_c.description,v_c.due_at,v_priority,
      v_subject,v_materials,v_doc.id
    );
  elsif v_c.candidate_type='calendar_event' then
    v_start := coalesce(v_c.starts_at,v_c.due_at);
    if v_start is null then raise exception 'candidate_date_required'; end if;
    insert into after.calendar_events(
      family_id,student_id,category,title,starts_at,ends_at,location,sensitivity,notes,source_document_id,created_by
    ) values (
      v_doc.family_id,v_c.student_id,'school',v_c.title,v_start,null,null,'normal',v_c.description,v_doc.id,auth.uid()
    ) returning id into v_id;
  else
    raise exception 'candidate_requires_manual_review';
  end if;

  update after.document_candidates
  set status='accepted', reviewed_by=auth.uid(), reviewed_at=now()
  where id=v_c.id;

  if not exists(select 1 from after.document_candidates c where c.source_document_id=v_doc.id and c.status='pending') then
    update after.source_documents set processing_status='reviewed' where id=v_doc.id;
  end if;

  return v_id;
end;
$$;

create or replace function public.after_reject_document_candidate(p_candidate_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;

  select c.source_document_id into v_document_id
  from after.document_candidates c
  join after.source_documents d on d.id=c.source_document_id
  where c.id=p_candidate_id
    and c.status='pending'
    and d.uploaded_by=auth.uid()
    and after_private.is_family_member(d.family_id)
  for update of c;

  if v_document_id is null then raise exception 'candidate_access_denied'; end if;

  update after.document_candidates
  set status='rejected', reviewed_by=auth.uid(), reviewed_at=now()
  where id=p_candidate_id;

  if not exists(select 1 from after.document_candidates c where c.source_document_id=v_document_id and c.status='pending') then
    update after.source_documents set processing_status='reviewed' where id=v_document_id;
  end if;
  return true;
end;
$$;

create or replace function public.after_source_documents()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',d.id,
    'student_id',d.student_id,
    'student_name',coalesce(s.preferred_name,s.first_name),
    'original_name',d.original_name,
    'mime_type',d.mime_type,
    'size_bytes',d.size_bytes,
    'processing_status',d.processing_status,
    'ocr_error',d.ocr_error,
    'ocr_excerpt',case when d.ocr_text is null then null else left(d.ocr_text,240) end,
    'candidate_count',(select count(*) from after.document_candidates c where c.source_document_id=d.id and c.status='pending'),
    'created_at',d.created_at
  ) order by d.created_at desc),'[]'::jsonb)
  from after.source_documents d
  left join after.students s on s.id=d.student_id
  where after_private.is_family_member(d.family_id)
    and d.uploaded_by=auth.uid();
$$;

revoke all on function public.after_create_school_item(uuid,text,text,text,timestamptz,text,text,text[],uuid) from public, anon;
revoke all on function public.after_update_academic_status(uuid,text) from public, anon;
revoke all on function public.after_set_material_packed(uuid,boolean) from public, anon;
revoke all on function public.after_school_overview() from public, anon;
revoke all on function public.after_claim_source_document_for_ocr(uuid) from public, anon;
revoke all on function public.after_save_ocr_result(uuid,text,text,jsonb) from public, anon;
revoke all on function public.after_mark_ocr_failed(uuid,text) from public, anon;
revoke all on function public.after_document_review(uuid) from public, anon;
revoke all on function public.after_accept_document_candidate(uuid) from public, anon;
revoke all on function public.after_reject_document_candidate(uuid) from public, anon;

grant execute on function public.after_create_school_item(uuid,text,text,text,timestamptz,text,text,text[],uuid) to authenticated;
grant execute on function public.after_update_academic_status(uuid,text) to authenticated;
grant execute on function public.after_set_material_packed(uuid,boolean) to authenticated;
grant execute on function public.after_school_overview() to authenticated;
grant execute on function public.after_claim_source_document_for_ocr(uuid) to authenticated;
grant execute on function public.after_save_ocr_result(uuid,text,text,jsonb) to authenticated;
grant execute on function public.after_mark_ocr_failed(uuid,text) to authenticated;
grant execute on function public.after_document_review(uuid) to authenticated;
grant execute on function public.after_accept_document_candidate(uuid) to authenticated;
grant execute on function public.after_reject_document_candidate(uuid) to authenticated;
