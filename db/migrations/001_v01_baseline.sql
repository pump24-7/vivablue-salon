-- Viva Blue Salon conversion v0.1. NEW DATABASE ONLY. No destructive migration of Nestease data.
-- Appointment pricing, lengths and staff are intentionally NOT approved or bookable by default.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TABLE users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),auth_subject text NOT NULL UNIQUE,
 email text,display_name text,role text NOT NULL DEFAULT 'customer'
  CHECK(role IN ('customer','stylist','manager','admin')),
 preferred_language text NOT NULL DEFAULT 'en' CHECK(preferred_language IN ('en','es')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE salons (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,
 address text,timezone text NOT NULL DEFAULT 'America/New_York',
 is_active boolean NOT NULL DEFAULT true
);
INSERT INTO salons(name,address,timezone) VALUES
 ('Viva Blue Salon','8221 Hull Street Road, Richmond, VA 23235','America/New_York');
CREATE TABLE services (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),slug text NOT NULL UNIQUE,
 name_en text NOT NULL,name_es text NOT NULL,description_en text NOT NULL DEFAULT '',
 description_es text NOT NULL DEFAULT '',duration_minutes integer,
 starting_price_cents integer,requires_consultation boolean NOT NULL DEFAULT false,
 is_visible boolean NOT NULL DEFAULT true,is_bookable boolean NOT NULL DEFAULT false,
 CHECK(duration_minutes IS NULL OR duration_minutes BETWEEN 15 AND 480),
 CHECK(starting_price_cents IS NULL OR starting_price_cents>=0),
 CHECK(NOT is_bookable OR duration_minutes IS NOT NULL)
);
-- Website confirms categories, NOT prices, appointment length, or staff assignments.
INSERT INTO services(slug,name_en,name_es,requires_consultation) VALUES
 ('haircut','Haircuts','Cortes de cabello',false),
 ('hair-color','Hair color','Color de cabello',true),
 ('balayage','Balayage / highlights','Balayage / mechas',true),
 ('extensions','Hair extensions','Extensiones de cabello',true),
 ('styling','Hair styling','Peinados',false),
 ('keratin','Keratin straightening','Alisado de keratina',true),
 ('makeup','Makeup','Maquillaje',false),
 ('brow-wax','Eyebrow waxing','Depilación de cejas',false),
 ('lash-lift','Eyelash lift','Levantamiento de pestañas',false);
CREATE TABLE stylists (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),salon_id uuid NOT NULL REFERENCES salons(id),
 user_id uuid UNIQUE REFERENCES users(id),display_name text NOT NULL,bio text,
 is_active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE stylist_services (
 stylist_id uuid NOT NULL REFERENCES stylists(id) ON DELETE CASCADE,
 service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
 PRIMARY KEY(stylist_id,service_id)
);
CREATE TABLE stylist_shifts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),stylist_id uuid NOT NULL REFERENCES stylists(id) ON DELETE CASCADE,
 weekday integer NOT NULL CHECK(weekday BETWEEN 1 AND 7),
 start_local time NOT NULL,end_local time NOT NULL,
 CHECK(end_local>start_local)
);
CREATE TABLE stylist_time_off (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),stylist_id uuid NOT NULL REFERENCES stylists(id),
 start_at timestamptz NOT NULL,end_at timestamptz NOT NULL,
 CHECK(end_at>start_at)
);
CREATE TABLE appointments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),customer_id uuid NOT NULL REFERENCES users(id),
 salon_id uuid NOT NULL REFERENCES salons(id),stylist_id uuid NOT NULL REFERENCES stylists(id),
 service_id uuid NOT NULL REFERENCES services(id),start_at timestamptz NOT NULL,
 end_at timestamptz NOT NULL,status text NOT NULL DEFAULT 'requested'
 CHECK(status IN ('requested','confirmed','in_progress','completed','cancel_requested','cancelled','declined')),
 idempotency_key uuid NOT NULL,quoted_price_cents integer,
 customer_note text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(end_at>start_at),UNIQUE(customer_id,idempotency_key)
);
-- Database-level race protection: overlap cannot occur even if two requests arrive simultaneously.
ALTER TABLE appointments ADD CONSTRAINT appointments_no_overlap
 EXCLUDE USING gist (stylist_id WITH =, tstzrange(start_at,end_at,'[)') WITH &&)
 WHERE (status IN ('requested','confirmed','in_progress','cancel_requested'));
CREATE INDEX appointments_by_customer ON appointments(customer_id,start_at DESC);
CREATE INDEX appointments_by_stylist ON appointments(stylist_id,start_at);
CREATE TABLE audit_logs (
 id bigserial PRIMARY KEY,actor_id uuid REFERENCES users(id),action text NOT NULL,
 resource_id uuid,details jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now()
);
