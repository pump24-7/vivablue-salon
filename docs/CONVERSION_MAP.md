# File-by-file conversion decisions

- **REPLACE** `apps/mobile/app/index.tsx`: no property/address cards; Viva Blue hero, language toggle, services, appointment navigation. No email/phone form on home.
- **REPLACE** `apps/mobile/app/property.tsx`, `lawn.tsx`, `cleaning.tsx`, `frequency.tsx`, `estimate.tsx`, `history.tsx`, `orders.tsx`: these property-centric screens are omitted. New `service.tsx`, `bookings.tsx` fill salon journeys.
- **KEEP + ADAPT** `apps/mobile/src/session.tsx`, `api.ts`: OIDC PKCE, token storage and refresh remain; app scheme/storage names are rebranded. Public catalog API added.
- **REPLACE** `apps/mobile/src/theme.ts`, `app/_layout.tsx`, `app.json`: prototype lilac/green editorial palette, new routes, new bundle identifiers; requires ownership review.
- **REPLACE** `db/001_init.sql`: no Regrid/PostGIS property ownership; salon, services, stylists, shifts, time off and appointment statuses with PostgreSQL exclusion constraint.
- **REPLACE** `apps/api/src/app.ts`: delete parcel and lawn quote endpoints; add catalog, availability, appointments and manager endpoints.
- **KEEP + ADAPT** `apps/api/src/auth.ts`, `db.ts`, `config.ts`, `server.ts`: role cleaner -> stylist, preserve JWKS & database access, remove unused Regrid/Stripe/S3 configuration.
- **REMOVE FROM RUNTIME** `apps/api/src/regrid.ts`, `pricing.ts`, `settlement.ts`, `media.ts`: parcel math and original payment/credit states do not model salon reservations. Future salon payment and portfolio uploads need new implementation.
- **REPLACE** `apps/admin/app/page.tsx`, `layout.tsx`: manage salon catalog, stylists and booking review. Manager bearer token remains DEV ONLY and must become organization SSO.
- **REMOVE** `docs/3d_property_map.example.tsx`: property digital-twin imagery is irrelevant to salon appointments.
- **REPLACE** `docker-compose.yml`, package metadata, environment examples and developer readme; no Regrid dependency.

### Honest constraint
No production credentials, current staff roster, pricing approval, cancellation policy, or source ZIP were provided. All approved/active schedules must come from salon management, not a website guess. Do not connect this starter to real customers until validation and consent are complete.
