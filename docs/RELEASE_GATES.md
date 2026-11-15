# Viva Blue Salon v0.3 production gate register

**STOP-SHIP unless all critical gates pass.** This is a source package for further development, not a certified release.

## Critical gates

- [ ] Salon owner authorizes name, branding, web photos, imagery, product features and app identifiers.
- [x] Install dependencies from registry; generate and verify per-application lockfiles with `npm ci` (Stage 1).
- [ ] Complete dependency vulnerability remediation and review before release; current mobile/admin audit findings remain open.
- [x] Package-resolved TypeScript API/mobile/admin checks, API/Next builds and Expo 54 compatibility check (Stage 1).
- [ ] Create isolated managed PostgreSQL and run migrations on staging, test backups and restore; do not touch Nestease DB.
- [ ] Run transaction/concurrency tests for overlap exclusion and event seat capacity; add time-off/station resources and multi-service bookings.
- [ ] Configure organization OIDC/JWKS/PKCE with access token audience, admin session expiry, logout and revocation; check every permission boundary.
- [ ] Approve real stylist identities, specializations, weekly shifts, closures, buffers, price versions and local service durations.
- [ ] Publish actual cancellation/consent/privacy policies in English and Spanish, include minor/guardian flow; require staff legal review.
- [ ] Obtain image releases and model/photographer rights. Configure content moderation, malware scan, and approved CDN delivery.
- [ ] Configure and exercise S3 private upload confirmation, data deletion and retention scheduling.
- [ ] Verify retirement of legacy subscription programs, provider-side billing status, cancellation/notice decisions, and archived finance records. No payment checkout is active in v0.3.
- [ ] Build service-level deposits/POS and retail ecommerce ONLY if salon chooses these product lines.
- [ ] Add event cancellation, multi-seat edits/waitlist, paid event purchase and email/SMS notice workflows.
- [ ] Complete bilingual copy audit, screen reader and large text behavior, privacy export/deletion and email/SMS opt-ins.
- [ ] Run iOS/Android actual-device tests with OAuth deep-links, Apple Pay/Google Pay where applicable, recovery/revocation, and crash-free session handling.
- [ ] Set observability, backups, API rate-limit/monitoring, audit trails, alerts, incident response and data retention.

## Medium-priority enhancements for future versions

- Multi-location inventory/staff assignment; hair processing stages, chair/bowl capacity and consecutive service plans.
- Stylist portfolios and verified personal photography with image CDN and back-office uploads.
- Refund/cancellation policy automation and no-show fee management.
- Retired Club/rewards data retention and review of any past subscriptions before release.
- Email/SMS confirmations/reminders with consent/unsubscribe, queue and idempotency.

## Current QA result

The original static-only delivery report remains in `BUILD_REPORT.json`. Stage 1 build stabilization, Stage 2 local environment and Stage 3 customer workflows are recorded in their `STAGE*_VALIDATION.md` / `STAGE1_STABILIZATION.md` reports. The development branch is published as an unmerged draft PR. Current mobile tests, real API/database/customer/admin flows, and Android/iOS JavaScript exports pass; native binaries and device journeys remain unverified. Profile editing, shared language and in-app appointment updates are implemented. External notification delivery, provider recovery/verification, complete salon administration, dependency remediation and release gates remain open. No production service, live payment, merge or deployment is included.
