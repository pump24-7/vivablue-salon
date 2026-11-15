# Viva Blue Salon v0.3 - blue brand refresh / no rewards or Club

**This source supersedes v0.2 for the owner-reviewed visual direction.** See `docs/BRAND_REFRESH_V03.md` for the verified changes and limitations.

# Engineering foundation (started in v0.2)

**State: v0.3 source deliverable / NOT production-certified.** The application is a non-destructive fork of a previous Nestease-to-salon **v0.1 source conversion**, supplied in `Viva_Blue_Salon_Converted_Source_v0.1.zip`. It is not connected to actual salon credentials, salon staff records, booking calendars, payment accounts or live customer data. Do not deploy to clients or accept live payment without completing the gates below.

## What's included

- **Mobile (Expo/React Native):** official-site logo reference, bright-blue/lilac design, bilingual home, services, lookbook and favorites, My Viva appointments, events, products, time/artist selection and consent. Rewards and Club are removed.
- **API (Fastify/TypeScript):** OIDC/JWKS, PostgreSQL appointment scheduling and overlap protection, modifiers, timezone pricing, manager scheduling, events, favorites, media moderation and historical finance review. Membership checkout and rewards endpoints have been removed.
- **Admin (Next.js):** a new salon operations workspace with organization OIDC PKCE sign-in, encrypted short-lived HTTP-only cookies, same-origin proxied API calls and manager-role authorization performed on the backend. No raw manager token input on screen.
- **Migrations:** immutable SQL migration files with SHA-256 verification, advisory migration lock, transactionality and explicit migration command. The previous init-only SQL remains archival reference, NOT the current apply path.

## Verified source-grounded facts

The salon's public website (accessed 2026-11-07) lists haircuts, hair color, balayage/highlights, extensions, styling, keratin treatments, makeup, eyebrow waxing and eyelash lifts, in English/Spanish. The salon website features a bright-blue script/logo and flower motif; the v0.3 owner review applies blue/lilac accents and hair photography. Website text does NOT establish current staff names, durations, membership costs, event dates, appointment provider integration, legal policy or pricing. Those are **not invented or pre-seeded**.

The official salon logo is linked from https://vivabluesalon.com/images/... (not yet downloaded into the project). Reference lookbook images from the same source exist in `src/gallery.ts` as **DEMO ONLY**, gated by `EXPO_PUBLIC_DEMO_GALLERY=true`. Database lookbook entries are seeded UNPUBLISHED with `rights_confirmed=false`; manager must document rights/consent before publication. Third-party images, photographer rights and model releases must be reviewed independently.

## Project layout

- `apps/api/` Fastify app, experience/media modules, scheduling and tests
- `apps/mobile/` Expo Router screens, styling helpers, demo website references
- `apps/admin/` Next 15 admin, `/api/auth/*` OIDC authorization code + PKCE, protected `/api/bridge/[...path]`
- `db/migrations/001_v01_baseline.sql` initial salon database (from v0.1)
- `db/migrations/002_v02_salon_experience.sql` additive salon experience tables
- `db/migrations/003_v03_retire_rewards_memberships.sql` non-destructive retirement safety constraints
- `db/migrations/004_customer_notifications.sql` additive customer appointment inbox
- `scripts/migrate.ts` migration command entry point; `apps/api/src/migrations.ts` owns the immutable ledger and API dependencies
- `scripts/prune_media.ts` abandoned private media cleanup
- `docs/` design, privacy, finance, QA, change map and deployment gates

Current customer workflow changes and evidence: [Stage 3 validation](docs/STAGE3_VALIDATION.md). Profile editing, shared EN/ES preference, server booking quotes and an in-app appointment inbox are implemented; native device acceptance remains open.

## Local developer workflow

For the isolated Stage 2 database, local Keycloak sign-in, synthetic salon fixtures and verified browser workflow, follow [the development guide](docs/DEVELOPMENT.md). The manual steps below support an independently configured development identity provider. Choose one setup path: the isolated setup preserves existing manual environment files and refuses to overwrite them.

Use a separate development database. Never point these commands at a live salon or Nestease database. Node **24.22.1** (`nvm use`) and npm **11.9.0** were used for Stage 1; the minimum supported Node version is 22.13.0. Install Docker Compose, and use test OIDC clients for interactive sign-in. Each application has its own npm lockfile; no root dependency installation is required.

From the repository root:

```bash
npm --prefix apps/api ci
npm --prefix apps/mobile ci
npm --prefix apps/admin ci
# First setup only: preserve existing environment files if already configured.
cp -n apps/api/.env.example apps/api/.env
cp -n apps/mobile/.env.example apps/mobile/.env
cp -n apps/admin/.env.example apps/admin/.env.local
docker compose up -d postgres
docker compose exec postgres pg_isready -U vivablue -d vivablue
```

Edit the local environment files before continuing:

- API: `DATABASE_URL` is the runtime connection; `MIGRATION_DATABASE_URL` is the separately authorized migration connection. The example uses a development-only local account. Set `AUTH_ISSUER`, `AUTH_AUDIENCE`, `AUTH_JWKS_URL` and `CORS_ORIGINS`. Keep `MEDIA_UPLOADS_ENABLED=false`. No payment-enabled runtime configuration exists.
- Mobile: set `EXPO_PUBLIC_API_URL` to an address reachable from the device. Android emulator usually uses `http://10.0.2.2:4000`; a physical phone needs the computer's LAN address or a development HTTPS endpoint. `localhost` on a phone means that phone. Set a public native OIDC client ID, issuer and audience matching the API; register `vivablue://auth/callback` as the redirect used by `src/session.tsx`. Never place secrets in `EXPO_PUBLIC_*` variables.
- Admin: set the private backend origin, application origin, organization OIDC client, matching `/api/auth/callback` redirect, and a locally generated `VIVABLUE_COOKIE_SECRET` of at least 32 random characters. Use provider-approved development redirect URLs. A provider integration and API token audience still require end-to-end verification.

Wait for PostgreSQL readiness, then run:

```bash
npm --prefix apps/api run migrate
npm --prefix apps/api run typecheck
npm --prefix apps/api run build
npm --prefix apps/api test
npm --prefix apps/mobile run typecheck
npm --prefix apps/mobile test
npm --prefix apps/admin run typecheck
npm --prefix apps/admin run build
```

API `dev`, `start` and `migrate` automatically load `apps/api/.env` if it exists; explicitly exported variables take precedence. Migration SQL is not automatically applied by Docker or API startup. Do not apply archival `db/001_init.sql` to a migrated database. Use separate migration/runtime accounts outside the disposable local environment.

Run these in separate terminals from the repository root:

```bash
npm --prefix apps/api run dev
npm --prefix apps/admin run dev
npm --prefix apps/mobile start
```

The Expo command starts Metro for a **development client**; a QR code alone does not install that client. `expo-dev-client` is now included. For Android, install Android Studio, the SDK, JDK 17 and an emulator or USB-debuggable device, then run `npm --prefix apps/mobile run android`. For an iOS simulator, use a Mac with Xcode and CocoaPods, then run `npm --prefix apps/mobile run ios`; a physical iPhone additionally needs Apple signing/provisioning (`npm --prefix apps/mobile run ios -- --device`). Native builds can generate `android/` or `ios/` directories. Internal EAS development profiles are included; account/project binding, native builds and signing still require configuration. No remote build or deployment has been performed.

Without a configured identity provider, the public catalog can be exercised but authenticated booking cannot be completed through the mobile UI. Services are deliberately seeded unbookable. Managers must configure approved qualifications, shifts, durations, pricing, consultation requirements and bilingual policies before enabling booking. The automatic regression suite supplies synthetic data and a local test issuer in isolation; it does not create production staff or bypass application authentication. See [Stage 1 verification](docs/STAGE1_STABILIZATION.md) for its commands and remaining limits.

## Implementation safety and status

- **No app price invented:** services are seeded with `is_bookable=false`, no approved time or price. Peak rules exist but are inactive until manager approval. Events/products start without publicly purchasable inventory; Club memberships are retired.
  The separate, guarded `seed:dev` command adds a clearly labeled synthetic service in `vivablue_dev` only. It does not change the nine original service categories or establish real salon pricing.
- **Real slots:** server generates UTC instants based on salon's IANA timezone, stylist shifts, service length + chosen modifiers + buffer, existing booked/pending appointments, closures and time off. PostgreSQL `btree_gist` exclusion constraint guards concurrent overlapping stylist appointments.
- **Appointments remain requests:** manager confirms. Consultation acknowledgment plus salon-published policy acknowledgment required. Appointment quoted amount is a recorded estimate, not an automatic debit.
- **Membership payments:** retired in v0.3. No checkout, subscription creation or invoice-to-reward code remains active.
- **Finance:** historical finance exceptions remain reviewable. Refunds, disputes, tax filing and payout reconciliation are **NOT COMPLETE**. There are no active checkout routes in v0.3; payment features would require a new reviewed implementation.
- **Uploads:** disabled by default. Optional signed S3 PUTs, HEAD confirmations and manual moderation are implemented. Approved uploads do not automatically become a public lookbook image. Rights, retention and secure delivery require an operator-reviewed workflow.
- **Retail:** inventory and sensitivity disclosures can be maintained; product browse is in-salon-only. Web purchase/stock reservation and shipping are not implemented.
- **Events:** FREE events can be registered with transactional capacity enforcement; paid events are blocked, not silently treated as free.
- **Memberships:** Club is retired. Legacy tables are kept under migration constraints to preserve historical financial records.
- **Language:** core customer flows use English/Spanish switching; full localization audit, screen readers, consent language, date/numeric formats and right-to-left future support remain pending.
- **Staffing:** profile images/portfolio-to-stylist assignment, resource-level chairs/bowls, chemical processing stages, walk-ins, late arrivals and multi-service itinerary scheduling remain follow-on product requirements.

## Historical verification report - 2026-11-11

These are the original delivery results, retained for provenance. The current build and local integration results are recorded in [Stage 1 verification](docs/STAGE1_STABILIZATION.md); `docs/BUILD_REPORT.json` is the original static-only snapshot.

- `npm install` attempted for **api, mobile and admin**. Online registry was unreachable (DNS). `npm install --offline` failed with `ENOTCACHED` due unavailable dependency tarballs. **NO package-resolved TypeScript builds, `npm test`, Next builds or physical app runs have been completed.**
- Source-level TypeScript/TSX syntax parse passed for **40 files** using the host's TypeScript parser.
- `python scripts/check_project.py` v0.1 foundation check passed; v0.3 static checks in `scripts/audit_v03.py` passed **17/17**. The old v0.2 audit is retained as historical text only.
- Database migration SQL not executed against PostgreSQL here; no real AWS, OIDC or iOS/Android credentials were supplied. Billing features are disabled and legacy Stripe subscriptions, if any, require separate merchant review.

## To complete real production verification

Read: `docs/QA_MATRIX.md`, `docs/RELEASE_GATES.md`, `docs/STRIPE_RECONCILIATION.md`, `docs/MEDIA_POLICY.md`, and `docs/SALON_CONSENT_AND_PRIVACY.md`.
