-- Additive owner-scoped write access for the unified social and app-brand-agent tables.
-- This avoids storing a privileged Supabase service-role key in the web application.

create policy "Unified social profiles insert own"
  on public.unified_social_profiles
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Unified social profiles update own"
  on public.unified_social_profiles
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "App brand agents insert own"
  on public.app_brand_agents
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "App brand agents update own"
  on public.app_brand_agents
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "App channel profiles insert own"
  on public.app_channel_profiles
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "App channel profiles update own"
  on public.app_channel_profiles
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "AI social drafts insert own"
  on public.ai_social_drafts
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "AI social drafts update own"
  on public.ai_social_drafts
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
