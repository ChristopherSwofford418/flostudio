# App Store Connect production creative import research

Flo Studio should treat the request for "approved ads in production" as **approved App Store Connect Asset Library media that is placed on a production-approved App Store surface**. App Store Connect itself stores the reusable images and videos; Apple Ads may use a custom product page as an ad variation source, but campaign/ad activation remains an Apple Ads concern.

## Read-only API contract

1. Resolve the selected app's library with:
   `GET /v1/apps/{appId}/assetLibrary`
2. List candidate assets with:
   `GET /v1/appAssetLibraries/{libraryId}/images?filter[state]=APPROVED&include=placements&fields[appAssetLibraryImages]=category,createdDate,lastModifiedDate,fileName,fileSize,imageAsset,referenceName,specId,state,stateDetails,placements&fields[appAssetLibraryPlacements]=mediaType,placementType,placementGroup,createdDate,lastModifiedDate,state,stateDetails,image,video,appStoreVersionLocalization,appCustomProductPageLocalization,appEventLocalization`

   Use the parallel `/videos` endpoint and request `videoAsset,previewFrameImage,previewFrameTimeCode` instead of `imageAsset`.
3. Keep only candidates that have a returned placement whose state is `PARENT_APPROVED`. Apple documents that a placement state mirrors the review state of its parent App Store surface. This makes the importer production-only instead of importing draft, in-review, or unused library assets.
4. Treat `imageAsset.templateUrl` as an Apple-rendered display/thumbnail URL by substituting `{w}`, `{h}`, and `{f}`. Do not assume it is a lossless source-file download. For a processed video, Apple documents `videoAsset` as the delivery URL. Flo Studio revalidates the approved record immediately before copying bytes, accepts only Apple delivery hosts, enforces the existing 25 MiB library limit, and retains the source provenance.

## Scope and safety

- All Apple calls are `GET` only.
- Flo Studio does not create, change, archive, delete, submit, reorder, or place any Apple asset.
- Imports remain isolated to the selected Flo Studio product and preserve Apple asset ID, state, placement types/groups, source URL, and timestamps.
- Deduplicate with the selected product plus the Apple asset ID and placement ID. A reusable Apple asset can legitimately appear on more than one approved placement.
- The implementation must not call Apple Ads or create, modify, pause, or activate any Apple Ads campaign/ad variation.

## Notes from authenticated App Store Connect inspection

On 2026-10-30, the owner browser showed Auto Wizard in `Ready for Distribution` and App Store Connect exposes its **Asset Library** under Growth & Marketing. Its current product-page header panel reported `0 of 1 Header Asset`; no asset was changed.

## Official sources

- Apple: [Manage your App Store assets](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-your-app-store-assets/)
- Apple: [App Asset Library API](https://developer.apple.com/documentation/appstoreconnectapi/app-asset-library)
- Apple: [Read an app’s asset library](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-apps-_id_-assetlibrary)
- Apple: [List related images](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-appassetlibraries-_id_-images)
- Apple: [List related videos](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-appassetlibraries-_id_-videos)
- Apple: [App Asset Library Asset State](https://developer.apple.com/documentation/appstoreconnectapi/appassetlibraryassetstate)
- Apple: [App Asset Library Placement State](https://developer.apple.com/documentation/appstoreconnectapi/appassetlibraryplacementstate)
- Apple: [Uploading and managing image assets](https://developer.apple.com/documentation/appstoreconnectapi/uploading-and-managing-image-assets)
- Apple: [Placing assets on App Store surfaces](https://developer.apple.com/documentation/appstoreconnectapi/placing-assets-on-your-app-store-surfaces)
- Apple Ads: [Create ad variations](https://ads.apple.com/app-store/help/ads/0077-create-ad-variations)
