-- Additive customer inbox. Existing appointments and financial history are untouched.
-- New appointment events are written in the same transaction as their status change.
CREATE TABLE customer_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES users(id),
 appointment_id uuid NOT NULL REFERENCES appointments(id),
 status text NOT NULL CHECK(status IN
  ('requested','confirmed','declined','cancel_requested','cancelled','completed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 read_at timestamptz,
 UNIQUE(appointment_id,status)
);
CREATE INDEX customer_notifications_by_user ON customer_notifications(user_id,created_at DESC,id DESC);
CREATE INDEX customer_notifications_unread ON customer_notifications(user_id) WHERE read_at IS NULL;
