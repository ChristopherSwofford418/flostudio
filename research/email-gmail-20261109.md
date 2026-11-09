# Flo Studio Gmail sending recommendation

**Do not promise 100 emails per app per day through one Gmail mailbox.** At 25 apps, the requested volume is **2,500 messages daily**, calculated as `25 × 100`. Standard paid Google Workspace Gmail allows 2,000 messages per user over a rolling 24 hours. All apps sending as the same account share that allowance; separate OAuth clients, aliases, BCC batches, or switching between Gmail API and ordinary SMTP submission do not create new daily allowances. [1] [2]

Recommend a centralized, disabled-by-default campaign queue with documented subscriber consent, human approval, per-app budgets, and a portfolio-wide limiter. Use Gmail API with send-only OAuth only for a small authorized pilot or appropriate individual correspondence. For consented marketing at the proposed portfolio scale, prefer a dedicated email service provider with authenticated branded domains and verified bounce, complaint, and unsubscribe integrations. Changing providers does not make unsolicited mail acceptable or guarantee delivery. [3] [4] [5]

*Verified against official Google sources on November 9, 2026. Author: Manus AI. Research only: no mail sent, accounts connected, billing handled, code changed, secrets accessed, Git modified, or account settings changed.*

## Account limits and SMTP/API differences

**Personal Gmail:** Google's consumer help page says sending more than 500 emails in a day, or addressing one email to more than 500 recipients, can trigger a limit error; sending may resume within 1–24 hours. Treat this as a published threshold, not a guarantee of safe campaign capacity. [7]

**Paid Workspace Gmail:** The standard limits are 2,000 messages per rolling 24 hours, 10,000 total recipient occurrences, 3,000 external recipient occurrences, and 3,000 unique recipients including at most 2,000 unique external recipients. To, Cc, and Bcc recipients count. Mail merge has a separate 1,500-message allowance. Trial accounts have a 500-message daily limit and 500 unique external recipients. After converting from trial, higher Gmail limits may require cumulative payment of $100 and can take up to 75 days after that threshold. Limits can change without notice. [1]

For ordinary Workspace SMTP submission by POP/IMAP clients, Google lists 100 recipients per message; Gmail API permits 500 per message. **These are recipients per message, not daily message caps.** The Gmail API enforces the same user's daily Gmail sending limits across API, built-in/web clients, and SMTP MSA. Exceeding them can block sending for hours or up to 24 hours. A successful API response is not proof of recipient delivery, and quota enforcement may be delayed. [1] [2]

API request quotas are separate from mail-sending caps. Google's current quota page lists 1,200,000 quota units per minute per project, 6,000 per minute per user per project, and 100 units for `messages.send`; qualifying projects used before May 2026 retain prior quotas. More API quota or another project does not increase the Gmail mailbox's daily mail allowance. [2] [8]

Google Workspace **SMTP relay** at `smtp-relay.gmail.com` is a separate administrator-configured service, not ordinary Gmail SMTP submission. Google documents independent relay counting, up to 10,000 messages and 10,000 unique recipients per user per 24 hours, 100 recipients per transaction, organization-wide limits, lower trial/unpaid limits, and abuse enforcement. It is not a `gmail.send` OAuth feature and should not be proposed as an automatic fallback to escape Gmail throttling or policy blocks. Any legitimate future relay deployment would require a separate architecture and administrator authorization. [9]

At one individually addressed promotion per person, 25 apps × 100 exceeds the normal paid mailbox message limit and, if all recipients are distinct external people, its 2,000-unique-external limit. Even 20 apps × 100 would exhaust normal daily message capacity before routine account mail. Use one shared rolling-window counter with conservative headroom; defer excess jobs rather than guaranteeing every app its maximum. Gmail send-only cannot observe all manual or other-client sends, so headroom and explicit operational coordination are necessary. [1] [2] [3]

## Consent, spam policy, and the existing message pattern

The supplied screenshot context describes app promotions from `info@clearpasstechnologies.com`, numerous BCC recipients, bounced addresses, and a request to reply “unsubscribe.” Short plain text and a direct app link do not establish consent or eliminate spam risk. Replace campaign BCC batches with individually addressed messages to verified consenting recipients. Record recipient, app/list, consent source, wording/version, confirmation time, and withdrawal status. Suppress known hard-bounced addresses; investigate repeated soft failures rather than retrying indefinitely. [4] [10]

**AI discovery must not create subscribers automatically.** A publicly listed email address, predicted interest, successful validation, or discovery of a relevant business is not evidence that its owner asked for Flo Studio promotions. Keep prospects in a separate review dataset with no marketing-send eligibility until suitable permission is documented. Google's sender guidelines say not to purchase addresses or send to people who did not sign up. Its subscription guidance calls for confirming an address after the person enters it on a website or app, described as double consent. Consent to one app should not silently subscribe someone to all portfolio apps. [4] [10]

Gmail Program Policies expressly prohibit distributing spam or unsolicited commercial mail and prohibit circumventing policies or account restrictions, including using multiple accounts for previously prohibited behavior. Do not rotate accounts, aliases, domains, or OAuth clients to evade caps, spam enforcement, or suspensions. Distinct legitimate organizational mailboxes may have separate user limits, but are not a sanctioned limit-bypass system. Workspace abuse can result in immediate user suspension and, for domain-wide problems, suspension of the entire account and administrator access. [5] [6]

**Law and Google policy are separate gates.** Google's policy also prohibits mail violating CAN-SPAM or other anti-spam laws. A campaign that may be lawful under a jurisdiction's marketing rules can still violate Google's prohibition on unsolicited commercial Gmail or fail recipient-side sender requirements. Conversely, OAuth approval, consent, or Google authentication does not certify legal compliance. Before enabling campaigns, obtain appropriate review of recipient jurisdictions, permission or other legally permitted basis, sender identification, any required postal address/ad disclosure, opt-out mechanism and deadlines, and privacy obligations. This report gives technical and Google-policy guidance, not legal advice or a finding that the existing messages are lawful. [5]

The screenshot's Workspace billing-renewal warning with a December 2 deadline is a separate owner-managed readiness dependency. This research does not establish current subscription entitlement and does not authorize payment or billing changes.

## Bulk sender rules and unsubscribe implementation

Google's recipient-side requirements apply to sending to personal `@gmail.com` and `@googlemail.com` accounts, regardless of whether the sender uses Workspace or an external provider. They are not the same as the sender mailbox's daily cap and do not apply to inbound Workspace accounts under this particular guideline. Google's FAQ classifies senders sending **close to 5,000 or more** messages to personal Gmail accounts within 24 hours as bulk senders. All mail from the same primary domain, including subdomains, counts together; classification is permanent once assigned. The proposed 2,500/day alone is below that approximate threshold, but other domain traffic or prior bulk status can change the result. Being below it is not an anti-spam exemption. [4] [11]

All senders must meet Google's baseline requirements, including SPF or DKIM authentication, valid forward/reverse DNS for sending infrastructure, TLS, RFC 5322 formatting, and low spam rates. Bulk senders additionally need SPF **and** DKIM, DMARC with at least `p=none`, and From-domain alignment with SPF or DKIM. Google recommends keeping Postmaster Tools spam rates below 0.10% and avoiding 0.30% or higher. Enforce the bulk-ready standard from the start; rely on the provider for infrastructure DNS/TLS, but verify authentication for each branded sending domain. [4] [11]

For bulk marketing/promotional mail, implement RFC 8058 one-click unsubscribe **and** a clearly visible unsubscribe link in the body. Google's wider subscription guidance recommends one-click for all subscription messages and honoring requests within 48 hours. Use these headers with a real HTTPS POST endpoint: [4] [10] [11]

```text
List-Unsubscribe: <https://YOUR-CONTROLLED-DOMAIN/unsubscribe/OPAQUE-TOKEN>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

The endpoint must remove the recipient from the associated list directly without login, a preferences-page requirement, or another confirmation action. A body link can separately offer preferences. A `mailto:` link or “reply unsubscribe” is not an RFC 8058 one-click substitute. Use an app-specific `List-ID` or distinct verified From address for each list, with an additional portfolio-wide opt-out option; do not re-enroll unsubscribers through AI discovery. Keep receipts, password resets, and other genuine transactional messages separate from marketing rather than embedding promotions to avoid unsubscribe requirements. [4] [10] [11]

## Least-privilege OAuth and scheduled execution

`https://www.googleapis.com/auth/gmail.send` is a **sensitive**, not restricted, scope described as “Send email on your behalf.” It authorizes `users.messages.send` without granting mailbox-reading access. Do not request `gmail.compose`, `gmail.modify`, `gmail.readonly`, or `https://mail.google.com/` for a send-only feature. SMTP XOAUTH2 uses the broader restricted `https://mail.google.com/` scope; prefer Gmail API for narrow send permission. [3] [12] [13]

**Send-only limitation:** the worker cannot inspect inbox bounces, replies requesting unsubscribe, or existing correspondence. Do not label bounce/reply suppression “automatic” when only `gmail.send` is authorized. For a pilot, have an authorized human review the inbox and enter hard bounces and opt-outs into suppression records before further sending. An application-owned HTTPS unsubscribe endpoint can update its own subscription database without Gmail read access. For scalable delivery telemetry, use a separately authorized provider offering bounce/complaint webhooks. An optional future `gmail.readonly` integration could inspect bounce and unsubscribe messages, but it is a restricted scope with additional verification and, when restricted data is stored or transmitted through servers, security-assessment implications. It needs separate user authorization and is not recommended merely for convenience. [3] [4]

For future unattended sends, use the server-side authorization-code flow with `access_type=offline`, exact registered redirect URI, CSRF `state`, and explicit user consent. Store the issued refresh token securely in durable backend storage, not source control, browser storage, or logs. Verify that `gmail.send` was actually granted. Obtain fresh access tokens using the stored refresh token and Google's client-library refresh support or the token endpoint; use `expires_in` instead of a hard-coded lifetime. Refresh when required by the scheduled worker, not by repeatedly reconnecting accounts or launching an interactive login daily. [14]

An External OAuth app left in **Testing** receives refresh tokens expiring after seven days when requesting Gmail scopes; refreshing access tokens does not remove that expiry. Production publishing and OAuth verification are separate matters. A public external send integration generally needs sensitive-scope verification, including verified domains, homepage/privacy policy, scope justification, and an end-to-end demonstration. `gmail.send` alone does not trigger the restricted-scope security assessment. Google's genuine personal-use and organization-owned Internal-app exemptions may apply; Internal means only users in that Workspace/Cloud Identity organization, not arbitrary portfolio customers. Do not presume an exemption simply because only one mailbox is initially connected. [3] [15] [16] [17]

Refresh tokens can stop working following revocation, six months of non-use, password changes involving Gmail scopes, admin policy, time-limited grants, or token-count limits. On permanent refresh failure, pause jobs and request reconnection; never switch accounts automatically. Reuse a central grant where appropriate rather than minting refresh tokens for every app or each scheduled run. [15]

## Recommended architecture and release gate

Keep prospect research and message drafting separate from the sending pipeline. An application-owned scheduler should enqueue only eligible, approved campaign jobs. A centralized outbox worker should recheck consent and suppression immediately before each individual send, reserve rolling account/recipient budgets atomically, apply a per-app maximum of 100 only within the global allowance, and use a unique campaign-recipient key to prevent duplicate jobs. Maintain explicit `draft`, `approved`, `queued`, `submitted`, `failed`, and `delivery-unknown` states rather than equating an API response with delivered mail. Rate-limit sends steadily, use bounded exponential backoff for transient API errors, and pause on mail-limit or abuse failures. Do not blindly retry an ambiguous send outcome. [1] [2] [4] [8]

For a low-volume Gmail pilot, the owner must explicitly approve the mailbox, scope, campaign, recipient-consent evidence, budgets, and manual bounce/reply handling. For the 25-app marketing target, select an appropriate email provider and verify its unsubscribe and delivery-event integration before increasing scale. Keep all connectors and scheduled sending disabled until that authorization and readiness review occur. This report authorizes neither implementation nor sending.

## References

[1]: https://knowledge.workspace.google.com/admin/gmail/gmail-sending-limits-in-google-workspace "Gmail sending limits in Google Workspace"
[2]: https://developers.google.com/workspace/gmail/api/guides/handle-errors "Resolve Gmail API errors and shared mail sending limits"
[3]: https://developers.google.com/workspace/gmail/api/auth/scopes "Choose Gmail API scopes"
[4]: https://support.google.com/mail/answer/81126?hl=en "Email sender guidelines"
[5]: https://www.google.com/gmail/about/policy/ "Gmail Program Policies"
[6]: https://knowledge.workspace.google.com/admin/gmail/spam-and-abuse-policy-in-gmail "Spam and abuse policy in Gmail"
[7]: https://support.google.com/mail/answer/22839?hl=en "Limits for sending and getting personal Gmail mail"
[8]: https://developers.google.com/workspace/gmail/api/reference/quota "Gmail API usage limits"
[9]: https://knowledge.workspace.google.com/admin/gmail/advanced/route-outgoing-smtp-relay-messages-through-google "Route outgoing SMTP relay messages through Google"
[10]: https://support.google.com/mail/answer/15263077?hl=en "Email subscription guidelines for senders"
[11]: https://support.google.com/mail/answer/14229414?hl=en "Email sender guidelines FAQ"
[12]: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send "Gmail users.messages.send method"
[13]: https://developers.google.com/workspace/gmail/imap/xoauth2-protocol "Gmail XOAUTH2 protocol and full-mail SMTP scope"
[14]: https://developers.google.com/identity/protocols/oauth2/web-server "OAuth 2.0 for web server applications and offline access"
[15]: https://developers.google.com/identity/protocols/oauth2 "OAuth 2.0 and refresh token expiration"
[16]: https://support.google.com/cloud/answer/13464321?hl=en "OAuth app verification requirements"
[17]: https://support.google.com/cloud/answer/13464323?hl=en "When OAuth verification is not needed"
