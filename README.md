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
- `scripts/migrate.ts` immutable migration ledger
- `scripts/prune_media.ts` abandoned private media cleanup
- `docs/` design, privacy, finance, QA, change map and deployment gates

## Local developer workflow (after network/dependencies are available)

1. **Use a separate Viva Blue database. Never connect to Nestease production.** Install Node.js 22+, Docker and an organization-managed OIDC tenant.
2. `docker compose up -d` starts a PostgreSQL 16 database. The compose file **does not automatically run SQL**.
3. Configure `MIGRATION_DATABASE_URL` with a privileged **salon migration account**, then run `cd apps/api && npm install && npm run migrate`. Root `scripts/migrate.ts` locates migrations relative to its file. Keep this account separate from the runtime DB account.
4. Copy `apps/api/.env.example` to `.env`, configure DB, `AUTH_ISSUER`, `AUTH_AUDIENCE`, `AUTH_JWKS_URL`, CORS, then `npm run build && npm test && npm run dev`. Keep `MEDIA_UPLOADS_ENABLED=false` until policy and infrastructure gates pass. No payment-enabled runtime configuration exists in this release.
5. `cd apps/mobile && npm install && npx expo install --fix && cp .env.example .env && npm run typecheck`. Set public Expo values only. Use an Expo **development build** to verify PKCE and native redirects; do not hardcode secrets. `npm start` runs the app.
6. `cd apps/admin && npm install && cp .env.example .env.local && npm run typecheck && npm run build && npm run dev`. Configure an **organization** OIDC client, redirect URI `https://admin-host/api/auth/callback`, `VIVABLUE_COOKIE_SECRET` (32+ random characters), and private backend URL. The admin page will not prompt for a manager token.
7. Managers configure staff qualifications, real shifts, service durations, approved pricing/consultation requirements, salon policies, gallery rights, and closures. Only then enable a service for booking. Never infer public availability from the original website hours alone.

## Implementation safety and status

- **No app price invented:** services are seeded with `is_bookable=false`, no approved time or price. Peak rules exist but are inactive until manager approval. Events/products start without publicly purchasable inventory; Club memberships are retired.
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

## Honest verification report - 2026-11-11

- `npm install` attempted for **api, mobile and admin**. Online registry was unreachable (DNS). `npm install --offline` failed with `ENOTCACHED` due unavailable dependency tarballs. **NO package-resolved TypeScript builds, `npm test`, Next builds or physical app runs have been completed.**
- Source-level TypeScript/TSX syntax parse passed for **40 files** using the host's TypeScript parser.
- `python scripts/check_project.py` v0.1 foundation check passed; v0.3 static checks in `scripts/audit_v03.py` passed **17/17**. The old v0.2 audit is retained as historical text only.
- Database migration SQL not executed against PostgreSQL here; no real AWS, OIDC or iOS/Android credentials were supplied. Billing features are disabled and legacy Stripe subscriptions, if any, require separate merchant review.

## To complete real production verification

Read: `docs/QA_MATRIX.md`, `docs/RELEASE_GATES.md`, `docs/STRIPE_RECONCILIATION.md`, `docs/MEDIA_POLICY.md`, and `docs/SALON_CONSENT_AND_PRIVACY.md`.
