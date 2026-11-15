# Historical finance notes - v0.3

There is **no active Stripe checkout or Stripe webhook route** in v0.3. Rewards and Club subscriptions have been retired at the owner's direction. Existing `payment_webhook_events`, `member_subscriptions` and `reward_ledger` tables from v0.2 remain archived in the database for lawful retention and reconciliation; they are not accessible through customer endpoints.

If a previous deployment enabled recurring Stripe membership billing, removing the app UI or webhook handler does NOT cancel Stripe billing. The merchant/operator must review existing live subscriptions in Stripe, notify customers as required, settle credits/refunds, and separately cancel plans. Record results with a qualified finance professional.

Future appointment deposits, tipping, POS integrations or paid events require a new dedicated payment module, signed webhook event handling, tax/refund reconciliation and end-to-end test coverage before activation.
