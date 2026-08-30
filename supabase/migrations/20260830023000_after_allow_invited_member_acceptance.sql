drop policy if exists family_members_invited_self_insert on after.family_members;
create policy family_members_invited_self_insert
on after.family_members
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and status = 'active'
  and exists (
    select 1
    from after.family_invitations i
    where i.family_id = family_members.family_id
      and i.status = 'pending'
      and i.expires_at > now()
      and lower(i.invited_email) = lower(coalesce(auth.jwt()->>'email',''))
      and i.role = family_members.role
  )
);

drop policy if exists family_members_invited_self_update on after.family_members;
create policy family_members_invited_self_update
on after.family_members
for update
to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1
    from after.family_invitations i
    where i.family_id = family_members.family_id
      and i.status = 'pending'
      and i.expires_at > now()
      and lower(i.invited_email) = lower(coalesce(auth.jwt()->>'email',''))
  )
)
with check (
  user_id = (select auth.uid())
  and status = 'active'
  and exists (
    select 1
    from after.family_invitations i
    where i.family_id = family_members.family_id
      and i.status = 'pending'
      and i.expires_at > now()
      and lower(i.invited_email) = lower(coalesce(auth.jwt()->>'email',''))
      and i.role = family_members.role
  )
);
