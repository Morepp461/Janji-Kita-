# MONETIZATION SPECIFICATION — JANJI KITA
**Versi:** 1.0 | **Status:** Final baseline

## 1. Revenue Streams
1. One-time invitation orders.
2. Template/design base price.
3. Optional add-ons.
4. Premium monthly subscription for expanded collaboration capacity.
5. Reseller wholesale pricing model.
Affiliate commission and automatic payout are out of initial scope.

## 2. Invitation Pricing
Final price is calculated server-side:
`subtotal = template_price + sum(add_on_price × quantity)`
`grand_total = subtotal - eligible_discount + tax_and_explicit_fees`
All values are snapshotted into order at creation. Currency is IDR initially. Frontend must display itemized total before payment. No hidden fees.

Admin can configure template price, add-on price, availability, currency, discount, tax/fee rules, effective dates, reseller tier prices, and publication duration. Changes affect new orders only; existing orders preserve snapshots.

## 3. Free Draft vs Paid Publication
Draft creation/editing costs zero. Public publication is never free. Checkout is mandatory before publish. A pending or failed payment never creates public entitlement. Each invitation has its own order even if customer has Premium.

## 4. 30-Day Entitlement
Payment success timestamp is the start anchor. Entitlement includes invitation ID, start, expiry, order ID, and state. Expiry job transitions public access to expired; renderer independently checks active window so a delayed scheduler cannot expose expired pages.
- Initial purchase: `active_from = verified_paid_at`, `active_until = active_from + 30 days`.
- Renewal before expiry: add 30 days to existing `active_until`.
- Renewal after expiry: `active_from = verified_paid_at`, `active_until = verified_paid_at + 30 days`.
All durations configurable by admin but baseline is 30 days.

## 5. Add-ons
Add-ons are optional paid capabilities or services attached to an invitation. Admin defines code, description, price, billing type, compatibility, quantity rules, and entitlement effect. Examples from product scope may include enhanced guest tools, QR/ticket, seating, extra media capacity, or other advanced options. The exact catalog and prices are admin decisions, not hardcoded defaults.
Add-on entitlements are created only after order payment succeeds. Refund handling must revoke or adjust entitlement according to admin policy.

## 6. Premium Subscription
- Monthly subscription.
- Main benefit: collaborator limit above regular maximum.
- Regular account: owner + one editor = two total.
- Premium limit: configurable by admin.
- Premium does not include free invitation publication.
- Subscription states: active, past_due, cancelled, expired.
- On expiration, do not delete collaborators or invitation data; restrict additional editing according to downgrade policy.
- Price, billing provider, trial, cancellation, and grace period require admin configuration before launch. Do not assume a free trial unless explicitly approved.

## 7. Payment Gateway
Initial target: Midtrans. Payment methods depend on merchant onboarding and gateway enablement. Backend owns server key and transaction creation. Browser receives only safe token/redirect.
- Create order with idempotency.
- Create payment attempt.
- Verify webhook signature.
- Verify transaction status server-side as required.
- Process duplicate webhook once.
- Store redacted event history.
- Map provider statuses to internal states.
- Reconcile pending transactions.
- Never trust client redirect as proof of payment.

## 8. Order State Machine
`draft → pending → paid`
Other terminal/exception states: `failed`, `cancelled`, `expired`, `refunded`, `partially_refunded`.
Transitions must be validated server-side. A paid order cannot silently return to pending. Refund is an explicit event and entitlement impact is auditable.

## 9. Coupon and Promotion
Admin can define percent/fixed coupon, start/end, global/per-user redemption limits, eligible templates/categories/add-ons, minimum order, and reseller compatibility. Coupon calculation occurs server-side. Redemption is reserved/committed transactionally to prevent oversubscription.

## 10. Reseller Commercial Model
- Reseller status requires application/approval or admin grant.
- Wholesale price is controlled by platform rule.
- Reseller may set final client selling price within platform policy.
- Track `payer_user_id`, `owner_user_id`, `created_by`, `reseller_user_id` separately.
- Support reseller pays and owns/manages invitation, or client pays directly with reseller attribution.
- Show platform wholesale cost, recorded resale amount (if entered), and calculated margin.
- No automatic payout/affiliate commission in initial release. Payment settlement and margin reporting must not be misrepresented as money transferred to reseller.

## 11. Consent and Marketplace
Optional consent at checkout is independent of transaction acceptance and is never preselected. Record the user, invitation, order, consent scope, text version, and grant/withdrawal timestamps. No consent means no reuse. Customer-source templates require an active, approved consent linked to the same invitation before publication. Owners can withdraw consent; linked published templates are archived automatically, and rejected/withdrawn consent blocks future publication. Third-party assets require separate rights clearance.

## 12. Refunds, Disputes, and Support
Admin policy must define refund eligibility, processing, gateway fees, chargeback, invitation deactivation, and customer communication before launch. Every adjustment creates audit record. Do not promise automatic refund if gateway/policy does not support it.

## 13. Finance Reporting
Reports: gross orders, discounts, taxes/fees, gateway status, net receipts where available, add-on sales, subscription MRR, reseller-attributed orders, refund totals, and outstanding pending payments. Clearly distinguish order value from settled funds.

## 14. Launch Gate
Before accepting real money: production merchant credentials, webhook HTTPS endpoint, signature verification, reconciliation, idempotency tests, price snapshot tests, refund policy, terms/privacy pages, finance access controls, and end-to-end sandbox test must pass.
