-- Auth bootstrap repair: signed-in users can initialize and read only their own balance and ledger entries.

alter table public.user_tokens enable row level security;
alter table public.token_transactions enable row level security;

drop policy if exists "Users select own token balance" on public.user_tokens;
create policy "Users select own token balance" on public.user_tokens for select using (auth.uid() = user_id);
drop policy if exists "Users initialize own token balance" on public.user_tokens;
create policy "Users initialize own token balance" on public.user_tokens for insert with check (auth.uid() = user_id);
drop policy if exists "Users update own token balance" on public.user_tokens;
create policy "Users update own token balance" on public.user_tokens for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users select own token ledger" on public.token_transactions;
create policy "Users select own token ledger" on public.token_transactions for select using (auth.uid() = user_id);
drop policy if exists "Users add own token ledger entries" on public.token_transactions;
create policy "Users add own token ledger entries" on public.token_transactions for insert with check (auth.uid() = user_id);
