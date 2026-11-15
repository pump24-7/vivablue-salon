# Viva Blue Salon v0.3 — UI/UX brand refresh & de-scope

## Owner-directed changes

1. Rewards program removed from active mobile application, account dashboard, API endpoints and reward-earning webhook logic.
2. Club/Memberships removed from active mobile, admin and API, including membership screens, paid subscription checkout and plan editor.
3. Blue-and-lilac website-informed palette applied in mobile theme and admin CSS; previously green-first palette retired.
4. Official salon website logo URL referenced by mobile and admin headers. The exact source image is **not bundled** locally, so offline logo behavior requires the business owner's master logo file.
5. Mobile “Book” shortcut corrected; it now opens a new Services catalog rather than the My Viva hub.
6. My Viva revised to emphasize appointments, saved looks, Services, Events and salon products instead of points/club.
7. A non-destructive migration prevents old loyalty/membership settings from being republished while preserving records for legal/financial review.

## Preserved

OIDC/PKCE, stylist scheduling/qualification, approved pricing, appointment hold conflicts, consultation/consent acknowledgement, published image rights, favorites, free event capacity checks, product ingredient notes, media moderation and salon operations.

## Deployment limitations

No new live payment features are created here. If a previous Stripe account has existing subscriptions, they must be explicitly reviewed and stopped through the provider; removing code does not cancel billing. No dependencies could be installed offline in this environment; full TypeScript builds, live DB migrations, auth/device tests remain pending. See `BUILD_REPORT.json`.
