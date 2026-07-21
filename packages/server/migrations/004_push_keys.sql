-- Escape Plan — Phase 5: real Web Push. Add the RFC 8291 payload-encryption
-- keys (p256dh, auth) captured from the browser PushSubscription so the live
-- WebPushChannel can encrypt notifications. Nullable + additive: existing
-- endpoint-only rows remain valid (they are simply skipped by the live channel).
-- Reversible: see 004_push_keys.down.sql.

ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS p256dh TEXT;
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS auth   TEXT;
