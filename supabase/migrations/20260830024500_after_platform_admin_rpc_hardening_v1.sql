create policy platform_admins_self_read_marker on after.platform_admins
for select to authenticated using (user_id=(select auth.uid()));

create or replace function after_private.platform_admin_summary() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not after_private.is_platform_admin() then raise exception 'forbidden' using errcode='42501'; end if;
 return jsonb_build_object(
  'families',(select count(*) from after.families),
  'active_families',(select count(*) from after.families where status='active'),
  'members',(select count(*) from after.family_members where status='active'),
  'students',(select count(*) from after.students where status='active'),
  'agenda_items',(select (select count(*) from after.academic_items)+(select count(*) from after.calendar_events)),
  'documents',(select count(*) from after.source_documents),
  'open_privacy_requests',(select count(*) from after.privacy_requests where status not in ('resolved','closed')),
  'created_last_30d',(select count(*) from after.families where created_at>=now()-interval '30 days'));
end;$$;
revoke all on function after_private.platform_admin_summary() from public, anon;
grant execute on function after_private.platform_admin_summary() to authenticated;

create or replace function after_private.platform_admin_families(p_limit int default 100)
returns table(id uuid,name text,status text,created_at timestamptz,members bigint,students bigint)
language plpgsql stable security definer set search_path='' as $$
begin
 if not after_private.is_platform_admin() then raise exception 'forbidden' using errcode='42501'; end if;
 return query select f.id,f.name,f.status,f.created_at,
  (select count(*) from after.family_members m where m.family_id=f.id and m.status='active'),
  (select count(*) from after.students s where s.family_id=f.id and s.status='active')
 from after.families f order by f.created_at desc limit greatest(1,least(coalesce(p_limit,100),500));
end;$$;
revoke all on function after_private.platform_admin_families(int) from public, anon;
grant execute on function after_private.platform_admin_families(int) to authenticated;

create or replace function after_private.platform_admin_audit(p_limit int default 100)
returns table(id bigint,action text,entity_type text,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if not after_private.is_platform_admin() then raise exception 'forbidden' using errcode='42501'; end if;
 return query select a.id,a.action,a.entity_type,a.created_at from after.audit_events a
 order by a.created_at desc limit greatest(1,least(coalesce(p_limit,100),500));
end;$$;
revoke all on function after_private.platform_admin_audit(int) from public, anon;
grant execute on function after_private.platform_admin_audit(int) to authenticated;

create or replace function public.after_platform_admin_access() returns boolean
language sql stable security invoker set search_path='' as $$ select after_private.is_platform_admin(); $$;
create or replace function public.after_platform_admin_summary() returns jsonb
language sql stable security invoker set search_path='' as $$ select after_private.platform_admin_summary(); $$;
create or replace function public.after_platform_admin_families(p_limit int default 100)
returns table(id uuid,name text,status text,created_at timestamptz,members bigint,students bigint)
language sql stable security invoker set search_path='' as $$ select * from after_private.platform_admin_families(p_limit); $$;
create or replace function public.after_platform_admin_audit(p_limit int default 100)
returns table(id bigint,action text,entity_type text,created_at timestamptz)
language sql stable security invoker set search_path='' as $$ select * from after_private.platform_admin_audit(p_limit); $$;
revoke all on function public.after_platform_admin_access() from public, anon;
revoke all on function public.after_platform_admin_summary() from public, anon;
revoke all on function public.after_platform_admin_families(int) from public, anon;
revoke all on function public.after_platform_admin_audit(int) from public, anon;
grant execute on function public.after_platform_admin_access() to authenticated;
grant execute on function public.after_platform_admin_summary() to authenticated;
grant execute on function public.after_platform_admin_families(int) to authenticated;
grant execute on function public.after_platform_admin_audit(int) to authenticated;
