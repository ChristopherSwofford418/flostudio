create table if not exists public.workspace_openai_provider_credentials (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  encrypted_api_key jsonb not null,
  key_last4 text not null check (char_length(key_last4) between 4 and 12),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.workspace_openai_provider_credentials enable row level security;
revoke all on table public.workspace_openai_provider_credentials from anon, authenticated;

create or replace function public.save_workspace_openai_provider_credential(
  target_workspace_id uuid,
  target_encrypted_api_key jsonb,
  target_key_last4 text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_workspace_id is null or not public.is_workspace_admin(target_workspace_id) then
    raise exception 'Provider credential access is not authorized for this workspace';
  end if;
  if target_encrypted_api_key is null or nullif(trim(target_key_last4), '') is null then
    raise exception 'A valid encrypted provider credential is required';
  end if;
  insert into public.workspace_openai_provider_credentials (
    workspace_id, encrypted_api_key, key_last4, created_by, updated_at
  ) values (
    target_workspace_id, target_encrypted_api_key, right(trim(target_key_last4), 12), auth.uid(), timezone('utc', now())
  ) on conflict (workspace_id) do update set
    encrypted_api_key = excluded.encrypted_api_key,
    key_last4 = excluded.key_last4,
    created_by = excluded.created_by,
    updated_at = excluded.updated_at;
end;
$$;

create or replace function public.get_workspace_openai_provider_credential(target_workspace_id uuid)
returns table (encrypted_api_key jsonb)
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_workspace_id is null or not public.is_workspace_admin(target_workspace_id) then
    raise exception 'Provider credential access is not authorized for this workspace';
  end if;
  return query select c.encrypted_api_key
  from public.workspace_openai_provider_credentials c
  where c.workspace_id = target_workspace_id;
end;
$$;

create or replace function public.get_workspace_openai_provider_status(target_workspace_id uuid)
returns table (configured boolean, key_last4 text, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_workspace_id is null or not public.is_workspace_admin(target_workspace_id) then
    raise exception 'Provider credential access is not authorized for this workspace';
  end if;
  return query select true, c.key_last4, c.updated_at
  from public.workspace_openai_provider_credentials c
  where c.workspace_id = target_workspace_id;
end;
$$;

create or replace function public.clear_workspace_openai_provider_credential(target_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_workspace_id is null or not public.is_workspace_admin(target_workspace_id) then
    raise exception 'Provider credential access is not authorized for this workspace';
  end if;
  delete from public.workspace_openai_provider_credentials where workspace_id = target_workspace_id;
end;
$$;

revoke all on function public.save_workspace_openai_provider_credential(uuid, jsonb, text) from public;
revoke all on function public.get_workspace_openai_provider_credential(uuid) from public;
revoke all on function public.get_workspace_openai_provider_status(uuid) from public;
revoke all on function public.clear_workspace_openai_provider_credential(uuid) from public;
grant execute on function public.save_workspace_openai_provider_credential(uuid, jsonb, text) to authenticated;
grant execute on function public.get_workspace_openai_provider_credential(uuid) to authenticated;
grant execute on function public.get_workspace_openai_provider_status(uuid) to authenticated;
grant execute on function public.clear_workspace_openai_provider_credential(uuid) to authenticated;

comment on table public.workspace_openai_provider_credentials is 'Workspace-scoped OpenAI API credentials stored only as server-encrypted ciphertext; no browser access is granted.';
notify pgrst, 'reload schema';
