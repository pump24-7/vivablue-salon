# Viva Blue Salon v0.3 - owner-directed brand refresh and program retirement

## Owner changes implemented

- Remove **Rewards** and **Club/Memberships** from customer home, My Viva, route files, admin tabs, API routes and subscription checkout backend.
- Preserve **Favorites**, Lookbook, customer profile, appointments, stylist and slot selection, Events, Products, salon staff and management.
- Make **Book** take visitors to a service catalog screen rather than My Viva.
- Use brighter salon blue as the principal interactive color; lilac, white, light sky and daisy-yellow are supporting colors.
- Display the **actual image URL hosted by the official salon site**, not an artist's recreation: `https://vivabluesalon.com/images/33c922f60b7167724cbc786ad2dfe8c4.png`. The official original is referenced remotely rather than copied into the ZIP because we could not fetch the bytes in this build environment. For reliable offline behavior and authorized production distribution, replace it with owner-provided original logo master file. The fallback text is not the original logo.

## Not a live release

This revision is source code. No real staff availability, approved prices, subscription charges, or identity-provider sessions are included. None of the removed rewards/subscription code is callable from current API, mobile or admin. Database legacy tables are kept for financial record preservation, with migration 003 forcibly disabling reward earning and membership publication. If older versions charged real subscriptions, disabling app routes **does not stop billing at Stripe**; investigate and cancel them using approved merchant/provider procedures. No database records are deleted automatically.

## Proposed design tokens (not exact official brand specifications)

- Bright blue: `#249CF0`; action blue: `#1269B3`; dark ink: `#153C63`
- Lilac: `#D8B3EC`; background: `#F8FCFF`; pale blue: `#E5F5FF`; yellow detail: `#F5CE39`
- Source: https://vivabluesalon.com/, verified 2026-11-11. Owner approval and contrast/a11y verification needed before production.

## Source changes

`apps/mobile/src/{theme.ts,BrandLogo.tsx,brand.ts,widgets.tsx}` and `app/{index.tsx,my-viva.tsx,services.tsx}`; delete `app/{memberships.tsx,rewards.tsx}`; `apps/admin/{app/globals.css,app/page.tsx,src/brand.ts}`; `apps/api/src/{app.ts,experience.ts,config.ts}`; delete `apps/api/src/payments.ts`; remove payment-only dependencies and env config; new non-destructive DB migration 003; docs/tests updated.
