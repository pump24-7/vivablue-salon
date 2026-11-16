-- Additive management evidence only. Existing migrations and financial history remain intact.
ALTER TABLE stylist_time_off ADD COLUMN reason text NOT NULL DEFAULT '';
ALTER TABLE lookbook_images ADD COLUMN rights_note text NOT NULL DEFAULT '';
ALTER TABLE lookbook_images ADD COLUMN reviewed_by uuid REFERENCES users(id);
ALTER TABLE lookbook_images ADD COLUMN reviewed_at timestamptz;
ALTER TABLE media_uploads ADD COLUMN review_note text NOT NULL DEFAULT '';
ALTER TABLE media_uploads ADD COLUMN reviewed_at timestamptz;
CREATE INDEX audit_logs_recent_idx ON audit_logs(created_at DESC,id DESC);
