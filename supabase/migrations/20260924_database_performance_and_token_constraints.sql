-- Targeted database performance and integrity follow-up for the security hardening release.
-- All indexes are additive and cover remaining foreign-key maintenance paths reported by Supabase.

alter table public.user_tokens
  drop constraint if exists user_tokens_balance_nonnegative;
alter table public.user_tokens
  add constraint user_tokens_balance_nonnegative check (balance >= 0);

-- Status requests now use the server transport after a signed-in ownership check.
revoke all on function public.get_app_store_connect_status(uuid) from authenticated;

create index if not exists ai_social_drafts_brand_agent_idx on public.ai_social_drafts(brand_agent_id) where brand_agent_id is not null;
create index if not exists ai_social_drafts_channel_profile_idx on public.ai_social_drafts(channel_profile_id) where channel_profile_id is not null;
create index if not exists ai_social_drafts_user_idx on public.ai_social_drafts(user_id);
create index if not exists ai_social_drafts_workspace_idx on public.ai_social_drafts(workspace_id) where workspace_id is not null;
create index if not exists app_brand_agents_workspace_idx on public.app_brand_agents(workspace_id) where workspace_id is not null;
create index if not exists app_channel_profiles_unified_social_profile_idx on public.app_channel_profiles(unified_social_profile_id) where unified_social_profile_id is not null;
create index if not exists app_channel_profiles_workspace_idx on public.app_channel_profiles(workspace_id) where workspace_id is not null;
create index if not exists brand_memory_snapshots_user_idx on public.brand_memory_snapshots(user_id);
create index if not exists campaign_media_concept_idx on public.campaign_media(concept_id) where concept_id is not null;
create index if not exists campaign_media_media_asset_idx on public.campaign_media(media_asset_id);
create index if not exists campaign_media_user_idx on public.campaign_media(user_id);
create index if not exists creative_experiment_cells_product_idx on public.creative_experiment_cells(product_id);
create index if not exists creative_experiment_cells_user_idx on public.creative_experiment_cells(user_id);
create index if not exists creative_experiment_cells_workspace_idx on public.creative_experiment_cells(workspace_id);
create index if not exists creative_experiment_matrices_campaign_idx on public.creative_experiment_matrices(campaign_id) where campaign_id is not null;
create index if not exists creative_experiment_matrices_product_idx on public.creative_experiment_matrices(product_id);
create index if not exists creative_experiment_matrices_user_idx on public.creative_experiment_matrices(user_id);
create index if not exists creative_memory_events_concept_idx on public.creative_memory_events(concept_id) where concept_id is not null;
create index if not exists creative_memory_events_media_asset_idx on public.creative_memory_events(media_asset_id) where media_asset_id is not null;
create index if not exists creative_performance_observations_connection_idx on public.creative_performance_observations(performance_connection_id) where performance_connection_id is not null;
create index if not exists creative_performance_observations_product_idx on public.creative_performance_observations(product_id);
create index if not exists creative_performance_observations_user_idx on public.creative_performance_observations(user_id);
create index if not exists creative_performance_observations_workspace_idx on public.creative_performance_observations(workspace_id);
create index if not exists experiment_variants_concept_idx on public.experiment_variants(concept_id) where concept_id is not null;
create index if not exists experiment_variants_media_asset_idx on public.experiment_variants(media_asset_id) where media_asset_id is not null;
create index if not exists experiment_variants_user_idx on public.experiment_variants(user_id);
create index if not exists experiment_variants_workspace_idx on public.experiment_variants(workspace_id);
create index if not exists marketing_experiments_campaign_idx on public.marketing_experiments(campaign_id) where campaign_id is not null;
create index if not exists marketing_experiments_product_idx on public.marketing_experiments(product_id);
create index if not exists marketing_experiments_user_idx on public.marketing_experiments(user_id);
create index if not exists performance_connections_user_idx on public.performance_connections(user_id);
create index if not exists products_brand_idx on public.products(brand_id) where brand_id is not null;
create index if not exists search_visibility_evidence_product_idx on public.search_visibility_evidence(product_id);
create index if not exists search_visibility_evidence_user_idx on public.search_visibility_evidence(user_id);
create index if not exists seo_action_tasks_product_idx on public.seo_action_tasks(product_id);
create index if not exists seo_action_tasks_user_idx on public.seo_action_tasks(user_id);
create index if not exists seo_articles_destination_idx on public.seo_articles(destination_id) where destination_id is not null;
create index if not exists seo_articles_product_idx on public.seo_articles(product_id);
create index if not exists seo_destinations_product_idx on public.seo_destinations(product_id);
create index if not exists shortform_research_examples_user_idx on public.shortform_research_examples(user_id);
create index if not exists social_oauth_states_user_idx on public.social_oauth_states(user_id);
create index if not exists social_oauth_states_workspace_idx on public.social_oauth_states(workspace_id) where workspace_id is not null;
create index if not exists social_publish_attempts_workspace_idx on public.social_publish_attempts(workspace_id) where workspace_id is not null;
create index if not exists unified_social_profiles_workspace_idx on public.unified_social_profiles(workspace_id) where workspace_id is not null;
create index if not exists workspace_invitations_invited_by_idx on public.workspace_invitations(invited_by) where invited_by is not null;
create index if not exists workspace_members_user_idx on public.workspace_members(user_id);
create index if not exists workspace_openai_provider_credentials_created_by_idx on public.workspace_openai_provider_credentials(created_by);

notify pgrst, 'reload schema';
