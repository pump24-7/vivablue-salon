# v0.3 QA matrix - scenario-based release testing

**Stage 1/2 status (2026-11-15): builds, local API/database integration, and interactive admin OIDC/PKCE executed.** See [Stage 1](STAGE1_STABILIZATION.md) and [Stage 2](STAGE2_VALIDATION.md). Provider/browser tests do not certify native device behavior or a production release. Never infer runtime success from syntax parsing.

**Stage 3 update:** [Customer workflow verification](STAGE3_VALIDATION.md) adds 19 mobile tests, 18 reported API/database integration results and 13 real provider/browser checks. Native device acceptance remains open.

| Area | Scenario / expected result | Status |
|---|---|---|
| Dependencies | Independent npm lockfiles and `npm ci` API/mobile/admin | PASS on Linux; native platform installs pending |
| Backend TypeScript | `npm run build` and `npm run typecheck` with actual packages | PASS, including test type checking |
| Mobile TypeScript | `npm run typecheck`, Expo SDK compatibility | PASS; see current Expo diagnostic results in Stage 1 record |
| Admin TypeScript | `npm run typecheck` and `npm run build` | PASS |
| Schema | migrate empty database then restart migrate; checksum match | PASS on disposable PostgreSQL 16 |
| Migration conflict | alter copied applied SQL file; checksum mismatch abort | PASS; repository SQL untouched |
| Migration concurrency | two first-time migration commands; one ledger/application | PASS |
| Migration failure | failing copied migration rolls back table and ledger changes | PASS |
| Baseline | v0.1/v0.2 migrations remain immutable; v0.3 adds retirement migration | STATIC REVIEW |
| Authentication | Admin PKCE redirect/state/nonce; SSO role mapped to DB | PASS with local Keycloak and actual admin browser flow |
| Authentication | New customer registration and refresh-token exchange | PASS using separate local public browser test client and actual API; native client flow pending |
| Authentication | Native `vivablue://auth/callback` and SecureStore persistence | NOT VERIFIED; managed browser blocks native scheme; actual devices required |
| API authentication | signed JWT, expired/wrong-audience rejection, DB role overrides token role claim | PASS with local JWKS server |
| Manager hook | manager/admin requests complete; customer/stylist denied | PASS with actual Fastify requests |
| Admin auth | forged/damaged/expired encrypted cookie; no token-paste UI | PASS actual crypto tests; expired private access enforced server-side |
| CSRF | cross-origin POST/PATCH/DELETE and logout rejected | PASS real browser in Stage 4 |
| Booking | two simultaneous clients request same stylist/time => one 409 | PASS with real API and PostgreSQL |
| Booking | non-bookable unapproved service yields no slots | PASS |
| Booking | modifier minutes + buffer prevent adjacent collision | Unit coverage for duration/buffer and busy blocks; full boundary integration pending |
| Booking | qualified stylist, shifts, confirmation, owner-only access, cancellation review and slot release | PASS through manager/customer API routes |
| Booking | customer API request, confirmation/cancellation through existing admin UI | PASS with actual local identity provider; synthetic fixtures only |
| Booking | retry successful booking with same idempotency key | PASS; original appointment returned |
| Booking | inactive modifier returns 409; time off/closures remove slots | PASS real API/database |
| Booking | `salon_closures` removes affected slots | PASS real API/database |
| Booking | day beyond 120-day horizon rejected | NOT RUN |
| Booking | day selection UTC and America/New_York DST spring/fall | UTC conversion and spring-gap unit tests PASS; fall/device selection pending |
| Pricing | enabled peak window adds integer cents; outside window zero | PASS unit tests; approved peak + modifier quote verified through API |
| Pricing | null base remains null, no fabricated price | PASS unit test |
| Pricing | multiple overlapping active peaks choose max surcharge | NOT RUN |
| Consent | no published policies or no policy acknowledgment => booking blocked | PASS integration |
| Consent | consultation type requires explicit acknowledgment | PASS integration |
| Favorites | rights-cleared publication, withdrawal, owner isolation, retry/removal | PASS real API/database and React Native component tests |
| Media | signed PUT expires/HEAD metadata verification | NOT RUN |
| Media | upload requires affirmative image/consent checkbox | STATIC CODE CHECK |
| Media | unreviewed upload never public | STATIC CODE CHECK |
| Events | simultaneous registrations respect capacity lock | NOT RUN |
| Events | nonzero/unknown price cannot book free | STATIC CODE CHECK |
| Retired payments | Checkout, subscriptions and reward-webhooks removed from active API | STATIC AUDIT PASS |
| Finance history | Historical webhook events remain read-only | STATIC AUDIT PASS |
| Finance history | If pre-existing subscriptions exist, operator review/cancellation required | NOT RUN |
| Commerce | retail in-salon stock notes; web checkout disabled | STATIC REVIEW |
| Accessibility | VoiceOver/TalkBack/dynamic type/contrast | NOT RUN |
| Localization | shared EN/ES preference, navigation and customer status | PASS component/profile tests; full linguistic/device review pending |
| iOS and Android | physical auth, deeplink, official logo image loading | NOT RUN |
| Operations | DB backups + restore drills, alerting and rollback | NOT RUN |
| Owner update | Rewards and Club absent from app routes, UI and API | STATIC AUDIT PASS |
| Brand | Official-site hosted image and blue/lilac tokens | STATIC AUDIT PASS; VISUAL DEVICE QA PENDING |
| Legacy migration | Existing subscriptions disabled for publication, history retained | NOT RUN - requires PostgreSQL |

## Minimum test runner commands

```bash
npm --prefix apps/api ci
npm --prefix apps/api run typecheck
npm --prefix apps/api run build
npm --prefix apps/api test
npm --prefix apps/mobile ci
npm --prefix apps/mobile run typecheck
npm --prefix apps/admin ci
npm --prefix apps/admin run typecheck
npm --prefix apps/admin run build
python3 scripts/audit_v03.py
```

Run from the repository root. For database tests, use `TEST_DATABASE_URL` with `npm --prefix apps/api run test:integration` as described in [Stage 1 verification](STAGE1_STABILIZATION.md). `docs/BUILD_REPORT.json` is the historical static-only snapshot. The static checker no longer overwrites it or asserts unexecuted build results; `--output <path>` optionally saves the current static result. No live credentials or real salon data were used.



## Stage 3 additional scenarios

| Area | Scenario | Result |
|---|---|---|
| Profile | self-edit name/language; reject role/identity changes | PASS API, browser/provider and component tests |
| Session | atomic restore, legacy key adoption, one refresh, stale response/privacy guard | PASS mocked-native mobile tests |
| Session | temporary refresh failure retains session; revoked grant clears it | PASS mobile tests; real provider refresh revocation also verified |
| Authentication | database failure returns 500 instead of false expiry | PASS real API/database |
| Booking review | approved peak quote, changed price/policy rejection, stable retry key | PASS backend and actual service component |
| Notifications | transaction rollback, owner-only read, idempotent read/cancellation | PASS API/database, browser and inbox component |
| Events | registration event ID, repeat request, capacity, past-event guard | PASS API/database and event component |
| Physical phone | install, native return, real SecureStore, foreground and expiry | NOT VERIFIED |
| External notifications | push/email/SMS/reminder delivery | NOT IMPLEMENTED; in-app inbox only |

## Stage 4 management verification

See [Stage 4 validation](STAGE4_VALIDATION.md) and its command manifest. Final runs pass 29 API/database results (27 scenarios plus two parents), 13 API unit results, 3 admin security tests, 19 mobile component tests, 13 customer/provider browser checks and 10 management browser checks.

| Area | Scenario | Result |
|---|---|---|
| Staff | explicit qualifications, editable shifts/time off, linked staff profile | PASS API/database and browser |
| Scheduling | reject conflicting shifts/absences/closures/qualification removal; simultaneous booking versus closure | PASS API/database |
| Catalog | edit hidden/public services, buffers, price, consultation and modifiers | PASS API; service forms also browser-tested |
| Inventory | concurrent stale stock rejection, automatic zero-stock hiding, audit evidence | PASS API/database; edit/hide browser-tested |
| Images | rights reference required, replacement withdraws publication and favorites | PASS API/database; private draft/approval gates browser-tested |
| Private media | queue/reject, disabled storage/approval guard | PASS API; real S3 read/write/approval NOT VERIFIED |
| Events | edit/capacity guard/cancel retaining registrations | PASS API/database and basic management browser flow |
| Access | customer/stylist denied; manager cannot elevate; admin grants/revokes; self-demotion blocked | PASS API/database; manager denial also real SSO/browser |
| Audit | rollback mutation on audit failure, read-only dashboard trail | PASS API/database and browser display |
| Admin session | tampering/expiry, provider lifetime, foreign-origin logout/PATCH/DELETE | PASS crypto and browser tests |
| Visual | desktop team controls, narrow audit layout without page overflow | Limited browser verification; hosted logo HTTP 404, approved replacement pending |
