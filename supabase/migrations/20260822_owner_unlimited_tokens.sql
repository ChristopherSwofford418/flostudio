-- Owner unlimited entitlements are server-controlled. A client can read its
-- entitlement, but it can never create or modify an unlimited row for itself.

alter table public.user_tokens
  add column if not exists unlimited boolean not null default false;

comment on column public.user_tokens.unlimited is
  'Server-controlled entitlement flag. When true, token-consuming actions must not reduce balance.';

drop policy if exists "Users initialize own token balance" on public.user_tokens;
create policy "Users initialize own token balance"
  on public.user_tokens
  for insert
  with check (
    auth.uid() = user_id
    and unlimited = false
    and tier = 'free'
    and balance = 50
  );

drop policy if exists "Users update own token balance" on public.user_tokens;
create policy "Users update own token balance"
  on public.user_tokens
  for update
  using (auth.uid() = user_id and unlimited = false)
  with check (auth.uid() = user_id and unlimited = false);
