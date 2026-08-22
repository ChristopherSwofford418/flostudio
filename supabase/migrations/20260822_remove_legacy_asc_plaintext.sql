-- Legacy portfolio metadata briefly accepted App Store Connect private-key text.
-- Remove it everywhere so the protected encrypted vault is the only key store.
update public.products
set source_facts = coalesce(source_facts, '{}'::jsonb)
  - 'ascPrivateKey'
  - 'ascIssuerId'
  - 'ascKeyId'
  - 'ascKeyType'
  - 'ascVendorNumber'
  - 'ascStatus'
  - 'ascMetrics'
  - 'ascSyncedAt'
where source_facts ?| array['ascPrivateKey', 'ascIssuerId', 'ascKeyId', 'ascKeyType', 'ascVendorNumber', 'ascStatus', 'ascMetrics', 'ascSyncedAt'];
