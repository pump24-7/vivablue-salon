# Stage 1 — build stabilization

Verified on **2026-11-15 UTC**, against source base `d5371a4f38a27aa1e65811b4769278575685dfb4`. Work is local and uncommitted. No push, pull request, deployment, live payment, production database or production identity-provider connection was performed.

## Result and scope

The approved Stage 1 build and startup defects are fixed. The API compiles, the admin production bundle builds, all three TypeScript checks pass, and the mobile project passes the Expo SDK compatibility and doctor checks. Local regression tests exercise actual Fastify requests and PostgreSQL transactions, including booking conflict prevention and manager confirmation/cancellation.

This is development build stabilization. Hermes bundle exports are not signed Android/iOS applications, and the tests do not certify the native customer journey, organization SSO, payment processing or production readiness. Stage 2 still needs development provider configuration and a device development build.

The architecture, application screens, blue/lilac styling, bilingual copy and salon workflows were preserved. No active Rewards, Club, Membership or payment functionality was introduced. Historical finance tables and all three SQL migration files are unchanged.

## Changes

| Files | Defect and resolution |
|---|---|
| `apps/api/src/auth.ts` | `managerOnly` previously returned synchronously without completing the Fastify hook for allowed roles, hanging manager/admin requests. It now uses the asynchronous hook contract and retains the same role checks. |
| `apps/api/src/app.ts` | Explicit availability result types fix the empty-slot `never[]` compilation error. Booking narrows the successful result before using service/stylist data; unbookable services still reject requests. |
| `apps/api/src/salon_pricing.ts` | Explicitly narrows nullable peak cents before addition. Unknown prices still remain null; existing modifiers, buffers, peak calculation and rounding are preserved. |
| `scripts/migrate.ts`, `apps/api/src/migrations.ts` | The documented root command delegates to an API-owned module so `pg` resolves without `NODE_PATH` or a root install. First-time ledger creation now takes the same transaction advisory lock as migration application. SHA-256 checks and per-file transaction rollback remain intact. |
| `apps/api/package.json`, `apps/api/tsconfig.test.json` | `dev`, `start` and `migrate` load the optional API `.env` before importing application/database modules. Added explicit test type checking and an opt-in integration test script. Exported environment variables retain precedence. |
| `apps/mobile/package.json` | Retained Expo 54 and React 19.1.0; aligned React Native to 0.81.5 and React DOM to 19.1.0. Added the development client and the required direct `expo-constants` native dependency. |
| All three `package.json` / `package-lock.json` files; `.nvmrc` | Added independent npm lockfiles, npm version metadata, Node minimum 22.13.0 and the validated Node 24.22.1 version. `npm ci` works for each package on Linux. |
| `apps/mobile/.env.example` | The example API audience now agrees with the backend example; provider-specific values still need configuration. |
| `apps/api/test/auth.test.ts`, `apps/api/test/integration/stage1.test.ts` | Added manager-hook, real JWT/role, migration, pricing, appointment concurrency, idempotency, confirmation/cancellation and retired-route regressions. |
| `scripts/audit_v03.py` | Static checks no longer overwrite the historical build report or report invented dependency/build results. Optional `--output` writes only current static results; generated build files are excluded from source import inspection. |
| `README.md`, `db/README.md`, QA/release documentation | Replaced broken setup order and blanket `expo install --fix` instructions with locked installation, environment setup and explicit verification commands. Removed the empty lowercase `readme.md` to eliminate a case-only filename collision with `README.md`. |

## Actual verification

Environment: Linux x64, Node 24.22.1, npm 11.9.0, TypeScript 5.9.3, PostgreSQL 16 (temporary local Docker container), Fastify 5.12.8, Next.js 15.5.29, Expo 54.0.38, React Native 0.81.5, React/React DOM 19.1.0. Expo Doctor used version 1.21.8.

The command/result manifest is [STAGE1_COMMANDS.json](STAGE1_COMMANDS.json). It records actual working directories, arguments, exit codes, timestamps and execution-environment log paths. Full logs reside in that task workspace; commands below give the portable equivalents. A nonzero audit exit reports known advisories, not a failed application compilation.

| Validation | Result and evidence boundary |
|---|---|
| `npm install --no-audit --no-fund --cache /workspace/work/npm-cache` in each app | PASS; created/reconciled each lockfile. |
| `npm ci --no-audit --no-fund --cache /workspace/work/npm-cache` in each app | PASS; mobile repeated after its final peer dependency change. Installs ran normal lifecycle scripts. |
| API `npm run typecheck`, `npm run build` | PASS; source and regression tests type-check; distributable API JavaScript emitted. |
| API `npm test` | PASS, 13 Node test results, including five role subtests and their parent test; no database needed. |
| API `npm run test:integration` with local `TEST_DATABASE_URL` | PASS, nine scenario subtests plus their parent (10 reported results), real PostgreSQL and loopback HTTP/JWKS. |
| API `npm run start` and `npm run dev` | PASS in isolated source/build fixtures with configuration present only in `.env`; `/health` and database-backed `/api/catalog` returned 200 with nine services. |
| Mobile `npm run typecheck` | PASS after final dependency changes. |
| Mobile `npx expo install --check` | PASS, dependencies up to date. |
| Mobile `npx --yes expo-doctor` | PASS, 18/18 after declaring `expo-constants` directly. |
| Mobile `npx expo export --platform android ...` and `--platform ios ...` | PASS for both platforms; Hermes JS/assets export only, not native compilation or device execution. |
| Admin `npm run typecheck`, `npm run build` | PASS, Next production compilation, static generation and route build. No authenticated browser journey is claimed. |
| `npm ls --all --json` in each app | Exit 0; no missing/invalid required dependencies. Linux admin output lists two optional Sharp WASM-related packages as extraneous; they remain valid cross-platform optional entries in the lockfile. |
| `python3 scripts/audit_v03.py --output ...` | PASS, 17/17 static safeguards including retired features and branding references. |
| `python3 scripts/check_project.py` | PASS, foundation/home safety checks. |
| `git diff --check` and comparison of migration bytes with source base | PASS. Applied migration contents are unchanged. |
| Integration safety guard negative checks | Missing URL, remote URL, ordinary local database name and query-string host override all rejected before database access. No fallback to application `DATABASE_URL`. |

Integration scenarios verified:

1. Fresh migrations apply once; rerunning preserves three ledger entries and their source hashes.
2. Two concurrent first runs serialize ledger creation/application.
3. A checksum change to a temporary copied migration is rejected.
4. A temporary failing new migration rolls back both its test table and ledger entry.
5. Locally signed JWTs authenticate through actual JWKS verification. Missing, malformed, expired and wrong-audience sessions reject with 401. Database roles override an untrusted token role claim; manager/admin succeed and customer/stylist receive 403.
6. Managers configure a test stylist, qualifications, shift, bookable service, modifier, approved peak rule and bilingual policy through real API endpoints. Unpublished services, unqualified stylists and missing acknowledgments block booking.
7. Two customers racing for one time yield one 200 and one 409, one database appointment, and an authoritative 9,350-cent synthetic quote despite a supplied fake client price. The modifier affects duration; retrying the winner's idempotency key returns the original appointment.
8. Other customers cannot see or cancel the appointment. Manager confirmation, customer cancellation request, manager cancellation, slot release, invalid-transition rejection and audit entries work.
9. Representative retired Rewards/Membership API routes remain 404.

All users, prices, policies, appointments and JWT keys in these tests are synthetic. They do not represent approved salon prices or operational policies. Mobile UI interaction, token refresh, SSO redirects and real notifications were not tested by these API scenarios.

## Failed attempts, warnings and remaining limitations

- Creating a second temporary PostgreSQL container initially exhausted this environment's 8 GB filesystem; five validation commands could not start their sandbox. Removing only duplicate dependency folders from the earlier audit copy and its stopped temporary container recovered space. The container and all affected checks then ran successfully. Source and audit evidence were retained.
- The first Expo compatibility command tried to write anonymous telemetry settings under an unavailable home directory. It passed after setting `EXPO_NO_TELEMETRY=1` and `EXPO_NO_CACHE=1`. These are environment-only validation flags, not application changes.
- The first doctor run passed 17/18 and correctly identified the direct `expo-constants` peer requirement. `npx expo install expo-constants --npm` added `~18.0.14`; clean install and final doctor passed. React Native Directory metadata briefly failed during that installation, but the final doctor completed all checks with the environment proxy enabled. TLS verification was not disabled.
- Mobile installs warn about deprecated transitive `inflight`, `rimraf` and `glob` packages. `npm audit --json` reports API **0**, admin **2** (1 high, 1 moderate), mobile **22** (5 high, 16 moderate, 1 low) affected package entries. These are dependency-tree counts, not distinct confirmed exploit paths. Reported chains include PostCSS, decode-uri-component/query-string, image-size and Expo tooling. The development client adds affected tooling entries. No forced major Expo/Next update or unreviewed override was applied. Triage reachability and compatible patched dependencies before release.
- `npm ls` reports optional Sharp WASM transitive artifacts as extraneous on Linux while their platform-specific parents are skipped. API/mobile trees have no reported problems; admin compilation succeeds. Cross-platform native installation still needs verification.
- An old init-only database without `schema_migrations` still needs a reviewed adoption procedure. Stage 1 does not edit migration history, delete existing tables or stamp unverified ledger entries.
- No Android SDK/emulator, Xcode, iPhone/Android device, Apple signing, EAS project/profile, live OIDC tenant or storage provider was used. Native installation and the interactive customer/admin journey remain unverified.
- Remaining product/security work from the audit is not silently marked complete: notification delivery, profile/recovery/session gaps, complete admin workflows, SSO API-audience configuration, media delivery/privacy, dependency remediation, operational monitoring/backups and store assets still need their later stages.

## Reproduce the local integration suite

Use Node 24.22.1 and npm 11.9.0, install the API with `npm --prefix apps/api ci`, and run these commands from the repository root. The password below is deliberately disposable test data. Choose an unused loopback port/container name if necessary; never reuse a production connection or an existing operational database.

```bash
docker run --detach --name vivablue-stage1-test \
  --publish 127.0.0.1:55433:5432 \
  --tmpfs /var/lib/postgresql/data \
  --env POSTGRES_DB=vivablue_test \
  --env POSTGRES_USER=vivablue_test \
  --env POSTGRES_PASSWORD=stage1-local-only postgres:16
docker exec vivablue-stage1-test pg_isready -U vivablue_test -d vivablue_test
# Proceed once pg_isready reports accepting connections.
TEST_DATABASE_URL=postgres://vivablue_test:stage1-local-only@127.0.0.1:55433/vivablue_test \
  npm --prefix apps/api run test:integration
docker stop vivablue-stage1-test
```

The suite accepts only a bare loopback connection URL without query parameters or fragments, and database names `vivablue_test` / `vivablue_test_*`. This prevents PostgreSQL URL options from overriding the checked host. It creates isolated schemas and does not drop or truncate application records. The test account needs permission to create schemas and `pgcrypto`/`btree_gist` extensions. Stopping this specifically named tmpfs container discards only its synthetic test database. A stopped container can be restarted for a fresh run. Do not use these credentials or a test superuser for application deployment.

Build and mobile export checks (from the respective application directories):

```bash
# apps/api
npm run typecheck
npm run build
npm test
# apps/admin
npm run typecheck
npm run build
# apps/mobile
npm run typecheck
npx expo install --check
npx --yes expo-doctor@1.21.8
npx expo export --platform android --output-dir ../../work/android-export
npx expo export --platform ios --output-dir ../../work/ios-export
```

The audit environment additionally used `EXPO_NO_TELEMETRY=1`, `EXPO_NO_CACHE=1`, `CI=1` for exports, `NEXT_TELEMETRY_DISABLED=1` for Next, a writable npm cache, and `NODE_USE_ENV_PROXY=1` for doctor. Those flags address this environment's restrictions. The app does not require disabling TLS or authentication. No source configuration or secret needs to be pasted into a report.

## Next implementation stage

Follow the main README to start PostgreSQL, the API, admin and Metro with development credentials. Configure provider-approved native/admin OIDC clients and matching API access-token audience, assign authorized development staff roles, and create a device development build. Establish a complete launch/sign-in/request/confirmation journey using approved test salon data. Keep booking/publication gates active and preserve the v0.3 interface. This is Stage 2; this record does not authorize deployment or certify the remaining launch requirements.
