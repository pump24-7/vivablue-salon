# v0.3 QA matrix - scenario-based release testing

**Current status: unexecuted where packages/provider credentials are required.** Never infer success from syntax parsing. Start with isolated test DB, OIDC test issuer and staging S3 bucket.

| Area | Scenario / expected result | Status |
|---|---|---|
| Dependencies | `npm install` API/mobile/admin from registry | BLOCKED: DNS / cache |
| Backend TypeScript | `npm run build` with actual packages | NOT RUN |
| Mobile TypeScript | `npx expo install --fix`, `npm run typecheck` | NOT RUN |
| Admin TypeScript | `npm run typecheck && npm run build` | NOT RUN |
| Schema | migrate empty database then restart migrate; checksum match | NOT RUN |
| Migration conflict | alter applied SQL file; checksum mismatch abort | NOT RUN |
| Baseline | v0.1/v0.2 migrations remain immutable; v0.3 adds retirement migration | STATIC REVIEW |
| Authentication | PKCE correct redirect/state/nonce; SSO role mapped to DB | NOT RUN |
| Admin auth | forged/damaged encrypted cookie => 401, no token-paste UI | STATIC REVIEW ONLY |
| CSRF | cross-origin POST to admin bridge rejected | NOT RUN |
| Booking | two simultaneous clients request same stylist/time => one 409 | NOT RUN |
| Booking | non-bookable unapproved service yields no slots | NOT RUN |
| Booking | modifier minutes + buffer prevent adjacent collision | NOT RUN |
| Booking | inactive/unknown modifier returns 409 | NOT RUN |
| Booking | `salon_closures` removes affected slots | NOT RUN |
| Booking | day beyond 120-day horizon rejected | NOT RUN |
| Booking | day selection UTC and America/New_York DST spring/fall | NOT RUN |
| Pricing | enabled peak window adds integer cents; outside window zero | NOT RUN |
| Pricing | null base remains null, no fabricated price | STATIC CODE CHECK |
| Pricing | multiple overlapping active peaks choose max surcharge | NOT RUN |
| Consent | no published policies => booking blocked | STATIC CODE CHECK |
| Consent | consultation type requires explicit acknowledgment | STATIC CODE CHECK |
| Favorites | only published rights-cleared looks can be saved | NOT RUN |
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
| Localization | EN/ES service/terms/date and specialist copy | PARTIAL: audit pending |
| iOS and Android | physical auth, deeplink, official logo image loading | NOT RUN |
| Operations | DB backups + restore drills, alerting and rollback | NOT RUN |
| Owner update | Rewards and Club absent from app routes, UI and API | STATIC AUDIT PASS |
| Brand | Official-site hosted image and blue/lilac tokens | STATIC AUDIT PASS; VISUAL DEVICE QA PENDING |
| Legacy migration | Existing subscriptions disabled for publication, history retained | NOT RUN - requires PostgreSQL |

## Minimum test runner commands

```bash
cd apps/api && npm install && npm run build && npm test
cd apps/mobile && npm install && npx expo install --fix && npm run typecheck
cd apps/admin && npm install && npm run typecheck && npm run build
cd <repo-root> && python scripts/audit_v03.py
```

Proof for this delivery is included in `docs/BUILD_REPORT.json`; no live credentials or real salon data used.


