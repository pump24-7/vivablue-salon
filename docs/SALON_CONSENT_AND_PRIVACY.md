# Salon consent, privacy, minors and sensitivity policy review

**PROPOSED REQUIREMENTS, NOT READY-TO-PUBLISH POLICY TEXT.** The salon owner, local counsel, insurance provider and cosmetology professionals must approve actual terms before booking and media collection.

## Replace unrelated café/animal waivers

There is no cat lounge, animal contact, waiver for animal scratches or café food allergen/menu policy in this salon app. These are explicitly removed from the product scope.

## Salon-specific checklists

- **Service consent:** nature of haircut/color/keratin/lash/brow/makeup treatment, foreseeable irritation, individual consultation, service limitations, home-care notes and documentation of customer acknowledgement.
- **Sensitive reactions:** optional service history, patch/strand test decisions as determined by stylist/product instructions, disclosed sensitivities, chemical composition, color history and ability to stop/reschedule a service.
- **Minors:** approved age limits for each treatment, guardian consent/signature and personal-data rules for minor clients, as legally applicable. In v0.2 this is a legal/product gate; age verification and guardian workflow have NOT been implemented.
- **Booking terms:** deposit/late/no-show, cancellation/rescheduling, refund eligibility, disputes, consultation duration, pricing estimates vs final charges, tip policies.
- **Privacy:** consent to photos, storage and use purposes, user data access/deletion, data retention, marketing opt-in/out, security notices, backups and support process.
- **Accessibility:** WCAG-aligned contrast, screen readers, dynamic text sizes, bilingual terms, non-visual alternatives for portfolio photos.
- **Safety:** allergies/ingredient fields are informational; they do not replace professional judgment or medical care.

## Data practice in v0.2

- Client email may still exist in the authenticated account database; it is not presented as a home-screen field. Contact details are not exposed on the public salon home.
- A booking record stores `consultation_ack`, `policy_ack_at`, and `policy_effective_at` after approved terms are presented; if terms are not approved, online requests are blocked.
- Booking and client favorites are sensitive internal records behind OIDC authentication; manager operations require the database-assigned manager/admin role.
- Public photos require `rights_confirmed` AND `is_published` true; raw user uploads remain private pending explicit review.

Salon management must supply the final text in both languages; sample copy is not automatically seeded or published.
