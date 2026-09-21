-- Lestra After 0.5.6 — harden sensitive RPC execution
-- Prepared in stabilization branch. Apply only after validating the 0.5.6 client flow.

revoke execute on function public.after_create_student(
  uuid, text, text, date, text, text, text
) from public, anon;

grant execute on function public.after_create_student(
  uuid, text, text, date, text, text, text
) to authenticated;

revoke execute on function public.after_update_student_identity(
  uuid, text, text, text, text
) from public, anon;

grant execute on function public.after_update_student_identity(
  uuid, text, text, text, text
) to authenticated;
