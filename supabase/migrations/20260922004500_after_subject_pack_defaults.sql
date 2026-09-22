-- Structured school-material defaults for After backpack.
alter table after.subjects add column if not exists needs_notebook boolean not null default true;
alter table after.subjects add column if not exists needs_book boolean not null default false;

create or replace function public.after_set_subject_pack_defaults(p_student_id uuid,p_subject_id uuid,p_needs_notebook boolean,p_needs_book boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'authentication_required'; end if;
 if not after_private.student_in_my_family(p_student_id) then raise exception 'student_access_denied'; end if;
 update after.subjects set needs_notebook=coalesce(p_needs_notebook,true),needs_book=coalesce(p_needs_book,false)
 where id=p_subject_id and student_id=p_student_id;
 if not found then raise exception 'subject_not_found'; end if;
end $$;
revoke execute on function public.after_set_subject_pack_defaults(uuid,uuid,boolean,boolean) from public,anon;
grant execute on function public.after_set_subject_pack_defaults(uuid,uuid,boolean,boolean) to authenticated;

-- after_backpack_workspace in the live database also generates standard Cuaderno/Libro checklist rows
-- from these flags for subjects scheduled on the target date.
