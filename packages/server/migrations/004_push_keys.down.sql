-- Revert 004_push_keys.sql: drop the Web Push encryption-key columns.
ALTER TABLE push_subscriptions DROP COLUMN IF EXISTS auth;
ALTER TABLE push_subscriptions DROP COLUMN IF EXISTS p256dh;
