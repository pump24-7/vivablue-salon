# Database migration process
`db/001_init.sql` is the v0.1 archival snapshot ONLY. The current workflow uses immutable
`db/migrations/001_v01_baseline.sql` followed by `002_v02_salon_experience.sql`, `003_v03_retire_rewards_memberships.sql` and additive `004_customer_notifications.sql`.
Install dependencies with `npm --prefix apps/api ci`, then set `MIGRATION_DATABASE_URL` to an authorized salon migration user in `apps/api/.env` or the shell. From the repository root run
`npm --prefix apps/api run migrate`. The command loads that environment file before importing database code. The root entry point delegates to `apps/api/src/migrations.ts`, so `pg` resolves from the API package without `NODE_PATH`, a root install or global dependencies. Schema version+SHA-256 is tracked in `schema_migrations`,
under a transaction advisory lock, including first-time ledger creation. Each migration and its ledger entry commit together; a checksum mismatch aborts. Never use the Nestease production database or run an old
init SQL in place of migrations. Backup first, rehearse on staging, and have a rollback plan.

**v0.3 legacy retention:** Migration 003 disables publication of existing subscription plans and any rewards issuance configuration. It does not delete historical data or cancel externally billed subscriptions.

**Existing databases without a ledger:** An old initialization-only database cannot be automatically adopted by this command; it will fail on pre-existing objects. Do not drop tables, edit applied SQL or invent ledger entries to get past this. Rehearse a separately reviewed baseline/adoption plan on a backup copy. Stage 1 leaves all three migration files unchanged.

**Regression verification:** `npm --prefix apps/api run test:integration` requires `TEST_DATABASE_URL` pointing to a disposable local PostgreSQL database named `vivablue_test` (or `vivablue_test_*`). Supply a bare URL without query parameters or fragments; connection overrides are rejected. It never falls back to `DATABASE_URL`. The suite installs `pgcrypto`/`btree_gist` in that test database and creates unique schemas without deleting existing records. Use a test database account allowed to create those extensions and schemas. Tests exercise the actual npm migration command, `.env` loading, concurrent fresh runs, repeated runs, checksum rejection and transactional failure. Test schemas remain for inspection; use a temporary container as described in `docs/STAGE1_STABILIZATION.md`.

**Customer inbox (Stage 3):** Migration 004 adds only the inbox table/indexes. It does not backfill or modify old appointments. The configured API runtime role needs SELECT, INSERT and UPDATE on `customer_notifications`; the isolated `seed:dev` command supplies these grants locally. Appointment status, audit and notification writes commit together, so missing privileges correctly prevent the entire mutation. See `docs/STAGE3_VALIDATION.md`.
