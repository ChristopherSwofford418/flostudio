-- The workspace-scoped preference index is retained for portfolio reads; this single-column index covers the target-product foreign key.
create index if not exists campaign_learning_reuse_preferences_target_product_idx
  on public.campaign_learning_reuse_preferences(target_product_id);
