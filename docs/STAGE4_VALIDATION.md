# Stage 4 — salon management

Verified locally on 2026-11-16 UTC against the existing Stage 3 development branch (`6d5f1c8`). Stage 4 extends the existing Fastify/PostgreSQL and Next.js applications. The draft PR remains unmerged. This is development verification, not production certification.

## Implemented behavior

| Area | Result and source |
|---|---|
| Staff profiles | Create/edit names and biographies, activate/deactivate, optionally link an existing staff account. Inactive staff remain visible to management. `apps/api/src/management.ts`, `apps/admin/src/management-panels.tsx`. |
| Qualifications | Explicit service checkboxes replace the bulk “assign published services” shortcut. Removing a qualification needed by an active appointment is rejected. |
| Working calendar | List, create, edit and remove recurring shifts, staff time off and salon closures. Weekly times use the salon timezone; absence/closure inputs require an explicit UTC offset. Overlapping shifts and changes that displace active appointments are rejected. The existing real slot generator is retained. |
| Booking safety | Booking validation, quote/policy reads and appointment insertion share a transaction with a scheduling advisory lock. Calendar, qualification, catalog, pricing and policy mutations use that same lock. A competing closure and booking cannot both claim the interval. PostgreSQL's original appointment exclusion constraint remains intact. `apps/api/src/app.ts`, `db.ts`, `management.ts`. |
| Appointment decisions | The existing review queue now displays end time, recorded quote, selected modifiers, customer note, consultation acknowledgment and policy version. Confirmation/cancellation continues to create customer inbox and audit records atomically. Existing times and quotes survive later catalog edits. |
| Services and modifiers | Managers can create/edit bilingual descriptions, duration, buffer, price, consultation requirement, visibility and bookability. Modifiers can be edited or disabled. Hidden services remain manageable. Earlier service-publish endpoints remain supported. |
| Retail | Create/edit descriptions, approved HTTPS image links, ingredient/sensitivity notes, price and stock; list/hide products. Edits require the stock value the manager reviewed, preventing concurrent stale stock replacement. Zero stock or absent price hides the item. Before/after values are audited. No checkout added. |
| Events | Create/edit bilingual information and capacity, publish/unpublish, review registrations and cancel. Capacity cannot fall below registered seats; time/price changes with registrations are blocked. Cancellation retains and marks registration records cancelled. Paid registration stays disabled; staff must contact attendees outside the app. |
| Lookbook | Create/edit private image records and bilingual captions. Publication requires explicit rights confirmation and a release/license reference. Replacing an image or its source clears publication/rights approval. Withdrawing approval removes customer/favorite visibility without deleting historical favorite records. No real salon image was approved. |
| Uploaded media | Management queue, short-lived private S3 preview route, review note and consent/rights gates. Approval remains private and separate from a public lookbook entry. Actual S3 preview/upload/approval remains unverified and disabled in this development environment. `apps/api/src/media.ts`. |
| Policies and audit | Existing bilingual policies load into the form; managers can review/publish them. Closures support editing/removal; the existing approved peak-rule creation/activation workflow remains. New management mutations and their before/after audit evidence commit together. Audit records have read-only paginated access in the dashboard. |
| Permissions | Only database administrators can search existing accounts and change staff roles. Managers cannot grant roles, JWT role claims cannot elevate permissions, and an administrator cannot change their own role. Revocation takes effect on subsequent API requests; write permissions are rechecked after acquiring the management lock. Initial administrator provisioning remains a controlled operator task. |
| Admin session | Encrypted cookie payload/expiry validation, bounded provider token lifetime, logout origin/header checks, PATCH/DELETE bridge support, upstream timeouts, redirect rejection and no-store responses. Empty DELETE bodies no longer acquire an invalid JSON content-type. `apps/admin/src/sso.ts`, `app/api/auth/*`, `app/api/bridge/[...path]/route.ts`. |
| Dashboard | Existing navigation, blue/lilac styles, tables, cards and logo reference retained. Added associated form labels, duplicate-action guards, an Audit & access tab and management components. One authorized workspace refresh replaces multiple HTTP requests without raising the existing rate limit. |

Migration `db/migrations/005_salon_management.sql` only adds time-off reasons, lookbook/media review evidence and an audit index. Migrations 001–004 and historical financial tables are unchanged. No Rewards, Club, Memberships, subscriptions or payment checkout were introduced. No mobile source, app identifier or branding asset changed.

## Executed validation

Exact validation commands, exit codes and dates are in [STAGE4_COMMANDS.json](STAGE4_COMMANDS.json), including failed attempts. Logs and screenshots are local ignored evidence, not public deliverables or credentials.

| Command | Observed result |
|---|---|
| `npm --prefix apps/api run migrate` | Applied migration 005 to the retained isolated `vivablue_dev` database. Fresh and repeat migration runs also passed in new test schemas. |
| `npm --prefix apps/api run build` | PASS, compiled TypeScript output. |
| `npm --prefix apps/api run typecheck` | PASS, including tests. |
| `npm --prefix apps/admin run typecheck` | PASS. |
| `npm run build` in an isolated copy of `apps/admin` | PASS, Next.js 15.5.29 production compilation, type validation, prerendering and build traces. Copy used the installed dependencies, with no private `.env`; live development output was not reused as build evidence. |
| `npm --prefix apps/mobile run typecheck` | PASS; mobile source unchanged. |
| `npm --prefix apps/api test` | PASS, 13 reported unit-test results, including nested authorization cases. |
| `TEST_DATABASE_URL=<loopback-test-url> npm --prefix apps/api run test:integration` | PASS, 29 reported results: 27 scenarios plus two parent tests. Real PostgreSQL 16, actual HTTP Fastify routes, signed JWTs/local JWKS. New schemas in the existing disposable `vivablue_test_stage3` database; no existing schema/data dropped. |
| `npm --prefix apps/admin test` | PASS, 3 tests exercising actual cookie cryptography, tampering/expiry rejection, short provider lifetimes and mutation-origin checks. Node reports a harmless module-type inference warning for the existing package format. |
| `npm --prefix apps/mobile test` | PASS, 19 tests across 5 suites. Actual React Native components/session logic with mocked network/native adapters; not installed-device evidence. |
| `python scripts/dev/verify-browser.py` | PASS, 13 real local provider/customer/API/admin checks: SSO, PKCE, account creation, refresh/revocation, profile, quote, request, admin confirmation/cancellation and inbox isolation. |
| `python scripts/dev/verify-management.py` | PASS, 10 real Chromium management checks: service/staff/qualification/shift/time-off/slot/inventory/event/closure workflows, private-image publication gates, audit display, denied manager privilege changes, narrow layout, CSRF and actual sign-out. |
| `python scripts/audit_v03.py` | PASS, 17/17 static safeguards. Static scanning is not runtime verification. |
| `node scripts/dev/check.mjs` | PASS, verified-TLS OIDC discovery, API/database, protected admin page and actual Expo Metro. |

The new database scenarios also verify concurrent booking versus closure, stale concurrent stock saves, preserved appointment prices/durations, event registration protection, image withdrawal/favorites, disabled storage review, immediate role revocation and full rollback when audit insertion fails. Existing checksum, migration concurrency, failed migration, double-booking, notification rollback and customer isolation tests still pass.

The positive administrator role-change boundary was tested with real signed JWT/API/database integration. The browser test uses a manager and verifies that administrator-only controls/endpoints are denied; an administrator's role-picker UI was not exercised with a real organization account. S3 calls and private object scanning were not mocked into a claim of successful provider integration.

## Failures found and resolved during verification

- Initial readiness failed with `ECONNREFUSED`: development processes were stopped between sessions. Restarted the existing local PostgreSQL container and local app/provider wrappers; retained its volume and realm.
- Initial new integration suite reported 27/29 passing because an assertion compared `...00.000Z` with `...00Z`. Normalized that test timestamp; all 29 pass. No scheduling behavior was relaxed.
- First management browser run found a non-exact accessible label on wrapped stylist/select controls. Associated labels with explicit IDs. A temporary missing JSX closing label during that edit was caught by TypeScript and corrected before final builds.
- Next browser pass found empty DELETE requests carrying `application/json`; Fastify rejected them with HTTP 400. Corrected headers/body forwarding, retaining CSRF checks.
- Rapid browser operations hit the unchanged 120-request/minute API limit because refreshes fetched several endpoints. Added one manager-authorized workspace snapshot; the full workflow now passes with the same limit.
- The readiness script assumed exactly nine non-fixture public services, which ceased to be true after legitimate catalog creation tests. It now checks unique records, bilingual fields and the seeded test service; fresh-schema regression still verifies the original nine service categories.
- A later browser audit assertion used `closure.patch` instead of the implemented `closures.patch` action. Corrected the test; audit data itself was present and correct.

## Remaining gates and practical limits

- **Existing logo URL is broken:** the retained official-site image returned HTTP 404 during this run and appears as fallback alt text in screenshots. An owner-approved bundled original logo or approved CDN asset is still required. Colors, layout direction and logo constants were preserved; no substitute artwork was invented. Curl returned process exit 0 because this was an HTTP-header inspection, not a `--fail` success assertion.
- Actual private-media storage, scanning, EXIF removal, safe derivative images/CDN publication, consent withdrawal and scheduled retention require approved provider configuration and end-to-end tests. Metadata checks and a human checkbox do not constitute malware/content scanning. Uploads remain disabled here.
- Owner approval is still needed for real staff identities/qualifications/schedules, service/product prices, consultation and cancellation policies, privacy/legal copy, images/releases and role assignments. Tests use synthetic fixtures only.
- No external event or appointment email/SMS/push delivery. Appointment inbox updates work; event cancellation changes records but staff must contact attendees. No paid event, retail, deposit, refund or live Stripe operation was enabled.
- Organization MFA, recovery/email verification, global identity-provider logout/revocation and emergency account procedures remain provider/operations work. App sign-out deletes its own session; it does not terminate the browser's organization-wide SSO session.
- Scheduling mutations use a short transaction lock per database schema, appropriate to the current single-salon model. Multi-location throughput, chair/bowl resources and processing-stage scheduling need separate design/load testing. Direct privileged SQL outside these API transactions is not made safe by this application lock; the original database overlap constraint still protects appointment overlap.
- General catalog/policy edits remain last-save-wins; stock edits specifically detect stale stock. High-volume lists need additional search/pagination (appointments currently show 200, lookbook 200, upload queue 100). Staff permissions remain the existing application-wide role model, not multi-location tenancy or a dedicated stylist portal.
- Existing mobile/admin dependency findings, monitoring, backup/restore drills, deployment configuration and release controls remain open. No dependency upgrades were made in Stage 4. An npm reinstall was unnecessary: no new packages or lockfile changes.
- No native iOS/Android build, physical device, native sign-in/SecureStore, VoiceOver/TalkBack or full linguistic/visual approval was performed. A passing Next production build does not certify native or production operations. The desktop/narrow browser screenshots are limited visual evidence.

## Upgrade and operate locally

Use the existing [development guide](DEVELOPMENT.md). On an already configured Stage 3 **development** checkout, with its local database running:

```bash
npm --prefix apps/api run migrate
node scripts/dev/run.mjs auth    # separate terminal; configured Keycloak binary
node scripts/dev/run.mjs api     # separate terminal
node scripts/dev/run.mjs admin   # separate terminal
node scripts/dev/run.mjs mobile  # separate terminal
node scripts/dev/check.mjs
```

Do not start a second wrapper for a service already running. Migration 005 adds columns to already-granted tables, so the existing development runtime role requires no new table grants. For a fresh checkout, follow `npm ci`, guarded setup, migration and fixture seeding in the guide. Never run development seeding against operational data.

Open the admin at `http://localhost:3000` on the computer running the stack. Use the generated local manager identity from the private credential file, not pasted tokens. Review a synthetic service, explicitly qualify a synthetic stylist, set shifts/time off, use the real slot generator, submit a customer request and confirm it in Appointments. Review recorded details before confirmation. Resolve existing appointments before a conflicting staff absence/closure or qualification removal. Review audit evidence after changes.

For repeatable browser verification:

```bash
python scripts/dev/verify-management.py
python scripts/dev/verify-browser.py
```

Use the Python/Chromium setup in the development guide. Allow the normal API rate window between repeated full browser suites; the tests deliberately retain synthetic records/audit history and do not reset the database or disable rate limits. The mobile Metro server is real Expo, but its loopback address is not a phone-accessible installation.

Stage 5 should begin with payment/operational decisions and hardening, including the unresolved dependency findings, privacy/media provider verification, event/appointment delivery and recovery/monitoring/backup tests. Keep the existing draft PR unmerged until owner review; no production access, live payment, deployment or merge occurred.
