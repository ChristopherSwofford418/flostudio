# Flo Momentum Strategy Dashboard

## Product decision

**Flo Momentum** is an evidence-backed operating layer for Flo Studio’s real campaign workflow. It rewards neither activity nor spend. Its purpose is to help a founder, growth operator, or small team move a product from verified facts to an inspectable, reusable campaign lesson.

The user-facing loop is **Truth → Thesis → Creative Family → Review → Experiment → Learning → Reuse**. A Campaign Runbook is the durable, user-owned record for one campaign. The Momentum Map is its derived operating view; it reports only evidence that is already persisted in Flo Studio.

| Decision area | Flo Momentum decision |
|---|---|
| Player | A founder, growth operator, or small team managing one or more products with limited time and a constrained creative budget. |
| Real user outcome | A campaign has inspectable product truth, a selected thesis, a reviewed creative family, a controlled test, a verified result, and a reusable lesson. |
| Smallest meaningful action | Confirm a fact; select or explicitly edit a thesis; attach a completed asset; record a human review; write a hypothesis; record a verified observation. |
| Evidence of completion | A durable Supabase record linked to its workspace, product, campaign, experiment, or source artifact and attributable to the authenticated operator. |
| User-owned value | A Campaign Runbook, Brand DNA, creative thesis, proof-safe asset, experiment record, verified learning, or Creative Memory entry. |
| Premium boundary | Tokens and subscriptions pay only for disclosed variable-cost generation or durable capacity. They never gate runbooks, review, evidence, outcomes, archive, or export. |
| Harm controls | Each suggestion is dismissible. Every runbook can be paused, reopened, archived, exported, or deleted. No decline or lapse removes previously created work. |

## Core-drive implementation

Flo emphasizes **CD3 meaningful choices and feedback**, **CD4 ownership and reusable memory**, **CD2 earned milestones**, and **CD1 credible purpose**. The system intentionally excludes leaderboards, streaks, XP, currency, social pressure, scarcity, arbitrary scores, and paid progression.

A completion signal always reads as evidence: for example, “3 of 7 evidence-backed stages completed.” It is not a score or an estimate. A stage can be unavailable, in progress, complete, paused, or not applicable. Paused, inconclusive, and not-a-fit outcomes are valid outcomes and are never framed as failure.

## Success signals and rollback

A healthy implementation increases the share of campaigns with linked facts, selected theses, reviewed assets, controlled variants, and sourced observations. It must not increase token spend, generation volume, publishing volume, or time in product merely to produce a progress signal. Roll back or hide a suggestion if it implies success without evidence, routes to a non-durable action, obscures a user control, or creates pressure unrelated to a real campaign constraint.
