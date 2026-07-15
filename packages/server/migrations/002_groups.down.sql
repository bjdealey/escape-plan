-- Rollback for 002_groups.sql. Drops all Phase-3 multi-user tables. The
-- back-filled "group of one" rows live entirely in these tables, so dropping
-- them cleanly reverts to the single-user model with no loss to core user data
-- (users, leave_config, plans, etc. are untouched).

DROP TABLE IF EXISTS user_group_privacy;
DROP TABLE IF EXISTS plan_shares;
DROP TABLE IF EXISTS leave_requests;
DROP TABLE IF EXISTS group_invites;
DROP TABLE IF EXISTS group_members;
DROP TABLE IF EXISTS groups;
