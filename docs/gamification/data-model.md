# Campaign Runbook Data Model

The Campaign Runbook model is additive. It uses existing `campaigns`, `campaign_concepts`, `campaign_posts`, `media_assets`, `marketing_experiments`, `experiment_variants`, and `creative_memory_events` as source evidence. It does not duplicate assets, raw provider metrics, or token transactions.

| Table | Purpose | Key constraints |
|---|---|---|
| `campaign_runbooks` | User-owned campaign operating record. Stores status, chosen focus, outcome statement, and pause/archive state. | One runbook per campaign; workspace, user, product, and campaign FKs; `active`, `paused`, `completed`, `archived` status only. |
| `campaign_runbook_checkpoints` | Optional persisted acknowledgement/override for each of the seven derived stages. | One row per runbook and stage key; no progress percentage or synthetic completion. |
| `campaign_runbook_reflections` | User-authored decision, review, learning, pause, and archive context. | Authored by an authenticated user and linked to one runbook. |
| `campaign_review_decisions` | Immutable human decisions for a campaign post or asset. | Exactly one target type (`campaign_post` or `media_asset`), reviewer, decision, optional reason, and timestamp. |
| `experiment_learning_statements` | Learning statement linked to a verified experiment and optional winning/observed variant. | Three operator-authored fields; can be saved after a real observation. |

Derived checkpoint calculations are performed by `src/lib/campaignMomentum.js`. It uses only completed media linked to the selected thesis, persisted review decisions, experiments with a control and challenger, variant metrics with numeric sourced observations, and learning statements. The UI surfaces each evidence item by identifier, title, link target, and date.

All tables enable RLS. Policies require `auth.uid()` to match `user_id` and verify that the referenced campaign belongs to an owned product in the same workspace. New client queries also scope by workspace, user, and product. This redundancy protects app isolation and avoids trusting client-provided foreign keys alone.
