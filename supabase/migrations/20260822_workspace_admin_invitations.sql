create table if not exists public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role text not null default 'admin' check (role in ('member', 'admin')),
  invited_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  created_at timestamptz not null default timezone('utc', now()),
  accepted_at timestamptz,
  constraint workspace_invitations_email_not_blank check (length(trim(email)) > 3)
);

create unique index if not exists workspace_invitations_pending_email_idx
  on public.workspace_invitations (workspace_id, lower(email))
  where status = 'pending';

create index if not exists workspace_invitations_email_idx
  on public.workspace_invitations (lower(email), status);

alter table public.workspace_invitations enable row level security;

create or replace function public.is_workspace_admin(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspaces w
    where w.id = target_workspace_id
      and w.owner_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and wm.role = 'admin'
  );
$$;

revoke all on function public.is_workspace_admin(uuid) from public;
grant execute on function public.is_workspace_admin(uuid) to authenticated;

create policy "Workspace admins can view invitations"
  on public.workspace_invitations for select
  using (
    public.is_workspace_admin(workspace_id)
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

create policy "Workspace admins can create invitations"
  on public.workspace_invitations for insert
  with check (
    public.is_workspace_admin(workspace_id)
    and invited_by = auth.uid()
  );

create policy "Workspace admins can update invitations"
  on public.workspace_invitations for update
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

create or replace function public.claim_workspace_invitation()
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  invited_workspace uuid;
  invite_record record;
  current_email text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  current_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if current_email = '' then
    raise exception 'Authenticated email required';
  end if;

  for invite_record in
    select id, workspace_id, role
    from public.workspace_invitations
    where lower(email) = current_email
      and status = 'pending'
    order by created_at asc
  loop
    insert into public.workspace_members (workspace_id, user_id, role)
    values (invite_record.workspace_id, auth.uid(), invite_record.role)
    on conflict (workspace_id, user_id)
    do update set role = excluded.role;

    update public.workspace_invitations
    set status = 'accepted', accepted_at = timezone('utc', now())
    where id = invite_record.id;

    if invited_workspace is null then
      invited_workspace := invite_record.workspace_id;
    end if;
  end loop;

  return invited_workspace;
end;
$$;

revoke all on function public.claim_workspace_invitation() from public;
grant execute on function public.claim_workspace_invitation() to authenticated;

comment on table public.workspace_invitations is 'Pending and accepted invitations for shared FloStudio workspaces. Passwords are never stored here.';
comment on function public.claim_workspace_invitation() is 'Claims pending workspace invitations for the authenticated user email and grants the invited role.';

insert into public.workspace_invitations (workspace_id, email, role, invited_by)
select
  '64722537-35ae-433e-9822-a8ba098e236e'::uuid,
  'info@clearpasstechnologies.com',
  'admin',
  'be9b67ff-5689-4409-a031-b1def8d2ad94'::uuid
where exists (
  select 1 from public.workspaces
  where id = '64722537-35ae-433e-9822-a8ba098e236e'::uuid
    and owner_user_id = 'be9b67ff-5689-4409-a031-b1def8d2ad94'::uuid
)
  and not exists (
    select 1 from public.workspace_invitations
    where workspace_id = '64722537-35ae-433e-9822-a8ba098e236e'::uuid
      and lower(email) = lower('info@clearpasstechnologies.com')
      and status = 'pending'
  );

-- Ensure membership policies can recognize the admin role without weakening owner-only controls.
create policy "Workspace members can view workspace"
  on public.workspaces for select
  using (
    owner_user_id = auth.uid()
    or exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = id and wm.user_id = auth.uid()
    )
  );

create policy "Workspace members can view member list"
  on public.workspace_members for select
  using (
    user_id = auth.uid()
    or public.is_workspace_admin(workspace_id)
  );

create policy "Workspace admins can manage members"
  on public.workspace_members for update
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

create policy "Workspace admins can add members"
  on public.workspace_members for insert
  with check (public.is_workspace_admin(workspace_id));

create policy "Workspace admins can remove members"
  on public.workspace_members for delete
  using (public.is_workspace_admin(workspace_id) and user_id <> auth.uid());

create or replace function public.get_workspace_role(target_workspace_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (select 1 from public.workspaces w where w.id = target_workspace_id and w.owner_user_id = auth.uid()) then 'owner'
    else coalesce((select wm.role from public.workspace_members wm where wm.workspace_id = target_workspace_id and wm.user_id = auth.uid()), 'none')
  end;
$$;

revoke all on function public.get_workspace_role(uuid) from public;
grant execute on function public.get_workspace_role(uuid) to authenticated;

notify pgrst, 'reload schema';

-- Rollback notes: drop the policies/functions/table only after verifying no active invitations remain.
-- drop function if exists public.get_workspace_role(uuid);
-- drop function if exists public.claim_workspace_invitation();
-- drop function if exists public.is_workspace_admin(uuid);
-- drop table if exists public.workspace_invitations;
