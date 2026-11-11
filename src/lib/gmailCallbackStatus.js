const CALLBACK_MESSAGES = Object.freeze({
  GMAIL_NOT_CONFIGURED: 'Gmail server configuration is incomplete. An owner must check the OAuth client, callback and encrypted storage.',
  GMAIL_RECONNECT_REQUIRED: 'This connection attempt expired or could not be verified. Start a fresh connection in the same browser and finish Google consent once.',
  WORKSPACE_ADMIN_REQUIRED: 'Workspace owner or admin access could not be verified. Sign into your existing workspace before reconnecting.',
  GMAIL_WRONG_SENDER: 'Google returned a different sender account. Reconnect using the requested company mailbox shown below.',
  GMAIL_CLIENT_CREDENTIALS_REJECTED: 'Google rejected the server OAuth client credentials. An owner must verify that the saved client secret belongs to the registered web client. Do not paste it here.',
  GMAIL_GRANT_REJECTED: 'Google rejected the one-time authorization grant. Start a fresh connection; the code may have expired, been used already, or failed callback matching.',
  GMAIL_TOKEN_EXCHANGE_FAILED: 'Google could not complete the server authorization exchange. No Gmail connection was saved.',
  GMAIL_TOKEN_RESPONSE_INVALID: 'Google returned an incomplete authorization response. No Gmail connection was saved.',
  GMAIL_SEND_PERMISSION_MISSING: 'The required send-only Gmail permission or basic identity permission was not returned. Start a fresh connection and complete all requested consent steps.',
  GMAIL_IDENTITY_UNVERIFIED: 'Google did not return a verified sender identity. No Gmail connection was saved.',
  GMAIL_REFRESH_GRANT_MISSING: 'Google did not return the offline authorization required for daily background work. An owner must review the Google grant before reconnecting.',
  EMAIL_DATABASE_ERROR: 'The protected Gmail connection storage operation failed. An owner must check server database access; do not enter a database key here.',
  EMAIL_MIGRATION_REQUIRED: 'The protected email database setup is incomplete. An owner must finish the additive email migration.',
  GMAIL_TEMPORARILY_UNAVAILABLE: 'Google could not complete the secure request. Wait and start a new connection later.',
  GMAIL_SETUP_FAILED: 'The Gmail connection attempt could not be completed. No connection is confirmed; an owner must check the callback configuration.',
})

export function gmailCallbackFailureNotice(value) {
  const code = typeof value === 'string' && Object.hasOwn(CALLBACK_MESSAGES, value) ? value : 'GMAIL_SETUP_FAILED'
  return { code, message: CALLBACK_MESSAGES[code] }
}
