-- Add ranking and source-safe preview metadata to the existing public short-form research library.
-- These fields describe attributed public-source cards only; no third-party media is copied or hosted.

alter table public.shortform_research_examples
  add column if not exists platform_rank smallint,
  add column if not exists preview_title text,
  add column if not exists evidence_basis text,
  add column if not exists collected_at timestamptz not null default now();

alter table public.shortform_research_examples
  drop constraint if exists shortform_research_examples_platform_rank_check;

alter table public.shortform_research_examples
  add constraint shortform_research_examples_platform_rank_check
  check (platform_rank is null or platform_rank between 1 and 10);

create index if not exists shortform_research_examples_product_platform_rank_idx
  on public.shortform_research_examples (product_id, platform, platform_rank asc nulls last, researched_at desc);
