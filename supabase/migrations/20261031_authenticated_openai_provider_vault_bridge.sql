-- Let the FloStudio server use a signed-in workspace-admin JWT for its encrypted
-- OpenAI workspace credential. The encryption key remains server-only and the
-- credential is never returned by any FloStudio browser route.

create or replace function public.save_workspace_openai_provider_credential(
  target_workspace_id uuid,
  target_encrypted_api_key jsonb,
  target_key_last4 text,
  target_created_by uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_workspace_id is null
    or (auth.role() <> 'service_role' and not public.is_workspace_admin(target_workspace_id)) then
    raise exception 'Provider credential access is not authorized for this workspace';
  end if;
  if auth.role() <> 'service_role' and target_created_by is distinct from auth.uid() then
    raise exception 'Provider credential owner must match the signed-in workspace admin';
  end if;
  if target_encrypted_api_key is null
    or nullif(trim(target_key_last4), '') is null
    or target_created_by is null then
    raise exception 'A valid encrypted provider credential is required';
  end if;
  insert into public.workspace_openai_provider_credentials (
    workspace_id, encrypted_api_key, key_last4, created_by, updated_at
  ) values (
    target_workspace_id, target_encrypted_api_key, right(trim(target_key_last4), 12), target_created_by, timezone('utc', now())
  ) on conflict (workspace_id) do update set
    encrypted_api_key = excluded.encrypted_api_key,
    key_last4 = excluded.key_last4,
    created_by = excluded.created_by,
    updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.get_workspace_openai_provider_credential(uuid) from anon;
revoke all on function public.get_workspace_openai_provider_status(uuid) from anon;
revoke all on function public.save_workspace_openai_provider_credential(uuid, jsonb, text, uuid) from anon;
revoke all on function public.clear_workspace_openai_provider_credential(uuid) from anon;

grant execute on function public.get_workspace_openai_provider_credential(uuid) to authenticated;
grant execute on function public.get_workspace_openai_provider_status(uuid) to authenticated;
grant execute on function public.save_workspace_openai_provider_credential(uuid, jsonb, text, uuid) to authenticated;
grant execute on function public.clear_workspace_openai_provider_credential(uuid) to authenticated;

comment on function public.get_workspace_openai_provider_credential(uuid) is 'FloStudio server route only: returns encrypted workspace credential after signed-in workspace-admin authorization; server-only vault key is required to decrypt.';
