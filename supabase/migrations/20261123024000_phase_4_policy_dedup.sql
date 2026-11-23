drop policy if exists invitations_owner_update_editor on public.invitations;
drop policy if exists invitations_owner_update on public.invitations;
create policy invitations_owner_update on public.invitations
  for update to authenticated
  using (
    owner_user_id = (select auth.uid())
    and deleted_at is null
    and (
      (status = 'draft' and published_version_id is null)
      or (status in ('active', 'expired') and published_version_id is not null)
    )
  )
  with check (
    owner_user_id = (select auth.uid())
    and deleted_at is null
    and (
      (status = 'draft' and published_version_id is null)
      or (status in ('active', 'expired') and published_version_id is not null)
    )
  );