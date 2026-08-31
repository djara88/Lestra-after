-- Platform-level account suspension for Lestra After.
-- A paused family loses access through the same helpers used by RLS.

create or replace function after_private.is_family_member(p_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from after.family_members fm
    join after.families f on f.id = fm.family_id
    where fm.family_id = p_family_id
      and fm.user_id = (select auth.uid())
      and fm.status = 'active'
      and f.status = 'active'
  );
$$;

create or replace function after_private.is_family_owner(p_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from after.family_members fm
    join after.families f on f.id = fm.family_id
    where fm.family_id = p_family_id
      and fm.user_id = (select auth.uid())
      and fm.status = 'active'
      and fm.role = 'owner'
      and f.status = 'active'
  );
$$;

create or replace function after_private.student_in_my_family(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from after.students s
    join after.families f on f.id = s.family_id
    join after.family_members fm on fm.family_id = s.family_id
    where s.id = p_student_id
      and fm.user_id = (select auth.uid())
      and fm.status = 'active'
      and f.status = 'active'
  );
$$;

create or replace function public.after_dashboard()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with fam as (
    select m.family_id
    from after.family_members m
    join after.families f on f.id = m.family_id
    where m.user_id = (select auth.uid())
      and m.status = 'active'
      and f.status = 'active'
    order by m.created_at
    limit 1
  )
  select jsonb_build_object(
    'students_total',(select count(*) from after.students s join fam on fam.family_id=s.family_id where s.status='active'),
    'events_next_7_days',(select count(*) from after.calendar_events e join fam on fam.family_id=e.family_id where e.starts_at>=now() and e.starts_at<now()+interval '7 days'),
    'pending_academic',(select count(*) from after.academic_items a join after.students s on s.id=a.student_id join fam on fam.family_id=s.family_id where a.status='pending'),
    'pending_responsibilities',(select count(*) from after.responsibilities r join fam on fam.family_id=r.family_id where r.status in ('unassigned','proposed')),
    'upcoming',coalesce((select jsonb_agg(x.obj) from (select jsonb_build_object('id',e.id,'title',e.title,'category',e.category,'starts_at',e.starts_at,'student_id',e.student_id) obj from after.calendar_events e join fam on fam.family_id=e.family_id where e.starts_at>=now() order by e.starts_at limit 8) x),'[]'::jsonb)
  );
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
    join after.families f on f.id = fm.family_id
    where fm.user_id = (select auth.uid())
      and fm.status = 'active'
      and f.status = 'active'
    order by fm.created_at
    limit 1
  )
  select coalesce((
    select jsonb_build_object(
      'family_id', m.family_id,
      'members', coalesce((
        select jsonb_agg(jsonb_build_object('id',fm.id,'display_name',fm.display_name,'role',fm.role,'is_me',fm.user_id=(select auth.uid())) order by fm.created_at)
        from after.family_members fm where fm.family_id=m.family_id and fm.status='active'
      ), '[]'::jsonb),
      'students', coalesce((
        select jsonb_agg(jsonb_build_object('id',s.id,'name',coalesce(s.preferred_name,s.first_name)) order by s.created_at)
        from after.students s where s.family_id=m.family_id and s.status='active'
      ), '[]'::jsonb),
      'responsibilities', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',r.id,'student_id',r.student_id,'assigned_member_id',r.assigned_member_id,'title',r.title,'status',r.status,'created_at',r.created_at,
          'assigned_name',fm.display_name
        ) order by r.created_at desc)
        from after.responsibilities r
        left join after.family_members fm on fm.id=r.assigned_member_id and fm.family_id=r.family_id
        where r.family_id=m.family_id and r.status <> 'completed'
      ), '[]'::jsonb)
    ) from mine m
  ), '{}'::jsonb);
$$;

create or replace function public.after_accept_invitation(p_invitation_id uuid, p_display_name text default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_inv after.family_invitations%rowtype;
  v_member_id uuid;
begin
  select * into v_inv
  from after.family_invitations i
  where i.id = p_invitation_id
  for update;

  if v_inv.id is null
     or v_inv.status <> 'pending'
     or v_inv.expires_at <= now()
     or lower(v_inv.invited_email) <> lower(coalesce(auth.jwt()->>'email',''))
     or not exists (
       select 1 from after.families f
       where f.id = v_inv.family_id and f.status = 'active'
     ) then
    raise exception 'invalid_invitation' using errcode = '42501';
  end if;

  insert into after.family_members(family_id,user_id,role,display_name,status)
  values(v_inv.family_id,(select auth.uid()),v_inv.role,coalesce(nullif(trim(coalesce(p_display_name,'')),''),v_inv.display_name,split_part(v_inv.invited_email,'@',1)),'active')
  on conflict(family_id,user_id) do update set status='active'
  returning id into v_member_id;

  update after.family_invitations set status='accepted',accepted_at=now() where id=v_inv.id;
  return v_member_id;
end;
$$;

create or replace function public.after_my_invitations()
returns table(id uuid, family_id uuid, family_name text, role text, display_name text, expires_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select i.id, i.family_id, f.name, i.role, i.display_name, i.expires_at
  from after.family_invitations i
  join after.families f on f.id = i.family_id
  where lower(i.invited_email) = lower(coalesce(auth.jwt()->>'email',''))
    and i.status = 'pending'
    and i.expires_at > now()
    and f.status = 'active'
  order by i.created_at desc;
$$;

create or replace function after_private.my_access_state()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select jsonb_build_object(
      'state', f.status,
      'family_id', f.id,
      'family_name', f.name
    )
    from after.family_members fm
    join after.families f on f.id = fm.family_id
    where fm.user_id = (select auth.uid())
      and fm.status = 'active'
    order by fm.created_at
    limit 1
  ), jsonb_build_object('state', 'none'));
$$;

create or replace function public.after_my_access_state()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select after_private.my_access_state(); $$;

create or replace function after_private.platform_admin_set_family_status(p_family_id uuid, p_status text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_status text;
begin
  if not after_private.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_status is null or p_status not in ('active', 'paused') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  select f.status into v_previous_status
  from after.families f
  where f.id = p_family_id
  for update;

  if not found then
    raise exception 'family_not_found' using errcode = 'P0002';
  end if;

  if v_previous_status = p_status then
    return p_status;
  end if;

  update after.families
  set status = p_status, updated_at = now()
  where id = p_family_id;

  insert into after.audit_events(family_id, actor_user_id, action, entity_type, entity_id, metadata)
  values(
    p_family_id,
    (select auth.uid()),
    'platform.family_status_changed',
    'family',
    p_family_id,
    jsonb_build_object('previous_status', v_previous_status, 'new_status', p_status)
  );

  return p_status;
end;
$$;

create or replace function public.after_platform_admin_set_family_status(p_family_id uuid, p_status text)
returns text
language sql
security invoker
set search_path = ''
as $$ select after_private.platform_admin_set_family_status(p_family_id, p_status); $$;

revoke all on function after_private.is_family_member(uuid) from public, anon;
revoke all on function after_private.is_family_owner(uuid) from public, anon;
revoke all on function after_private.student_in_my_family(uuid) from public, anon;
revoke all on function public.after_dashboard() from public, anon;
revoke all on function public.after_family_workspace() from public, anon;
revoke all on function public.after_accept_invitation(uuid, text) from public, anon;
revoke all on function public.after_my_invitations() from public, anon;
revoke all on function after_private.my_access_state() from public, anon;
revoke all on function after_private.platform_admin_set_family_status(uuid, text) from public, anon;
revoke all on function public.after_my_access_state() from public, anon;
revoke all on function public.after_platform_admin_set_family_status(uuid, text) from public, anon;

grant execute on function after_private.is_family_member(uuid) to authenticated;
grant execute on function after_private.is_family_owner(uuid) to authenticated;
grant execute on function after_private.student_in_my_family(uuid) to authenticated;
grant execute on function public.after_dashboard() to authenticated;
grant execute on function public.after_family_workspace() to authenticated;
grant execute on function public.after_accept_invitation(uuid, text) to authenticated;
grant execute on function public.after_my_invitations() to authenticated;
grant execute on function after_private.my_access_state() to authenticated;
grant execute on function after_private.platform_admin_set_family_status(uuid, text) to authenticated;
grant execute on function public.after_my_access_state() to authenticated;
grant execute on function public.after_platform_admin_set_family_status(uuid, text) to authenticated;
