# Reviewed daily app copy

The daily email and Facebook builders use the shared, synchronous helper in `api/daily-app-copy.js`. Its registry import is `DAILY_APP_COPY_PROFILES` from `api/daily-app-copy-profiles.js`. The registry is reviewed source code keyed by canonical positive Apple App Store ID, not workspace or product IDs. It must contain no recipients, workspace/user identifiers, credentials, or external-provider instructions.

This change prepares **draft content only**. It does not send email, publish Facebook posts, generate/replace media, change schedules, or establish permission to contact anyone. Existing worker review, consent, send/publish gates, database behavior, and storage contracts remain authoritative and are not changed here.

## Review and matching contract

A profile contains `apple_app_id`, `app_name`, `theme`, `listing_fingerprint`, twelve `email_angles`, `email_qualifiers`, `facebook_qualifiers`, `facebook_qualifiers_native`, `facebook_fallback`, and `source_url`. Each email angle has a subject, two or three plain-text paragraphs, and one to three exact saved-listing evidence quotes. Facebook fallback has a factual caption and two to four own-app hashtags. Image-audit notes, if retained by the registry maintainer, are review metadata only; the helper never chooses or substitutes an image from them.

The builders first run their existing snapshot, archived-state, scope, App Store ID, and canonical URL checks. `resolveDailyAppCopyProfile(product, resolvedSource, profiles?)` then requires:

1. The resolved Apple ID is a canonical positive decimal string, exists as an own registry key, and exactly equals the profile's `apple_app_id`.
2. The current product display name matches `app_name` after NFC, whitespace, and case normalization. The display name and profile fields must be bounded plain text.
3. The authoritative saved listing description has the reviewed SHA-256 fingerprint.
4. All twelve angles have the required shape. Every evidence quote occurs in that current authoritative description after whitespace folding, **case sensitively**. Evidence from an older secondary source cannot authorize a feature absent from the authoritative source.
5. The registry source URL is an official, same-ID App Store URL. All public text has bounded types/lengths and passes link, markup, control-character, injection, guarantee, unsupported clinical-claim, and prohibited-promotion checks. Hashtags are individually validated.

Description selection is the first nonempty string in `source_facts.storeMetadata.description`, then `source_facts.appStoreListing.description`. The selected raw string is sliced to 12,000 characters, trimmed, and whitespace-folded with `/\s+/gu`; SHA-256 is calculated over UTF-8. The fingerprint does **not** lowercase or NFC-normalize the description. Missing descriptions cannot match a profile. The helper validates every angle, not just today's selected angle.

Profile review must establish the relationship between the factual marketing paraphrases and their evidence; exact evidence matching alone is not a semantic proof. Do not populate the registry by blindly accepting generated copy. Review native-language qualifiers and app-specific safeguards as well as subject/body facts. The helper's field limits and existing blockers are not a reason to weaken validators when a proposed profile is rejected.

## Email behavior

A valid profile supplies a deterministic twelve-angle rotation seeded by the resolved Apple ID and UTC scheduled day. Subjects describe that app's vetted feature/workflow; body paragraphs come from the same angle, followed by applicable concise email qualifiers and the exact canonical App Store link. Vetted public copy does not contain the old `App promotion` or consent-administration boilerplate.

`language = 'en'`, `content_source = 'listing_template'`, draft status, result field names, internal review-only campaign name, and source precedence are unchanged. Rotation is finite and eventually repeats; no AI, remote API, translation, or individualized user inference occurs.

An unknown app, missing/incomplete profile, changed name, changed fingerprint, or missing evidence returns to no-feature generic listing copy. It never borrows another app's profile or quotes stale listing features. The old narrow `safeListingExcerpt` utility remains exported for compatibility but is no longer used to insert unreviewed features into generic daily email.

## Facebook behavior

Reviewed asset captions remain verbatim, including Portuguese or Hebrew text; reviewed image IDs and canonical scoped file paths remain unchanged. A valid profile omits the unrelated rotating introduction and appends a concise App Store CTA followed by the exact validated link. English apps use `Explore [app name] on the App Store:`; the verified PratoFit ID uses `Conheça [app name] na App Store:` and the verified סדר משותף ID uses `גלו את [app name] ב-App Store:`. These native labels apply only after a reviewed profile matches. Profiles use reviewed native Facebook qualifiers when supplied and English qualifiers otherwise. Native copy is not translated at runtime.

Qualifier deduplication removes only complete precaution sentences already explicitly present in the caption, preserving any missing protection. Mentions of a topic or a few overlapping words cannot suppress a disclaimer. Reviewed asset hashtags remain authoritative. An unused title/headline is neither required nor copied.

If no reviewed asset exists, a valid profile may provide only its own factual fallback caption and hashtags. The result still has `image_missing: true` and null image/asset identifiers and image path. A profile never fabricates image generation or claims a reviewed image exists. Missing, changed, or invalid profiles instead retain conservative generic source-safe copy.

## Narrow fallback topics

Fallback qualifier classification never scans listing descriptions, policy/EULA URLs, arbitrary `product.description`, audiences, research, or prompts. It uses a validated display title with Unicode token boundaries, a few anchored app-title rules, and exact trusted saved primary genres (`Medical`, `Health & Fitness`/`Health and Fitness`, `Finance`). Arbitrary genre prose is not a category.

Thus mechanical diagnosis does not make AutoWizard clinical, case treatment does not make CitationShield medical, a Jamee reference does not make Credential Kit clinical, `NOT parental control` does not make BlockYourPhone a child-audience app, `transparent` does not match `parent`, Apple legal links do not make scripture/prayer apps legal products, and Hebrew Seder copy is not inferred to mean Bible, Passover, or custody. Actual legal, medical/health, fitness, financial, vehicle, identification, and child-audience precautions remain where supported by the trusted app title/genre or vetted profile. FlickerTales receives adult-review/age-suitability precautions through its reviewed profile or anchored title fallback.

## Tests and limits

`tests/daily-app-copy.test.mjs` injects synthetic own-app profiles into the pure resolver and into data-URL copies of the actual builders. It never changes the production registry. It covers complete rotation, fingerprint normalization/precedence/drift, every-angle evidence, mismatched IDs/names, unsafe fields, native qualifier selection, no cross-app feature borrowing, missing-image behavior, unchanged result shapes, and preservation of scope/claim blockers. The channel tests cover the reported incidental-word false positives and retained regulated safeguards.

Run syntax checks and all content tests with:

```sh
node --check api/daily-app-copy.js
node --check api/email-daily-campaign-content.js
node --check api/facebook-daily-content.js
node --test tests/*content*.mjs tests/daily-app-copy.test.mjs
```

This is not a rewrite of already saved drafts. Newly changed listings deliberately lose feature copy until a profile is re-reviewed against the new fingerprint/evidence. Future apps without a reviewed profile safely remain generic. Registry completeness and human factual/language review are separate from runtime safety validation.
