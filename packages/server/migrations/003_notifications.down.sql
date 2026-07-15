-- Rollback for 003_notifications.sql. Drops the notification tables only; core
-- user/group data is untouched.

DROP TABLE IF EXISTS notification_unsub_tokens;
DROP TABLE IF EXISTS push_subscriptions;
DROP TABLE IF EXISTS notification_preferences;
DROP TABLE IF EXISTS notification_outbox;
DROP TABLE IF EXISTS notifications;
