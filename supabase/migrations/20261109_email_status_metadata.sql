begin;
create function public.email_connection_status(p_workspace_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or coalesce(public.get_workspace_role(p_workspace_id),'') not in ('owner','admin','member') then
    raise exception 'Workspace membership required' using errcode='42501';
  end if;
  return (select jsonb_build_object(
    'configured',coalesce(c.configured,false),
    'email',c.email,
    'expected_email',p.expected_sender_email,
    'daily_budget',coalesce(c.daily_budget,400)
  ) from public.workspaces w
  left join public.workspace_gmail_connections c on c.workspace_id=w.id
  left join public.workspace_email_preferences p on p.workspace_id=w.id
  where w.id=p_workspace_id);
end;
$$;
revoke all on function public.email_connection_status(uuid) from public,anon,service_role;
grant execute on function public.email_connection_status(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
