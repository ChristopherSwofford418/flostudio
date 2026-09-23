-- Cover new Campaign Runbook foreign keys that are queried independently by RLS or portfolio read models.
create index if not exists campaign_posts_concept_idx on public.campaign_posts(concept_id);
create index if not exists campaign_runbooks_product_idx on public.campaign_runbooks(product_id);
create index if not exists campaign_runbooks_user_idx on public.campaign_runbooks(user_id);
create index if not exists campaign_runbook_reflections_user_idx on public.campaign_runbook_reflections(user_id);
create index if not exists campaign_review_decisions_campaign_idx on public.campaign_review_decisions(campaign_id);
create index if not exists campaign_review_decisions_post_idx on public.campaign_review_decisions(campaign_post_id) where campaign_post_id is not null;
create index if not exists campaign_review_decisions_asset_idx on public.campaign_review_decisions(media_asset_id) where media_asset_id is not null;
create index if not exists campaign_review_decisions_runbook_idx on public.campaign_review_decisions(runbook_id) where runbook_id is not null;
create index if not exists campaign_review_decisions_product_idx on public.campaign_review_decisions(product_id);
create index if not exists campaign_review_decisions_user_idx on public.campaign_review_decisions(user_id);
create index if not exists experiment_learning_statements_campaign_idx on public.experiment_learning_statements(campaign_id) where campaign_id is not null;
create index if not exists experiment_learning_statements_experiment_idx on public.experiment_learning_statements(experiment_id);
create index if not exists experiment_learning_statements_variant_idx on public.experiment_learning_statements(experiment_variant_id) where experiment_variant_id is not null;
create index if not exists experiment_learning_statements_product_idx on public.experiment_learning_statements(product_id);
create index if not exists experiment_learning_statements_user_idx on public.experiment_learning_statements(user_id);
create index if not exists experiment_learning_statements_workspace_idx on public.experiment_learning_statements(workspace_id);
create index if not exists campaign_learning_reuse_preferences_target_idx on public.campaign_learning_reuse_preferences(target_product_id);
create index if not exists campaign_learning_reuse_preferences_source_idx on public.campaign_learning_reuse_preferences(source_learning_statement_id);
