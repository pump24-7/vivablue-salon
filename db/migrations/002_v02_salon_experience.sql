-- v0.2 additive migration; run using scripts/migrate.ts against the SALON DB only.
-- No service becomes bookable, and no financial product becomes purchasable by default.
ALTER TABLE services ADD COLUMN IF NOT EXISTS featured_image_url text;
ALTER TABLE services ADD COLUMN IF NOT EXISTS buffer_minutes integer NOT NULL DEFAULT 0 CHECK (buffer_minutes BETWEEN 0 AND 120);
ALTER TABLE stylists ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE stylists ADD COLUMN IF NOT EXISTS specialties text[] NOT NULL DEFAULT '{}';
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS selected_modifiers jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS price_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS consultation_ack boolean NOT NULL DEFAULT false;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS policy_ack_at timestamptz;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS policy_effective_at timestamptz;
CREATE TABLE IF NOT EXISTS salon_closures (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),salon_id uuid NOT NULL REFERENCES salons(id),
 start_at timestamptz NOT NULL,end_at timestamptz NOT NULL,reason text NOT NULL DEFAULT '',
 CHECK(end_at>start_at)
);
CREATE TABLE IF NOT EXISTS peak_pricing_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),salon_id uuid NOT NULL REFERENCES salons(id),
 weekday smallint NOT NULL CHECK(weekday BETWEEN 1 AND 7),start_local time NOT NULL,
 end_local time NOT NULL,surcharge_bps integer NOT NULL CHECK(surcharge_bps BETWEEN 0 AND 5000),
 is_active boolean NOT NULL DEFAULT false,approved_by uuid REFERENCES users(id),
 CHECK(end_local>start_local),CHECK(NOT is_active OR approved_by IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS service_modifiers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),service_id uuid NOT NULL REFERENCES services(id),
 label_en text NOT NULL,label_es text NOT NULL,additional_minutes integer NOT NULL DEFAULT 0,
 additional_price_cents integer NOT NULL DEFAULT 0,is_enabled boolean NOT NULL DEFAULT false,
 sort_order integer NOT NULL DEFAULT 0,
 CHECK(additional_minutes BETWEEN 0 AND 240),CHECK(additional_price_cents>=0)
);
CREATE TABLE IF NOT EXISTS lookbook_images (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),salon_id uuid NOT NULL REFERENCES salons(id),
 service_id uuid REFERENCES services(id),image_url text NOT NULL,
 caption_en text NOT NULL DEFAULT '',caption_es text NOT NULL DEFAULT '',
 source_url text,rights_confirmed boolean NOT NULL DEFAULT false,
 is_published boolean NOT NULL DEFAULT false,display_order integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(NOT is_published OR rights_confirmed)
);
CREATE TABLE IF NOT EXISTS client_favorites (
 user_id uuid NOT NULL REFERENCES users(id),image_id uuid NOT NULL REFERENCES lookbook_images(id),
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,image_id)
);
CREATE TABLE IF NOT EXISTS retail_products (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),salon_id uuid NOT NULL REFERENCES salons(id),
 name text NOT NULL,description text NOT NULL DEFAULT '',image_url text,
 ingredients_note text,allergy_caution text,stock_on_hand integer NOT NULL DEFAULT 0,
 unit_price_cents integer,available_for_sale boolean NOT NULL DEFAULT false,
 CHECK(stock_on_hand>=0),CHECK(unit_price_cents IS NULL OR unit_price_cents>=0),
 CHECK(NOT available_for_sale OR (stock_on_hand>0 AND unit_price_cents IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS membership_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),salon_id uuid NOT NULL REFERENCES salons(id),
 name_en text NOT NULL,name_es text NOT NULL,benefits_en text NOT NULL DEFAULT '',benefits_es text NOT NULL DEFAULT '',
 amount_cents integer,interval text NOT NULL DEFAULT 'month' CHECK(interval IN ('month','year')),
 stripe_price_id text UNIQUE,is_published boolean NOT NULL DEFAULT false,
 CHECK(amount_cents IS NULL OR amount_cents>=0),
 CHECK(NOT is_published OR (stripe_price_id IS NOT NULL AND amount_cents IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS member_subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id),
 plan_id uuid NOT NULL REFERENCES membership_plans(id),provider_session_id text UNIQUE,
 provider_subscription_id text UNIQUE,provider_customer_id text,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','past_due','paused','cancelled','incomplete')),
 period_end timestamptz,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS salon_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),salon_id uuid NOT NULL REFERENCES salons(id),
 title_en text NOT NULL,title_es text NOT NULL,description_en text NOT NULL DEFAULT '',description_es text NOT NULL DEFAULT '',
 starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,
 capacity integer NOT NULL CHECK(capacity BETWEEN 1 AND 10000),price_cents integer,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','cancelled')),
 CHECK(ends_at>starts_at),CHECK(price_cents IS NULL OR price_cents>=0)
);
CREATE TABLE IF NOT EXISTS event_registrations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_id uuid NOT NULL REFERENCES salon_events(id),
 user_id uuid NOT NULL REFERENCES users(id),seats integer NOT NULL DEFAULT 1 CHECK(seats BETWEEN 1 AND 10),
 status text NOT NULL DEFAULT 'registered' CHECK(status IN ('registered','cancelled','waitlisted')),
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(event_id,user_id)
);
CREATE TABLE IF NOT EXISTS reward_rules (
 salon_id uuid PRIMARY KEY REFERENCES salons(id),points_per_dollar integer NOT NULL DEFAULT 1
 CHECK(points_per_dollar BETWEEN 0 AND 100),is_enabled boolean NOT NULL DEFAULT false,
 approved_by uuid REFERENCES users(id),CHECK(NOT is_enabled OR approved_by IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS reward_ledger (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id),
 points_delta integer NOT NULL CHECK(points_delta<>0),reason text NOT NULL,
 provider_event_id text NOT NULL UNIQUE,related_subscription_id uuid REFERENCES member_subscriptions(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reward_ledger_user_idx ON reward_ledger(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS payment_webhook_events (
 stripe_event_id text PRIMARY KEY,event_type text NOT NULL,processing_status text NOT NULL
 CHECK(processing_status IN ('processed','needs_review')),
 note text NOT NULL DEFAULT '',received_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS media_uploads (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id),
 object_key text NOT NULL UNIQUE,content_type text NOT NULL,byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 10485760),
 status text NOT NULL DEFAULT 'pending_upload'
 CHECK(status IN ('pending_upload','pending_review','approved','rejected','deleted')),
 consent_confirmed boolean NOT NULL DEFAULT false,reviewer_id uuid REFERENCES users(id),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '48 hours',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS media_uploads_expiry_idx ON media_uploads(status,expires_at);
CREATE TABLE IF NOT EXISTS salon_policies (
 salon_id uuid PRIMARY KEY REFERENCES salons(id),cancellation_en text NOT NULL DEFAULT '',
 cancellation_es text NOT NULL DEFAULT '',privacy_url text,service_consent_en text NOT NULL DEFAULT '',
 service_consent_es text NOT NULL DEFAULT '',effective_at timestamptz,approved_by uuid REFERENCES users(id)
);
-- Curated official-site reference images are PRIVATE drafts pending explicit rights approval.
INSERT INTO lookbook_images(salon_id,service_id,image_url,caption_en,caption_es,source_url)
SELECT sa.id,s.id,src.url,src.caption_en,src.caption_es,'https://vivabluesalon.com/'
FROM salons sa
CROSS JOIN (VALUES
 ('hair-color','https://vivabluesalon.com/images/b0a8c3e7c5e6e52d5d7d68d15129e7c9.jpg','Vivid copper color','Color cobrizo vibrante'),
 ('haircut','https://vivabluesalon.com/images/514931e4ce2df73526541ade40632e1d.jpg','Layered cut','Corte en capas'),
 ('styling','https://vivabluesalon.com/images/09dde22c2ba0fa122e20c33d01362f96.jpg','Soft waves','Ondas suaves'),
 ('balayage','https://vivabluesalon.com/images/3390f4f4d1a92df1cd823363e8ad5595.jpg','Ash blonde waves','Ondas rubias ceniza'),
 ('brow-wax','https://vivabluesalon.com/images/cef368f9460f8f864d7312df454dc252.jpg','Brow shaping','Diseño de cejas')
) AS src(slug,url,caption_en,caption_es) JOIN services s ON s.slug=src.slug
WHERE sa.name='Viva Blue Salon';
