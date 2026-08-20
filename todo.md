# Project TODO

- [x] Relink the local FloStudio workspace to the Vercel project that owns www.flostudio.io (`flostudio-web`).
- [x] Deploy the current committed source directly to the production project and verify its live deployment ID.
- [x] Fix missing React hooks import in AgentHQ.jsx causing blank screen\n- [x] Validate the authenticated Image Studio, Pipeline, and Dashboard routes against the deployed source.
- [x] Complete a distinct premium product redesign after the production target is verified.
- [x] Replace the current page-by-page styling with a full workflow-led FloStudio product interface rebuild.
- [x] Rebuild the global command-center shell and redesign every core workspace screen using the new visual system.
- [x] Validate the rebuilt experience on the direct Vercel production deployment before reporting completion.\n- [x] Full product sweep, crash-proof ErrorBoundary, Quick Post builder, and direct production deployment complete.
- [x] Replace repetitive dashboard cards with a premium creative-operations visual system.
- [x] Rebuild Agent Studio and Image Studio around richer editorial composition, campaign previews, and creator-focused workflows.
- [x] Rebuild Pipeline, Campaign Map, Dashboard, Accounts, and Pricing with differentiated premium layouts.
- [x] Visually verify and deploy the premium product redesign directly to www.flostudio.io.
- [x] Research leading creative-product visual patterns and plan an original FloStudio asset system.
- [x] Integrate premium campaign previews, editorial imagery, and creative frames into the core FloStudio workflows.
- [x] Validate visual assets and deploy the enhanced product experience to production.
- [x] Audit and repair the existing image-generation service and media persistence flow.
- [x] Implement a real video-ad creation workflow with durable generation status and output handling.
- [x] Rebuild Creative Lab around a rich, dense gallery of image and video ad outputs.
- [x] Validate image uploads, generation, gallery state, and production deployment end to end.
- [x] Verify the production Creative Lab route and remove any visibility or deployment mismatch.
- [x] Add a durable media_assets database model for generated images, videos, ownership, and render status.
- [x] Build a provider-agnostic media render service with durable asynchronous job tracking and storage finalization.
- [x] Surface reusable media assets in campaign creation, review, calendar, and planning workflows.
- [x] Validate and deploy the long-term media platform to the live FloStudio domain.
- [x] Remove the mismatched white surfaces and redundant empty-state styling from Agent Studio's live workflow.
- [x] Validate and deploy the unified Agent Studio dark editorial treatment. Production route returned the expected authenticated FloStudio entry state after deployment.
- [x] Add a default real visual-creative generation or assignment step to campaign post creation.
- [x] Make Review Queue cards visibly media-first and remove text-only review emphasis.
- [x] Validate and deploy the media-first Pipeline workflow to production.
- [x] Research Creatify and comparable AI advertising platforms using current primary sources.
- [x] Audit FloStudio against the resulting creative-production capability matrix.
- [x] Produce a prioritized product, technical architecture, and token-economics roadmap to reach competitive depth.
- [x] Create durable Brand DNA, product, campaign, campaign concept, and render-job foundations.
- [x] Build a guided Product-to-Campaign Engine with product intake, editable Brand DNA, and campaign-angle selection.
- [x] Build a campaign board that owns concepts, real creative variants, review state, and calendar linkage.
- [x] Validate and deploy the Product-to-Campaign Engine to the live FloStudio domain.
- [x] Research and formalize FloStudio's defensible Creative Memory differentiation strategy.
- [x] Add durable campaign learning records and brand-level memory to FloStudio's data model.
- [x] Surface a transparent Next Best Creative briefing inside the Campaign Engine.
- [x] Validate and deploy the first Creative Memory foundation to production.

- [ ] Correct project tooling so FloStudio checkpoints and validation target /home/ubuntu/flostudio and flostudio-web, never Auto Wizard/Syllabus Agent.
- [ ] Create a valid FloStudio project checkpoint after repository and production state are confirmed.

- [x] Remove any hard-coded portfolio, app, brand, or campaign data from customer-facing flows.
- [x] Add a self-serve Portfolio workspace for users to create, edit, archive, and switch their own apps.
- [x] Add per-portfolio monthly autopilot settings for cadence, platforms, creative mix, and approval mode.
- [x] Verify clean tenant isolation for a newly registered user before production deployment.

- [x] Remove all hard-coded internal portfolio data from customer-facing routes.
- [x] Build self-serve My Portfolio workspace for tenant-isolated app management.
- [x] Implement user-owned brand intelligence, monthly autopilot configuration, and secure tenant workspaces.
- [x] Add one-click monthly autopilot batch content generation across user portfolio apps.
- [x] Run production validation and deploy the commercially ready multi-tenant release to www.flostudio.io.

- [x] Implement URL-first AI app intake for Apple App Store, Google Play, and web listings in Portfolio.
- [x] Add 'Learn App with AI' action that auto-populates product name, category, description, offer, audience, and Brand DNA.

- [x] Confirm FloStudio repository (`ChristopherSwofford418/flostudio`) and Vercel project (`flostudio-web` targeting www.flostudio.io) without touching Syllabus Agent.

- [x] Add an Arcads-style multi-angle batch generator where 1 product link instantly yields 10+ varied creative variants (hooks, angles, visual styles).
- [x] Add a visual hook-and-script editor inside the Campaign Engine so users can customize avatar/video style, captions, and call-to-action overlays before rendering.

- [x] Make portfolio tiles and campaign surfaces dynamically adopt each entered app's imported icon, artwork, and visual brand colors.

- [ ] Add secure App Store Connect API credential configuration (Issuer ID, Key ID, Private Key / JWT) per portfolio app.
- [ ] Implement App Store Connect metrics sync (downloads, proceeds, active subscriptions, and ratings) so FloStudio can display first-party performance stats on each product card.
- [x] Produce a wide, source-verified product gap map spanning AI creative, UGC video, ASO, SEO, social publishing, analytics, and portfolio governance.
- [x] Build a continuous experiment workspace that turns hypotheses into ad and store-listing variants, collects real outcomes, and promotes evidence into Creative Memory.
- [ ] Add a per-app SEO intelligence workflow that uses Search Console data and people-first content safeguards rather than volume-only AI content generation.
- [ ] Replace social-publishing placeholders with provider-approved OAuth, token storage, media-hosting validation, rate-limit awareness, and truthful status reporting.
- [x] Audit and repair FloStudio sign-in, sign-up, session restoration, password reset, protected-route redirects, and personal-workspace provisioning.
- [x] Add clear, actionable authentication error states and ensure a failed sign-in never leaves the product on a blank screen.
- [x] Diagnose and eliminate the production blank-screen regression affecting FloStudio's homepage and authenticated routes.
- [x] Add a resilient application error boundary and route-safe fallback so future runtime failures do not leave customers on an empty screen.
- [x] Provision a dedicated full-access Supabase test account and workspace for end-to-end FloStudio validation.
- [x] Validate production sign-in and Portfolio access with the dedicated test account.
- [x] Research a distinctive visual-identity direction for FloStudio that avoids generic AI-tool templates.
- [x] Redesign FloStudio’s cross-product visual system and high-traffic workflows around the new unique direction.
- [x] Validate and deploy the differentiated FloStudio visual redesign to production without reintroducing routing failures.
- [x] Repair the Campaign Engine `number is not defined` runtime failure discovered during redesigned-flow validation.
- [x] Audit Arcads’ media-first creative-production workflow and identify transferable product patterns for FloStudio.
- [x] Rebuild FloStudio’s primary creative workflow around real media, creator formats, ad scripts, and render-ready production controls.
- [x] Validate and deploy the Arcads-informed, non-template FloStudio studio experience.
- [x] Audit FloStudio’s image-generation path and remove the empty/static production-desk experience.
- [x] Add product-aware AI image concepts, changing creative results, and image-result interactions to the Portfolio Ad Room.
- [x] Validate and deploy dynamic AI-image output for FloStudio production.
- [x] Remove the unsupported GPT Image request parameter and restore test tokens when an AI-image render is rejected before output creation.
- [x] Create and secure the missing `marketing-assets` storage bucket so successful generated images are delivered into the media library.
- [x] Replace the slow multi-image request with reliable one-at-a-time image delivery that visibly updates the Ad Room after each real output.
- [x] Diagnose the completed-image RLS rejection and correct the storage-object policy; the `media_assets` policy was confirmed correct.
- [x] Audit current creative output, product context, asset library, and campaign handoff capabilities for the next FloStudio Ad Room expansion.
- [x] Add deeper product-aware creative concepts, visual iteration controls, and campaign-ready asset actions.
- [x] Validate and deploy the expanded media-first FloStudio creative-production workflow.
- [x] Add a server-side image-provider timeout so complex image requests return a recoverable error and restore user tokens instead of leaving the Ad Room pending.
- [x] Diagnose why the deployed Creative Lab expansion is not visible to the user and correct its production entry point or deployment state.
- [x] Verify the user-facing FloStudio Creative Lab visibly exposes real image outputs and the expanded production controls.
- [x] Surface the expanded Creative Lab production workflow directly from the Portfolio workspace so users do not have to discover it only through navigation.
- [ ] Audit the current Channels screen, OAuth callback code, token storage, and campaign publishing implementation.
- [ ] Research official OAuth, publishing, review, and compliance requirements for Facebook Pages, Instagram Professional, LinkedIn, TikTok, and X.
- [ ] Design a secure multi-tenant channel-connection and publishing architecture with explicit provider-console setup boundaries.
- [ ] Implement the available production OAuth connection flow and replace setup-only channel cards with truthful connection states.
- [ ] Validate the connection flow and document the remaining provider-side configuration required before public publishing is enabled.

- [x] Expand Campaign Engine from three concepts to a ten-angle creative matrix with distinct hooks, proof angles, visual directions, and platform intent.
- [x] Expose an editable structured script editor for each campaign concept before visual or video rendering.
- [x] Preserve script edits in the tenant-scoped campaign_concepts record and use the edited script in downstream creative render prompts.
- [x] Validate the creative matrix, script editing, render handoff, and production deployment.
- [x] Block or flag unverifiable numeric, comparative, and testimonial claims in generated campaign concepts before saving or rendering.
