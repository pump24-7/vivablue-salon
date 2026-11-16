# Stage 2 — working development environment

Verified **November 15, 2026 (America/New_York)**, on the preserved local Stage 1 working tree. No commit, push, pull request, deployment, production data connection or live payment was made.

## Status

The local development stack is running: PostgreSQL, API, admin, Keycloak and the actual Expo/Metro application. Real browser/provider/backend tests pass, including registration, SSO, authorization, refresh, booking, admin confirmation and cancellation. **Stage 2's device-installation acceptance criterion remains open:** no Android/iOS native binary was built or installed, and native deep links/SecureStore were not exercised.

The environment has Java 21 and a headless Chromium browser, but no Android SDK/emulator, Xcode, attached phone, Expo account binding or Apple signing configuration. The owner was asked for device/provider preferences; local test-provider setup proceeded as the stated default. No external tenant was inferred or configured. A physical phone cannot reach this cloud workspace by using its own localhost.

## Delivered changes

| File(s) | Purpose |
|---|---|
| `docker-compose.dev.yml` | Separate loopback PostgreSQL 16 service, `vivablue_dev` database and dedicated persistent volume. |
| `scripts/dev/setup.mjs`, `fixtures.json` | Private generated passwords, local 30-day TLS CA/server certificate, environment files, and Keycloak 26.8.2 realm with PKCE-required development clients. Existing manual environment files are not overwritten. |
| `scripts/dev/run.mjs` | Foreground startup wrappers for auth/API/admin/Metro, verified local CA trust, workspace Expo state, and owned-process-group shutdown. |
| `scripts/dev/check.mjs` | Repeatable checks for verified-TLS discovery, API/database catalog, protected admin access and Metro readiness. |
| `apps/api/scripts/seed-dev.ts`, package script and test TS configuration | Explicitly guarded, repeatable synthetic fixture seeding; separate runtime DB role; no modification of baseline SQL or real service categories. |
| `apps/admin/app/api/auth/login/route.ts`, `.env.example` | Optional explicit OIDC API-audience parameter. Existing state, nonce, PKCE, encrypted cookies and backend role enforcement remain active. |
| `scripts/dev/verify-browser.py` | Repeatable real browser/Keycloak/API/admin-screen verification, writing results only into ignored local work files. |
| `apps/mobile/eas.json` | Internal Android APK/iPhone development profiles plus an iOS simulator profile. Source configuration prepared; remote builds/signing unverified. |
| `.gitignore`, README and `docs/DEVELOPMENT.md` | Keep generated state/credentials/native outputs out of version control and document reproducible startup and device prerequisites. |

No mobile screen, brand asset, color, language copy or customer navigation was redesigned. The admin UI itself is unchanged. No Rewards, Club, Membership or payment route was introduced. All three migrations and retained historical financial records are preserved. Media uploads and real commerce remain disabled.

## Runtime verification

The new browser suite passed nine checks twice, including from its final repository script:

1. Organization SSO through the existing admin link: authorization-code exchange, PKCE S256, state/nonce, encrypted HttpOnly/Lax session and successful dashboard API refresh.
2. An authenticated cross-origin administrative mutation returns 403; invalid callback state returns 401.
3. The separate public browser test client completes PKCE; its real customer JWT accesses `/api/me` and receives 403 from management endpoints.
4. An incorrect PKCE verifier is rejected by the provider.
5. A refresh token returns an access token accepted by the real API. Rotation/revocation edge cases and native session synchronization remain unverified.
6. A customer creates a development appointment with modifier and policy/consultation acknowledgments; the server quotes the synthetic amount correctly.
7. Clicking **Confirm** in the actual admin appointment screen changes the customer's appointment status to confirmed.
8. Customer cancellation request followed by **Cancel** in the actual admin screen produces cancelled status.
9. A newly registered provider account creates a customer record and cannot access manager endpoints.

These are synthetic test users/data. Browser-based customer protocol tests use `vivablue-browser-test` with a temporary `http://localhost:8089/callback`. The mobile client retains only `vivablue://auth/callback`; it is not replaced with a web application. The managed browser blocked the native URL scheme, so no native callback success is claimed.

Additional results:

| Check / actual command | Result |
|---|---|
| `node scripts/dev/setup.mjs` | PASS; generated private configuration and preserved credentials on repeat. |
| `docker compose -f docker-compose.dev.yml --env-file work/dev/database.env up -d --wait` | PASS; separate local database healthy. The cloud invocation explicitly selected its local Docker socket. |
| `npm --prefix apps/api run migrate` | PASS; all three immutable migrations applied. |
| `npm --prefix apps/api run seed:dev` | PASS after fixing an explicit UUID/text parameter cast in the new seed script; repeat invocation succeeds. |
| Seeder negative checks | Production mode, remote host, ordinary database name and URL host override rejected before database access. |
| Runtime DB permission queries | PASS: `vivablue_app` cannot create schema objects or insert membership/reward rows, can insert appointments and can read finance history. Nine original services still unbookable. |
| `node scripts/dev/check.mjs` | PASS: discovery over verified TLS, database-backed API catalog, admin HTML, unauthenticated admin 401 and live Metro status. |
| `python3 scripts/dev/verify-browser.py` | PASS, nine real browser/provider/application checks. |
| Live Metro manifest + launch-bundle requests | PASS for Android and iOS: genuine Expo manifests and approximately 6.38 MB development bundles served. This is not native compilation. |
| `npm --prefix apps/api run typecheck` | PASS including the new developer script. |
| `npm --prefix apps/api test` | PASS, 13 reported unit test results. |
| Admin `npm run typecheck` and `npm run build` | PASS. Production build used an isolated copy without credentials to avoid disturbing the running admin server. |
| JavaScript syntax / Git whitespace checks | PASS for development scripts and diff. |
| Metro wrapper shutdown/restart | PASS; its own process group stops, port 8081 closes, and the server can be restarted. |

See [STAGE2_COMMANDS.json](STAGE2_COMMANDS.json) for recorded command arguments, timings, exit codes and evidence locations. Local server logs may contain short-lived authentication correlation data; they are not copied into this report or committed. The private generated credentials and certificate keys remain ignored.

## Issues encountered and resolved

- The new seeder initially used one PostgreSQL parameter as both an inferred UUID and text. Explicit casts fixed it; the failed seed transaction rolled back. This was a development-tool defect, not a change to existing application schema.
- Keycloak's data-directory setting is relative to its installation; relying on startup's implicit import directory did not load the intended realm. The wrapper now selects the relative state directory and imports an explicit filename with `--override=false` before starting the TLS-only listener.
- The initial local client definitions omitted Keycloak's `basic` scope, so access tokens lacked `sub`. API authentication correctly rejected them. The generated clients now include `basic`; equivalent corrections were applied only to the local test realm.
- Imported fixture users needed the `offline_access` realm permission to request the refresh scope already used by the mobile app. The template now includes that permission; it grants no salon management role.
- Expo served a readiness endpoint but initially failed to create its manifest cache under the restricted home directory. The wrapper now uses an isolated writable Expo state directory. Android/iOS live manifest and bundle requests pass.
- The initial wrapper stopped npm without its Metro child. Owned process-group shutdown fixed that and was verified by checking port closure and restart.
- A final health probe ran during an API restart triggered by rewriting unchanged generated environment files. Setup now avoids rewriting unchanged files; repeated setup preserves their timestamps, and the final readiness probe passes.
- An early browser probe used the wrong link label; the final test uses the existing sign-in link's route. Native-protocol navigation was blocked by the managed browser and remains a device test; no browser policy or application authentication check was disabled.

The local browser suite trusts only the generated server certificate's public-key pin. API/admin TLS verification uses the development CA in addition to Node's normal roots. The provider uses a normal TLS-enabled start command on loopback with a local H2 identity database; it is an isolated development service, not a production deployment.

## Remaining acceptance requirements

- Choose the first target device and obtain its native build tools or a configured Expo/EAS account. Physical iOS testing additionally needs Apple signing and a registered test device.
- Supply device-reachable development API/identity endpoints with trusted HTTPS and register the exact native callback. No private credentials should be pasted into an audit report or chat.
- Build and install the development client, then exercise the complete customer journey on the actual device, including app restart, expiry/refresh, callback handling and bilingual screens.
- Continue the existing audit's later-stage work: account recovery/revocation, notifications, complete admin operations, real owner-approved salon data/policies, media consent, accessibility, operational hardening and store assets.
- Stage 1's dependency findings remain open: mobile 22 and admin 2 affected package entries in the recorded audit, including high-severity entries. This work does not certify a release or substitute a framework upgrade for a reviewed remediation plan.

Use [DEVELOPMENT.md](DEVELOPMENT.md) for exact startup, local credentials handling, verification and Android/iPhone build instructions. The cloud processes were left running for development; their localhost addresses are not public deployments or links that a phone can automatically open.
