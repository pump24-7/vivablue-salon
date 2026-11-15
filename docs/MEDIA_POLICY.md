# Photo moderation, rights and retention - engineering draft

This document is a proposed operational policy and requires salon owner/legal approval before production use.

## Current controls

- `MEDIA_UPLOADS_ENABLED=false` by default. An API request for `/api/media/presign` is rejected until configured.
- Eligible MIME types: JPEG, PNG, WebP, 1 byte to 10 MiB. Uploads require `consentConfirmed=true`; no S3 public ACLs are set.
- Server creates a private object key under `review/<user-id>/<uuid>`, presigns a limited (5-minute) PUT with matching content type, size and server-side encryption.
- Client calls `POST /api/media/:id/confirm`. Server HEAD-checks S3 object length/content-type and moves status from `pending_upload` to `pending_review`.
- Managers review via `/api/admin/media` and explicitly approve/reject. App never serves these raw objects publicly. A separate rights-cleared lookbook record with an approved CDN address must be published to become visible to customers.
- `scripts/prune_media.ts` is a manual/scheduled job for abandoned or rejected media after 48 hours. It is **not scheduled automatically** and never automatically deletes approved/customer-requested-for-retention images.

## Production gates

1. Obtain informed photo/marketing consent (including guardian approval if a minor is depicted), photographer rights and permitted image reuse channels.
2. Strip sensitive EXIF/geolocation, perform image security scanning, mime/magic-byte validation and human/automated moderation before public copy.
3. Create per-user photo deletion, retention and audit procedures, with verified object cleanup in S3, CDN and backups where applicable.
4. Configure S3 bucket lifecycle/encryption/versioning/access policies, logging, key rotation, malware scanning and rate limits.
5. Implement secure thumbnail generation, content delivery, deletion propagation and account privacy controls.
6. Review adverse events / consent withdrawal and privacy policy. Avoid placing personal beauty history in publicly accessible alt text or metadata.

Current HEAD metadata checks are **not** equivalent to malware scanning, image moderation, release verification or secure file-content validation.
