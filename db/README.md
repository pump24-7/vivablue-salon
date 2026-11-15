# Database migration process
`db/001_init.sql` is the v0.1 archival snapshot ONLY. The v0.2 workflow uses immutable
`db/migrations/001_v01_baseline.sql` followed by `002_v02_salon_experience.sql` and `003_v03_retire_rewards_memberships.sql`.
Set `MIGRATION_DATABASE_URL` to an authorized salon migration user, from repository root run
`npm --prefix apps/api run migrate`. Schema version+SHA-256 tracked in `schema_migrations`,
under transaction advisory lock. Never use the Nestease production database or run an old
init SQL in place of migrations. Backup first, rehearse on staging, and have a rollback plan.

**v0.3 legacy retention:** Migration 003 disables publication of existing subscription plans and any rewards issuance configuration. It does not delete historical data or cancel externally billed subscriptions.
