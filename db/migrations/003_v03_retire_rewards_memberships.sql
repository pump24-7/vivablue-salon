-- v0.3: owner-directed retirement of customer rewards and Club/memberships.
-- Prior financial records MUST be retained until reviewed under retention, legal and merchant policies.
-- Deployment: disable the app checkout/webhook routes, then run this migration.
-- If there are active Stripe subscriptions in a live tenant, separately cancel them through
-- an operator-approved merchant workflow; this SQL does not affect provider-side billing.
UPDATE membership_plans SET is_published=false WHERE is_published=true;
UPDATE reward_rules SET is_enabled=false,approved_by=NULL WHERE is_enabled=true;
-- Prevent accidental reactivation by legacy internal scripts even if old tables remain.
ALTER TABLE membership_plans ADD CONSTRAINT membership_publication_retired CHECK (is_published=false);
ALTER TABLE reward_rules ADD CONSTRAINT reward_earning_retired CHECK (is_enabled=false);
COMMENT ON TABLE membership_plans IS 'Retired v0.3; legacy data retained for financial review; do not create/publish plans';
COMMENT ON TABLE member_subscriptions IS 'Retired v0.3; historical subscription records retained; provider-side cancellations require operator review';
COMMENT ON TABLE reward_rules IS 'Retired v0.3; all earning rules deactivated';
COMMENT ON TABLE reward_ledger IS 'Retired v0.3; historical ledger retained for audit and data retention';
