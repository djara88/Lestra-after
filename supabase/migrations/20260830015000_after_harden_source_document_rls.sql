drop policy if exists source_documents_family_all on after.source_documents;

create policy source_documents_uploader_select
on after.source_documents
for select
to authenticated
using (
  uploaded_by = (select auth.uid())
  and after_private.is_family_member(family_id)
);

create policy source_documents_uploader_insert
on after.source_documents
for insert
to authenticated
with check (
  uploaded_by = (select auth.uid())
  and after_private.is_family_member(family_id)
  and (
    student_id is null
    or after_private.student_in_my_family(student_id)
  )
);

create policy source_documents_uploader_update
on after.source_documents
for update
to authenticated
using (
  uploaded_by = (select auth.uid())
  and after_private.is_family_member(family_id)
)
with check (
  uploaded_by = (select auth.uid())
  and after_private.is_family_member(family_id)
  and (
    student_id is null
    or after_private.student_in_my_family(student_id)
  )
);

create policy source_documents_uploader_delete
on after.source_documents
for delete
to authenticated
using (
  uploaded_by = (select auth.uid())
  and after_private.is_family_member(family_id)
);
