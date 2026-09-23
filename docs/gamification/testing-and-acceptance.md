# Flo Momentum Testing and Acceptance

## Automated checks

Run the deterministic logic suite with:

```bash
node --test tests/campaignMomentum.test.mjs
```

Then run the production build:

```bash
npm run build
```

The unit suite covers product truth, creative thesis, creative family, review, controlled experiment, verified learning, next-action selection, learning summaries, and pause/archive state handling. Its fixtures contain no calls to AI, Stripe, App Store Connect, provider APIs, or social APIs.

## Manual acceptance loop

A signed-in operator must be able to select a portfolio app, confirm product facts and Brand DNA, create a campaign, select and edit a thesis, attach two completed variants with change summaries, save a review decision, create a control/challenger experiment, record sourced numeric observations, save a Learning Statement, explicitly promote it to Creative Memory, inspect the completed runbook, and archive/reopen it.

The QA pass must verify desktop and narrow layouts, keyboard focus, labels, high contrast, empty states, no portfolio app, no campaign, missing metrics, failed renders, insufficient tokens, inconclusive experiments, app isolation, reload persistence, and archive/reopen. It must also verify that the flow never publishes a social post, initiates checkout, creates a background job, or reports a stage complete without linked evidence.

## Deployment sequence

Apply the timestamped Supabase migration before releasing the frontend. After migration application, run the existing build and logic suite, verify that RLS is enabled on each new table, and inspect one signed-in campaign in the authenticated production UI. No external publishing, paid generation, social connection, or App Store credential change is part of this sequence.
