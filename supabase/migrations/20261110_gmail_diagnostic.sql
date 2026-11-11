-- One non-promotional diagnostic per connected Google account, permanently.
-- Additive only: no provider calls, jobs, flag changes or campaign/contact/queue writes.
-- Backend supplies a verified user ID; recipient and account are independently DB-scoped.
begin;

create table public.email_gmail_diagnostics (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  product_id uuid not null,
  account_key text not null unique references public.email_gmail_accounts(account_key) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  recipient_email text not null check (
    recipient_email = lower(btrim(recipient_email))
    and recipient_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    and length(recipient_email) <= 254
  ),
  status text not null default 'reserved' check (status in ('reserved','unknown','accepted','rejected')),
  provider_message_id text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  foreign key (workspace_id, product_id) references public.products(workspace_id, id) on delete restrict
);

-- No client policies, direct client reads, service INSERT or service DELETE.
-- Narrow UPDATE grants let emailDb record outcomes without changing reservation identity.
alter table public.email_gmail_diagnostics enable row level security;
revoke all on public.email_gmail_diagnostics from public, anon, authenticated, service_role;
grant select on public.email_gmail_diagnostics to service_role;
grant update (status, provider_message_id, finished_at) on public.email_gmail_diagnostics to service_role;

-- A reservation cannot be deleted, reassigned, reset or reopened by an outcome write.
-- Unknown may resolve to accepted/rejected; neither terminal outcome can be overwritten.
create function public.email_guard_diagnostic_history() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Gmail diagnostic history is permanent';
  end if;
  if (new.id, new.workspace_id, new.product_id, new.account_key, new.created_by, new.recipient_email, new.created_at)
    is distinct from
    (old.id, old.workspace_id, old.product_id, old.account_key, old.created_by, old.recipient_email, old.created_at) then
    raise exception 'Gmail diagnostic identity is immutable';
  end if;
  if (old.status <> 'reserved' and new.status = 'reserved')
    or (old.status in ('accepted','rejected') and new is distinct from old) then
    raise exception 'Gmail diagnostic outcome cannot be reopened or overwritten';
  end if;
  return new;
end $$;
create trigger email_diagnostic_history_guard before update or delete on public.email_gmail_diagnostics
  for each row execute function public.email_guard_diagnostic_history();
revoke all on function public.email_guard_diagnostic_history() from public, anon, authenticated, service_role;

-- Later campaign activation must still charge a recent diagnostic against Gmail capacity.
-- Existing claims already hold this account row lock. Taking it again in this additive
-- trigger preserves their lock order; the account advisory lock is also used by reserve.
-- A rejected diagnostic is known not accepted, but its permanent one-shot row remains.
create function public.email_guard_diagnostic_quota() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_budget integer;
begin
  select a.daily_budget into v_budget from public.email_gmail_accounts a
    where a.account_key = new.account_key for update;
  perform pg_advisory_xact_lock(hashtextextended('email-account:' || new.account_key, 0));
  if v_budget is null or (
    (select count(*) from public.email_quota_reservations q
      where q.account_key = new.account_key and q.reserved_at > now() - interval '24 hours')
    + (select count(*) from public.email_gmail_diagnostics d
      where d.account_key = new.account_key and d.status <> 'rejected'
        and d.created_at > now() - interval '24 hours')
  ) >= v_budget then
    raise exception 'Gmail account diagnostic quota unavailable';
  end if;
  return new;
end $$;
create trigger email_diagnostic_quota_guard before insert on public.email_quota_reservations
  for each row execute function public.email_guard_diagnostic_quota();
revoke all on function public.email_guard_diagnostic_quota() from public, anon, authenticated, service_role;

create function public.email_reserve_diagnostic(
  p_workspace_id uuid, p_product_id uuid, p_user_id uuid, p_recipient text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_account_key text;
  v_connection_email text;
  v_expected_email text;
  v_user_email text;
  v_recipient text;
  v_configured boolean;
  v_connection_sending boolean;
  v_account_sending boolean;
  v_workspace_budget integer;
  v_account_budget integer;
  v_id uuid;
begin
  if p_workspace_id is null or p_product_id is null or p_user_id is null or p_recipient is null then
    raise exception 'Gmail diagnostic unavailable';
  end if;

  -- Preserve email_claim_send's order: workspace advisory -> connection FOR SHARE
  -- -> shared account FOR UPDATE. The disabled flags block ordinary send claims.
  perform pg_advisory_xact_lock(hashtextextended('email-workspace:' || p_workspace_id::text, 0));
  perform 1 from public.workspaces w where w.id = p_workspace_id for share;
  if not found then raise exception 'Gmail diagnostic unavailable'; end if;
  if not exists (select 1 from public.workspaces w where w.id = p_workspace_id and w.owner_user_id = p_user_id) then
    perform 1 from public.workspace_members m
      where m.workspace_id = p_workspace_id and m.user_id = p_user_id and m.role in ('owner','admin') for share;
    if not found then raise exception 'Gmail diagnostic unavailable'; end if;
  end if;
  perform 1 from public.products p where p.workspace_id = p_workspace_id and p.id = p_product_id
    and coalesce(lower(p.source_facts->>'archived'), 'false') <> 'true' for share;
  if not found then raise exception 'Gmail diagnostic unavailable'; end if;

  select c.account_key, lower(btrim(c.email)), c.configured, c.sending_enabled, c.daily_budget
    into v_account_key, v_connection_email, v_configured, v_connection_sending, v_workspace_budget
    from public.workspace_gmail_connections c where c.workspace_id = p_workspace_id for share;
  if v_account_key is null then raise exception 'Gmail diagnostic unavailable'; end if;
  select a.sending_enabled, a.daily_budget into v_account_sending, v_account_budget
    from public.email_gmail_accounts a where a.account_key = v_account_key for update;
  if v_account_budget is null then raise exception 'Gmail diagnostic unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended('email-account:' || v_account_key, 0));

  select lower(btrim(p.expected_sender_email)) into v_expected_email
    from public.workspace_email_preferences p where p.workspace_id = p_workspace_id for share;
  select lower(btrim(u.email)) into v_user_email from auth.users u where u.id = p_user_id for share;
  if v_configured is distinct from true or v_connection_sending is distinct from false
    or v_account_sending is distinct from false
    or nullif(v_expected_email, '') is null or v_expected_email is distinct from v_connection_email
    or nullif(v_user_email, '') is null
    or exists (select 1 from public.email_campaigns campaign
      join public.workspace_gmail_connections connection on connection.workspace_id = campaign.workspace_id
      where connection.account_key = v_account_key and campaign.sending_enabled) then
    raise exception 'Gmail diagnostic unavailable';
  end if;

  -- p_recipient asserts the permitted DB identity; it is never used as an arbitrary target.
  if lower(btrim(p_recipient)) = v_user_email then
    v_recipient := v_user_email;
  elsif lower(btrim(p_recipient)) = v_connection_email then
    v_recipient := v_connection_email;
  else
    raise exception 'Gmail diagnostic unavailable';
  end if;
  if v_recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(v_recipient) > 254 then
    raise exception 'Gmail diagnostic unavailable';
  end if;

  -- No age/outcome filter: even reserved, unknown or rejected consumes this account forever.
  if exists (select 1 from public.email_gmail_diagnostics d where d.account_key = v_account_key) then
    raise exception 'Gmail diagnostic already reserved';
  end if;
  if (select count(*) from public.email_quota_reservations q
    where q.account_key = v_account_key and q.reserved_at > now() - interval '24 hours')
    >= least(v_workspace_budget, v_account_budget) then
    raise exception 'Gmail diagnostic unavailable';
  end if;

  -- Insert only; never an upsert, overwrite, refund, release or automatic retry.
  insert into public.email_gmail_diagnostics(workspace_id, product_id, account_key, created_by, recipient_email)
    values (p_workspace_id, p_product_id, v_account_key, p_user_id, v_recipient) returning id into v_id;
  return jsonb_build_object('id', v_id, 'recipient', v_recipient, 'status', 'reserved');
exception when unique_violation then
  raise exception 'Gmail diagnostic already reserved';
end $$;

revoke all on function public.email_reserve_diagnostic(uuid,uuid,uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.email_reserve_diagnostic(uuid,uuid,uuid,text) to service_role;
comment on table public.email_gmail_diagnostics is 'Private permanent one-shot account ledger. Reserved/unknown/rejected/accepted never allow another diagnostic. No campaign or contact history.';
comment on function public.email_reserve_diagnostic(uuid,uuid,uuid,text) is 'Service-only. Verified user ID required; DB owner/admin, product, connected expected sender, fixed recipient and disabled sending checks. Atomic permanent account reservation; never retry.';
notify pgrst, 'reload schema';
commit;
