begin;
create table public.workspace_email_preferences (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  expected_sender_email text not null check (expected_sender_email = lower(btrim(expected_sender_email)) and expected_sender_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  updated_at timestamptz not null default now()
);
alter table public.workspace_email_preferences enable row level security;
revoke all on public.workspace_email_preferences from public,anon,authenticated,service_role;
grant select,insert,update on public.workspace_email_preferences to authenticated;
grant select on public.workspace_email_preferences to service_role;
create policy email_preferences_member_read on public.workspace_email_preferences for select to authenticated using (public.get_workspace_role(workspace_id) in ('owner','admin','member'));
create policy email_preferences_admin_insert on public.workspace_email_preferences for insert to authenticated with check (public.is_workspace_admin(workspace_id));
create policy email_preferences_admin_update on public.workspace_email_preferences for update to authenticated using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));
notify pgrst,'reload schema';
commit;
