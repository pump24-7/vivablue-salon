# Viva Blue Salon development environment

Stage 2 provides a local PostgreSQL database, actual Fastify API, actual Next.js admin, Expo development server and a local Keycloak identity provider. Stage 3 extends the existing customer screens and adds profile editing, shared language, server booking quotes and an in-app appointment inbox. Branding and migrations 001–003 are retained; migration 004 adds the inbox. See [Stage 3 results](STAGE3_VALIDATION.md) and [Stage 2 results](STAGE2_VALIDATION.md) for verified behavior and remaining device requirements.

The bootstrap configuration binds to loopback. URLs printed here refer to the computer running these commands; a phone cannot reach a cloud computer through its own `localhost`. No physical Android/iPhone build or native callback has been verified yet.

## Tools and first setup

Use Node 24.22.1/npm 11.9.0, Docker with Compose v2, OpenSSL, and Java 21. The commands below use a POSIX shell (Linux/macOS; Windows users can use WSL for the local stack). Android native builds require Android Studio/SDK and its compatible JDK; iOS local builds require macOS, Xcode and CocoaPods.

From the repository root:

```bash
nvm use
npm --prefix apps/api ci
npm --prefix apps/admin ci
npm --prefix apps/mobile ci
node scripts/dev/setup.mjs
```

`setup.mjs` generates private local credentials, certificates, realm configuration and application environment files. `work/`, application `.env` files and generated native directories are ignored by Git. Credentials are stored in `work/dev/credentials.json` with private file permissions; do not commit, paste into chat or include that file in reports. The `dev-manager`, `dev-customer` and `dev-stylist` passwords are available there for local testing. The Keycloak bootstrap administrator is `local-dev-admin`, with a separate generated password in the same file.

Existing manually configured `.env` files are preserved: setup stops before changing them. Use a clean checkout or retain the manual-provider workflow in the main README. On repeated isolated setup, generated credentials are retained and generated environment files are refreshed. Do not put independent provider settings into generated files and then rerun setup.

## Install the local test identity provider

Keycloak **26.8.2** was tested with Java 21. Its official release archive SHA-256 was verified as:

```text
dd124787283918bc597628887168333465ee2a811a389e0003569e52be7e487f
```

Download the official release, verify it, and extract it into the ignored development area:

```bash
mkdir -p work/dev/tools
curl --fail --location \
  https://github.com/keycloak/keycloak/releases/download/26.8.2/keycloak-26.8.2.tar.gz \
  --output work/dev/tools/keycloak-26.8.2.tar.gz
echo 'dd124787283918bc597628887168333465ee2a811a389e0003569e52be7e487f  work/dev/tools/keycloak-26.8.2.tar.gz' | shasum -a 256 --check
# Continue only if the checksum matches.
tar -xzf work/dev/tools/keycloak-26.8.2.tar.gz -C work/dev/tools
export VIVABLUE_KEYCLOAK_BIN="$PWD/work/dev/tools/keycloak-26.8.2/bin/kc.sh"
```

Use a dedicated development installation. Keycloak stores this realm in `work/dev/keycloak`, with H2 files used only for local identity testing. Startup imports the explicit generated realm file with `--override=false`, preserving existing users/realm settings. Editing a template and rerunning setup does not overwrite an existing realm; apply intentional local provider changes through its administration UI. Do not run two Keycloak wrappers against the same files.

The local realm has three clients: the native public client (`vivablue-mobile-dev`), the confidential admin client (`vivablue-admin-dev`), and a separate public loopback client used only by browser regression tests (`vivablue-browser-test`). All require PKCE S256. Access tokens include the configured API audience and subject through Keycloak's `basic` scope. Fixture users have `offline_access` permission for the refresh scope requested by the mobile app. Staff permissions are still read from the salon database; a token role claim does not grant API management access.

## Start the database and applications

From the repository root:

```bash
docker compose -f docker-compose.dev.yml --env-file work/dev/database.env up -d --wait
npm --prefix apps/api run migrate
npm --prefix apps/api run seed:dev
```

The compose project creates a separate `vivablue_dev` database on loopback port 55434 and a dedicated named volume. It does not reuse the normal compose application's volume. The owner account applies migrations; the API runs as `vivablue_app`, without schema creation, PostgreSQL role-administration privileges, or writes to legacy membership/reward/financial tables. Historical finance reads remain available.

The fixture seeder requires `NODE_ENV=development`, `VIVABLUE_DEV_SEED=true`, a bare loopback URL, the exact `vivablue_dev` database and dedicated role names. It rejects query-string host overrides and production mode before connecting. It inserts missing fixture records without overwriting existing fixtures. It adds a synthetic test service/stylist/modifier, seven test shifts, test policies, draft product and draft event. Nine original service categories remain unchanged and unbookable. The test policies/prices are explicitly not real salon approvals. Media uploads remain off.

Open four terminals and run one command in each, from the repository root:

```bash
# Identity provider; export VIVABLUE_KEYCLOAK_BIN in this terminal first.
node scripts/dev/run.mjs auth
# Backend API
node scripts/dev/run.mjs api
# Salon administration dashboard
node scripts/dev/run.mjs admin
# Actual Expo mobile project / Metro
node scripts/dev/run.mjs mobile
```

The first Keycloak startup can take about a minute. Wait for its HTTPS listening message. The wrappers add the generated development CA to Node's normal trust roots; TLS verification remains enabled. Expo state is isolated under `work/dev/expo` without changing the user's home directory. Ctrl+C stops the wrapper's own application process group.

| Service | Local address |
|---|---|
| Admin dashboard | `http://localhost:3000` |
| API health | `http://127.0.0.1:4000/health` |
| PostgreSQL | `127.0.0.1:55434`, database `vivablue_dev` |
| Keycloak test realm | `https://localhost:8443/realms/vivablue-dev` |
| Keycloak administration | `https://localhost:8443/admin/` |
| Expo Metro | `http://localhost:8081` |

For interactive browser sign-in, trust the **local development** CA at `work/dev/tls/ca.crt` using your operating system/browser's certificate controls. Its initial validity is 30 days. Do not disable TLS checks or deploy this CA/provider configuration. The automated browser test pins only this generated server certificate's public key; backend OIDC/JWKS calls verify the CA normally.

Stop applications with Ctrl+C. To stop only the development database while preserving its data:

```bash
docker compose -f docker-compose.dev.yml --env-file work/dev/database.env stop
```

Do not remove volumes or run old init SQL to work around an error. Changing generated database credentials will not change passwords inside an existing PostgreSQL volume; retain the generated credential file for that volume.

## Verify the stack and appointment workflow

```bash
node scripts/dev/check.mjs
npm --prefix apps/api run typecheck
npm --prefix apps/api test
npm --prefix apps/mobile run typecheck
npm --prefix apps/mobile test
```

For the repeatable real browser/identity-provider workflow, install Python Playwright and a Chromium browser, then run:

```bash
python3 -m venv work/dev/browser-venv
work/dev/browser-venv/bin/pip install playwright
work/dev/browser-venv/bin/playwright install chromium
work/dev/browser-venv/bin/python scripts/dev/verify-browser.py
```

If Chromium is already installed, the script uses `chromium` on PATH or `VIVABLUE_CHROMIUM_BIN`; otherwise it uses Playwright's installed Chromium. Port 8089 must be free for the temporary loopback callback. The script exercises real admin SSO, PKCE rejection, token refresh/revocation, new customer registration, profile/language persistence, backend role restrictions, server quotes, appointment submission, admin confirmation/cancellation and the customer inbox. It leaves synthetic registrations and cancelled test appointments for inspection and writes results under `work/dev/verification`. The public browser test client is separate from the mobile client: passing these tests does not prove native deep links, SecureStore or a device installation.

For manual management testing, open the admin dashboard and choose **Organization SSO sign-in**, then use `dev-manager` with its locally generated password. Review the development stylist/service, create or review test requests, and confirm/decline them in **Appointments**. Use only the explicitly labeled test service and test policies for these fixtures. Exercise real business configuration only in a separately approved environment.

## Run the real app on Android or iPhone

The running Metro server is the actual Expo Router/React Native application. A browser page or Metro QR code is not an installed mobile development client. Stage 2 prepares build profiles but cannot supply your device, Expo account, Apple signing or a device-reachable identity provider.

Before a device test, configure a development API and HTTPS OIDC provider that the phone can reach and trust. An externally managed **development** tenant is the straightforward path for a physical phone. Set the API issuer/audience/JWKS and mobile public issuer/client ID/audience consistently. Register exactly `vivablue://auth/callback` for the native public client and the admin's `/api/auth/callback` for its confidential client. Configure `VIVABLUE_OIDC_AUDIENCE` for providers that require an explicit audience parameter. Only approved development identities should receive staff roles in the development database.

For a developer computer on the same trusted network as a device, the API must listen on the appropriate interface and `EXPO_PUBLIC_API_URL` must use its reachable address. Android emulator host networking usually uses `10.0.2.2`; physical phones use the computer's LAN address or a development HTTPS endpoint. The default local Keycloak certificate covers only localhost/127.0.0.1, so changing the URL to a LAN IP alone is insufficient. Local device CA trust and appropriate certificate hostnames need separate setup; never switch off certificate validation. The cloud workspace's loopback URLs are not phone-accessible endpoints.

After configuring device-reachable development settings, use the existing native commands on a capable computer:

```bash
# Android Studio/SDK plus emulator or USB-debuggable Android device
npm --prefix apps/mobile run android
# macOS / Xcode simulator
npm --prefix apps/mobile run ios
# Provisioned physical iPhone on macOS
npm --prefix apps/mobile run ios -- --device
```

Alternatively, use your Expo account for EAS development builds (from `apps/mobile`):

```bash
npx eas-cli login
npx eas-cli init
# Configure public app values in the EAS development environment through its UI/CLI.
npx eas-cli build --profile development --platform android
npx eas-cli build --profile development --platform ios
# Optional iOS simulator build
npx eas-cli build --profile development-simulator --platform ios
```

`development` produces an Android APK and an internal iOS development build. Physical iOS builds require Apple signing/provisioning and registration of the test device; a simulator build needs a Mac simulator instead. EAS project initialization, remote builds and signing have not been performed here. Keep provider client secrets on the API/admin side, never in Expo public variables. Once the client is installed, start Metro on the developer computer with `npm --prefix apps/mobile start -- --lan` and connect that client to it.

The remaining device acceptance test is: launch → sign in/create account → select the development service, modifier and stylist → view available slots → accept test policies/consultation → submit → confirm in admin → refresh customer appointments → request cancellation → cancel in admin. Repeat after app restart and token expiry, on each target platform. Also test profile/language persistence, saved styles with approved imagery, My Viva counts, in-app updates and switching accounts. Real staff schedules, prices, policies, photos and external push/email/SMS delivery remain separate owner/provider requirements. The inbox updates on focus/foreground and every 30 seconds while its screen is active; it does not send OS push or external messages.

## Upgrade an existing Stage 2 development checkout

Install the new mobile test dependencies with `npm --prefix apps/mobile ci`, apply migration 004 with `npm --prefix apps/api run migrate`, then run `npm --prefix apps/api run seed:dev` to grant the existing isolated runtime role access to its inbox table. Existing data and generated credentials are retained. Never use the development seeder with an operational database. The complete regression command list and device acceptance steps are in [Stage 3 validation](STAGE3_VALIDATION.md).
