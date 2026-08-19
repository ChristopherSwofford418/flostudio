# FloStudio Creative Lab Visibility Diagnosis — 2026-08-19

## Production inspection

The direct production route `https://www.flostudio.io/images` loads the expanded Creative Lab DOM for the authenticated QA workspace. The route contains the Portfolio Ad Room headline, Format Shelf, Creative Recipe objective and visual-lens controls, the asset library with three genuine stored outputs, and the live output board. The browser console did not report a JavaScript error during this inspection.

## Visibility anomaly under investigation

The browser’s visual capture was a blank deep-green canvas despite the complete accessible page content being present in the rendered DOM. This indicates that the remaining issue may be visual CSS state, a browser-specific rendering/caching behavior, or user-session/environment variance rather than an absent route or unbuilt React component.

## Build and cache verification

After the page settled, the full Creative Lab was visibly rendered in the production browser: the sidebar, Format Shelf, objective and lens controls, image rail, and output board were all present. The production HTML points to the hashed bundle `index-C0iiVbaE.js`; that bundle contains the new Format Shelf, Campaign Objective, Visual Lens, and Review Queue handoff strings. The document response uses `public, max-age=0, must-revalidate`, while no active service worker controls the page. Production is therefore serving the current build, not an older cached application shell.

## Portfolio discovery correction

The user’s supplied screen confirmed that their active workspace was on `/portfolio`, where the Creative Lab improvement had not previously been surfaced above the fold. A dedicated “Open new Creative Lab” action and a Portfolio Ad Room launch panel were added to that workspace and pushed in commit `f0cc7f1`. The first production check returned the preceding Portfolio bundle, so deployment propagation remains under validation.

After propagation completed, the live Portfolio page showed both the hero-level “Open new Creative Lab” button and the new “Portfolio Ad Room” panel with its “Build an ad” action. The new action was clicked in production and correctly navigated to `/images`, where the full expanded Creative Lab rendered with the Format Shelf, Creative Recipe controls, and real saved image outputs.
