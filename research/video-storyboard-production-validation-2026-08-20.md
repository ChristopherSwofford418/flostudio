# Video Storyboard Production Validation — 2026-08-20

## Live release

The storyboard release was pushed as commit `e32a3c1` and opened at `https://www.flostudio.io/images?release=storyboard-e32a3c1`.

## Confirmed in production

Creative Lab loads with the tenant workspace, the active product selector, three persisted image outputs, and the new Video Ads tab. The Video Ads tab visibly exposes four editable storyboard beats: Stop the Scroll, Show the Proof, Land the Payoff, and Close with Action. Each beat has editable visual direction, voiceover direction, and on-screen caption fields.

The build also exposes the real video placement, duration, render-intent controls, and the existing render monitor without fake previews. No video render was started during this validation, so no video token was consumed.

## Request path

The browser now sends the four-beat storyboard alongside the video request. The server validates the beat structure, limits the payload to six beats, includes the structured beats in the provider prompt, and stores the storyboard in the tenant-scoped media asset metadata when the render job is created.

## Immediate-completion render validation

The first production retry exposed a backend/UI timing defect: the provider returned `status: completed` at job creation, but `ImageBank.jsx` only completed jobs inside the polling effect for `queued` or `in_progress`. The UI therefore stayed at 100% rendering even though the job was complete.

Commit `9817a08` now detects `status === completed` immediately after the job is created and calls `completeVideo` directly. The patched production release was verified in the authenticated test workspace.

A storyboard-driven vertical video render completed successfully using the Product Showcase workflow and the full editable four-beat storyboard. The token balance moved from 9,900 to 9,870. The Creative Lab now shows 7 real outputs: 6 images and 1 video. The Render Monitor reports `Video render complete / 8s / saved to Asset Library`, exposes an `Open MP4` link, and the saved MP4 URL is tenant-scoped in the `marketing-assets` bucket.

This confirms the real flow: video prompt + storyboard -> job creation -> immediate completion detection -> MP4 and thumbnail persistence -> Asset Library count update -> playable preview/Open MP4 link.
