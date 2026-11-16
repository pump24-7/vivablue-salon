# Stage 3 — functional customer experience

Verified November 15, 2026 UTC, starting from `a69d74ff98c200903a54f886f4686e4c8469085b` on the existing development branch. This is an incremental change to the Viva Blue v0.3 application. The pull request remains a draft for owner review; nothing is merged or deployed.

## Outcome and evidence boundary

Customer workflow implementation and local verification are complete for this stage. **Native device acceptance remains open.** The actual React Native screens have automated component tests; real browser/provider/API/admin workflows pass separately. Neither those tests nor Hermes exports prove that an Android/iPhone binary installs, that native deep links work, or that SecureStore behaves correctly on a physical device.

| Capability | Implemented behavior | Verification |
|---|---|---|
| Registration / sign-in | Existing provider-hosted registration and PKCE sign-in preserved; sign-in/account creation entry, guarded login, native callback route and provider refresh-token revocation on logout. | Real local Keycloak registration/PKCE/refresh/revocation pass. Native browser return remains unverified. |
| Session lifecycle | One atomic SecureStore token record adopts the old v0.3 keys, shares concurrent refreshes, updates React session state, preserves tokens on temporary refresh failure, and discards responses after sign-out/account changes. | Five request/refresh tests, two cold-start storage tests and an actual SessionProvider test, with native storage/network adapters mocked. |
| Profile and language | Customers edit their own display name and EN/ES preference; role, subject, ID and email cannot be changed through this endpoint. Language is shared across screens/navigation and persisted. | Real API/provider profile updates, permission-negative tests, profile component test and shared-language/race tests pass. |
| Booking | Existing qualified-stylist/shift/modifier workflow retained. Slot responses are discarded after selection changes. Server quotes include approved peak adjustments; submission checks the reviewed price/policy version. Retry keeps the same request key. | Real PostgreSQL concurrency/eligibility tests, browser quote/booking flow, and React Native service selection/consent/retry tests pass. |
| Appointments | Upcoming/history lists, stored quote/modifiers, salon-local timezone, bilingual status, confirmation updates, explicit cancellation review and retry-safe cancellation requests. | Backend/browser confirmation and cancellation pass; actual appointment component tested for Spanish status and sign-out clearing. |
| Saved styles | Save/remove controls reflect the current account, report failures and prevent duplicate taps. Withdrawn or rights-revoked images cannot be newly saved and disappear from customer lists. | Real API rights/ownership tests and Lookbook/Favorites component tests pass. Existing official-site images remain private drafts. |
| Notifications | Persistent in-app appointment updates for request, confirmation, decline, cancellation request, cancellation and completion; owner-only inbox/read state. | Real request/confirmation/cancellation workflow, cross-account isolation, idempotent read and transaction rollback tests pass; actual inbox component tested. |
| My Viva / events / products | Dashboard counts future active appointments, links profile/inbox/saved styles, and refreshes on focus/foreground. Free-event registration now recognizes event IDs and blocks duplicate or past enrollment. Shared EN/ES interface extends through product browsing. | My Viva/events component tests, free-event API tests and builds pass. No retail checkout or paid event purchase added. |

## Source changes

- `apps/api/src/customer.ts`: validated self-profile update and customer inbox routes; appointment/audit/inbox transaction helper.
- `apps/api/src/app.ts`: server quote endpoint, expected-price/policy checks, richer owned appointment details and transactional status notifications. Existing statuses, consultation rules, price calculations and PostgreSQL overlap protection remain.
- `apps/api/src/auth.ts`: database failures return a server error instead of falsely identifying a valid session as expired. JWT verification and database-assigned roles remain mandatory.
- `apps/api/src/experience.ts`: withdrawn favorite guard, event IDs in registrations and past-event enrollment protection.
- `db/migrations/004_customer_notifications.sql`: additive inbox table/indexes only. No historical updates or notification backfill.
- `apps/api/scripts/seed-dev.ts`: require all four migrations and grant the existing development runtime role only SELECT/INSERT/UPDATE access to the new inbox table. The original nine service categories remain unbookable.
- `apps/mobile/src/auth-store.ts`, `api.ts`, `session.tsx`: session storage, refresh, expiry, logout and asynchronous response handling.
- `apps/mobile/src/language.tsx`, `customer-data.ts`, `widgets.tsx`: shared language, guarded customer loading/foreground refresh, existing styled sign-in and language controls.
- Existing customer screens plus new `app/profile.tsx`, `notifications.tsx`, `auth/callback.tsx`: incremental account, appointment and inbox functionality using the existing components/theme.
- `apps/mobile/test/*`, `jest.config.cjs`: actual React Native component/session tests using SDK-compatible Jest Expo. These tests mock native modules and HTTP boundaries; they are not device tests.
- `apps/api/test/integration/stage1.test.ts` extends the existing guarded database suite; `scripts/dev/verify-browser.py` extends the real development-provider/admin workflow.

The official logo reference, color/typography tokens, app identifiers, admin styles, archival init SQL and migrations 001–003 are byte-for-byte unchanged. No Rewards, Club, Membership, subscription or payment functionality was introduced. No photo rights were presumed or public gallery images approved by this work.

## Commands and results

The complete recorded command arguments, durations, exit codes and local evidence paths are in [STAGE3_COMMANDS.json](STAGE3_COMMANDS.json). Commands below run from the repository root unless noted.

| Command / check | Actual result |
|---|---|
| Install mobile test dependencies; update lock metadata | PASS. Added Jest Expo 54, Jest 29, testing-library and React 19.1 renderer as development dependencies. Existing locked package versions did not change. |
| `npm --prefix apps/api run typecheck` / `run build` | PASS including the customer module, developer seeder and integration tests. |
| `npm --prefix apps/api test` | PASS: 13 reported unit-test results, including role subtests. |
| Guarded `TEST_DATABASE_URL=... npm --prefix apps/api run test:integration` | PASS: 17 scenario subtests plus their parent, 18 reported results. Real PostgreSQL, signed JWT/JWKS and Fastify HTTP. |
| `npm --prefix apps/mobile test` | PASS: 19 tests across five suites. No snapshot-only assertions. |
| `npm --prefix apps/mobile run typecheck` | PASS including screen/session tests. |
| `npx expo install --check` / `npx --yes expo-doctor@1.21.8` in mobile | PASS; SDK compatible, Doctor 18/18. |
| `npx expo export --platform android ...` / `--platform ios ...` | PASS; approximately 2.71 MB Hermes bundles per platform. JavaScript/assets only, not signed native binaries. |
| `npm --prefix apps/api run migrate` then `run seed:dev` | PASS against the isolated `vivablue_dev` database only. Migration 004 applied; existing fixture records retained. |
| `python3 scripts/dev/verify-browser.py` | PASS: 13 checks with real local Keycloak, API, PostgreSQL and the existing admin screens, including profile, quotes, inbox and refresh revocation. |
| `node scripts/dev/check.mjs` | PASS: verified-TLS provider discovery, API/database, protected admin and actual Metro server. |
| Live Android/iOS Metro manifests and launch bundles | PASS: HTTP 200 and approximately 6.44 MB per development bundle; no native binary generated. |
| Runtime role / migration checksum / publication-gate probes | PASS: inbox SELECT/INSERT/UPDATE only, no schema creation or legacy writes, four matching migration hashes, nine original services unbookable and official photos unpublished. |
| `python3 scripts/audit_v03.py` / `scripts/check_project.py` | PASS: 17/17 static safeguards and foundation/home checks. |
| Preserved-file comparison / Git whitespace | PASS; original SQL, branding assets/tokens and identifiers unchanged. |
| `npm audit --json` in mobile | Nonzero: 30 affected package entries (5 high, 17 moderate, 8 low). |
| `npm audit --omit=dev --json` in mobile | Nonzero: 28 affected package entries (5 high, 16 moderate, 7 low); npm's peer dependency graph still includes testing/tooling chains. Do not treat this flag as proof of native runtime reachability. |

Dependency findings remain a release blocker. No unreviewed major Expo upgrade, forced audit fix or dependency-security bypass was applied. The additional test tooling increases the recorded package-entry count; the previously locked package versions remain unchanged. API/admin dependencies are unchanged from their earlier recorded audits. App-store/native release assurance is not implied by these results.

## Failures encountered and resolved

1. A second PostgreSQL container failed because Docker's storage copy exhausted the small cloud workspace. Its subsequent integration command correctly failed with connection refused; the initial Jest run also failed creating its cache. Only regenerable npm cache and an earlier isolated admin build output were removed. Tests then used a **new, separate** `vivablue_test_stage3` database and dedicated non-superuser role inside the existing local PostgreSQL instance. Each suite run uses new schemas; the development database and historical records were not cleared. Final database and Jest runs pass.
2. Two new cold-start tests initially used dynamic imports unsupported by the Jest VM configuration. The test harness now uses typed CommonJS imports, with no application workaround or VM security change. The final full mobile suite passes.
3. Both dependency-audit commands return nonzero for actual advisories; those results remain open rather than being reported as successful security validation.

## Safe upgrade and manual acceptance

Use [DEVELOPMENT.md](DEVELOPMENT.md) for startup and device setup. Existing Stage 2 developers should install the updated mobile lockfile, apply the new migration, and rerun the guarded development seeder for the new table permissions:

```bash
npm --prefix apps/mobile ci
npm --prefix apps/api run migrate
npm --prefix apps/api run seed:dev
npm --prefix apps/mobile test
node scripts/dev/check.mjs
```

For an independently configured development database, apply migration 004 using its migration owner and grant its actual runtime role SELECT, INSERT and UPDATE on `customer_notifications`. Do not grant writes to retained financial/program tables. Do not edit applied migrations or rerun archival initialization SQL. No production upgrade is authorized by this guide.

On an installed development client: sign in/register; edit your profile; change language; browse the development service; select modifier/stylist/day/time; review the server quote, consultation and policies; submit; confirm in the admin dashboard; open My Viva → Appointment updates; review details; request cancellation and have staff approve it. Repeat after foregrounding/restarting the app and token expiry. Test saving/removing a rights-approved synthetic gallery fixture and switch accounts to check privacy. The automated database suite supplies synthetic gallery records without publishing real salon images.

## Remaining acceptance and owner/provider requirements

- Choose Android/iPhone and supply a capable build/device environment or configured Expo/EAS account; iPhone requires Apple signing as applicable. This Linux workspace has no SDK/emulator, Xcode or attached phone and very limited disk. No account/signing secret should be pasted into chat or the report.
- Provide device-reachable development API/HTTPS identity endpoints. Cloud loopback addresses and the localhost-only CA certificate do not suffice on a phone. Native callback, OS storage, app restart, system browser behavior and device accessibility still require testing.
- Notifications currently mean the **in-app inbox**, refreshed on screen focus, foreground and every 30 seconds while focused/active. No OS push, email/SMS delivery or reminders are claimed. Those channels require provider accounts, credentials, recipient consent/opt-outs and delivery/retry policy.
- Provider-hosted recovery, email verification, remote access-token/session invalidation and sign-out from the provider's browser session need a configured production-intended development tenant and separate validation. The local realm still disables password-reset email. Local logout clears app tokens and attempts supported refresh revocation; issued access JWTs may remain valid until expiry.
- Real salon prices, schedules, bilingual policies, published imagery/photo releases and support/rescheduling procedures require owner approval. Product descriptions/stylist bios use the existing stored content; full linguistic and VoiceOver/TalkBack review remains open.
- Complete later-stage staff/admin operations, external notifications, dependency remediation, monitoring/backups and release preparation. Stage 3 does not establish production readiness.
