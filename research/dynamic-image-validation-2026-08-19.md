# Dynamic AI-Image Validation — 2026-08-19

## Live compatibility finding

The first production render correctly reached the GPT Image endpoint but was rejected because the API no longer accepts the `response_format` request field for `gpt-image-2`. The unsupported parameter was removed in the repaired provider request. FloStudio now relies on the returned base64 image output that GPT Image provides by default.

## Credit protection

FloStudio now records and restores the deducted creative tokens if image generation fails before a usable asset is delivered. The current production retry uses the dedicated enterprise test workspace, a concrete fitness-app launch brief, an explicit hook, and a proof requirement.

## Production render observation

The repaired production request accepted the creative job and moved the Ad Room into its visible **Rendering a new creative round** state. The live interface correctly shows the token debit, the in-progress render status, and the promise that the resulting outputs will be saved to the production library.

## Storage repair retry

After the authenticated `marketing-assets` bucket and user-folder upload policies were provisioned, the production retry again entered the visible rendering state. The request remained in progress beyond the initial 35-second observation window, so completion behavior is being verified before declaring the visual output flow complete.

## Extended render observation

The two-variation request still had not resolved after the extended observation window. The current endpoint generates each variation serially, which risks exceeding a serverless render window. The render path is being changed to return multiple GPT Image outputs from one provider request so the Ad Room does not leave a user in a prolonged pending state.

## Bounded-set retry

The current production validation uses the repaired single-request creative set, which asks GPT Image for the selected number of outputs together rather than serially. The Ad Room is visibly rendering the two-creative set; its result or bounded timeout will determine the final delivery validation.
