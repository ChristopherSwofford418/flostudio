-- Evaluate the authenticated invitee email once per invitation query.

alter policy "Workspace admins can view invitations"
  on public.workspace_invitations
  using (
    is_workspace_admin(workspace_id)
    or lower(email) = lower(coalesce((select auth.jwt()) ->> 'email', ''))
  );

-- These predicates are already included by the remaining membership-aware read policies.
drop policy if exists workspace_members_self_select on public.workspace_members;
drop policy if exists workspaces_owner_select on public.workspaces;

notify pgrst, 'reload schema';
