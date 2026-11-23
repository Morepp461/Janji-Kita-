# DATABASE SCHEMA — JANJI KITA
**Versi:** 1.0 | **Status:** Final baseline data model

## 1. Konvensi
PostgreSQL. Primary keys UUID (`gen_random_uuid()`), timestamps `timestamptz` UTC, monetary values `bigint` minor units (IDR rupiah integer) plus ISO currency code, status `text` constrained by CHECK or enum. Foreign keys use explicit delete behavior. Semua tabel bisnis memiliki `created_at`; tabel mutable umumnya memiliki `updated_at`. Nama kolom `user_id` mengacu ke `auth.users.id` bila memakai Supabase Auth.

## 2. Tabel Inti

### `profiles`
- `id uuid PK FK auth.users(id) ON DELETE CASCADE`
- `display_name text`, `avatar_path text NULL`, `phone text NULL`
- `preferred_locale text DEFAULT 'id-ID'`, `timezone text DEFAULT 'Asia/Jakarta'`
- `account_status text CHECK(active,suspended,closed) DEFAULT active`
- timestamps
Index: `account_status`, `created_at`.

### `user_roles`
- `id uuid PK`
- `user_id uuid FK profiles(id) ON DELETE CASCADE`
- `role text CHECK(user,admin,super_admin,finance,support,moderator,reseller)`
- `granted_by uuid NULL FK profiles(id)`, `created_at`
Unique: `(user_id, role)`. Role changes audited. Never trust role claims supplied by browser.

### `categories`
- `id uuid PK`, `slug text UNIQUE`, `name_i18n jsonb`
- `description_i18n jsonb`, `sort_order int`, `is_active bool`
- timestamps
Index: `(is_active, sort_order)`.

### `design_styles`
- `id uuid PK`, `slug text UNIQUE`, `name_i18n jsonb`
- `description_i18n jsonb`, `sort_order int`, `is_active bool`
- timestamps.

### `templates`
- `id uuid PK`, `slug text UNIQUE`, `title text`, `category_id uuid FK categories`
- `style_id uuid FK design_styles`, `description text`
- `thumbnail_asset_id uuid NULL FK media_assets`
- `base_price bigint CHECK(base_price >= 0)`, `currency char(3) DEFAULT 'IDR'`
- `status text CHECK(draft,published,archived)`
- `current_version_id uuid NULL`, `created_by uuid FK profiles`
- timestamps
Index: `(status, category_id, style_id)`, `created_by`.

### `template_versions`
- `id uuid PK`, `template_id uuid FK templates ON DELETE CASCADE`
- `version_no int CHECK(version_no > 0)`, `schema_version int`
- `document jsonb NOT NULL`, `asset_manifest jsonb NOT NULL DEFAULT '{}'`
- `change_note text`, `created_by uuid FK profiles`, `created_at`
Unique `(template_id, version_no)`. Published templates point to immutable versions.

### `invitations`
- `id uuid PK`, `owner_user_id uuid FK profiles`
- `reseller_user_id uuid NULL FK profiles`, `created_by uuid FK profiles`
- `template_id uuid NULL FK templates`, `slug text UNIQUE`
- `title text`, `event_category_id uuid FK categories`
- `status text CHECK(draft,pending_payment,active,expired,suspended,archived)`
- `active_from timestamptz NULL`, `active_until timestamptz NULL`
- `published_version_id uuid NULL`, `draft_version_id uuid NULL`
- `timezone text DEFAULT 'Asia/Jakarta'`, `locale text DEFAULT 'id-ID'`
- `deleted_at timestamptz NULL`, timestamps
Indexes: `(owner_user_id,status)`, `(reseller_user_id,created_at)`, `(status,active_until)`, `slug`.
Constraint: active status requires non-null active window and published version. Slug immutable after first publish unless admin-approved redirect.

### `invitation_versions`
- `id uuid PK`, `invitation_id uuid FK invitations ON DELETE CASCADE`
- `version_no int CHECK(version_no > 0)`, `schema_version int`
- `document jsonb NOT NULL`, `asset_manifest jsonb NOT NULL DEFAULT '{}'`
- `state text CHECK(draft,published,archived)`
- `created_by uuid FK profiles`, `created_at`
Unique `(invitation_id,version_no)`. Published rows immutable. Add trigger or backend guard to reject mutation.

### `invitation_collaborators`
- `id uuid PK`, `invitation_id uuid FK invitations ON DELETE CASCADE`
- `user_id uuid FK profiles ON DELETE CASCADE`
- `role text CHECK(editor,viewer)`, `invited_by uuid FK profiles`
- `status text CHECK(invited,pending,accepted,revoked)`
- timestamps
Unique `(invitation_id,user_id)`. Active editor count enforced transactionally in backend against owner + collaborators and entitlement.

### `media_assets`
- `id uuid PK`, `owner_user_id uuid NULL FK profiles`
- `storage_bucket text`, `object_path text UNIQUE`
- `media_type text`, `mime_type text`, `byte_size bigint CHECK(byte_size >= 0)`
- `width int NULL`, `height int NULL`, `duration_ms bigint NULL`
- `checksum text NULL`, `license_metadata jsonb DEFAULT '{}'`
- `visibility text CHECK(private,invitation,template,public) DEFAULT private`
- `processing_status text CHECK(uploaded,processing,ready,failed,quarantined)`
- timestamps
Indexes: `(owner_user_id,created_at)`, `(processing_status,created_at)`.

### `add_ons`
- `id uuid PK`, `code text UNIQUE`, `name_i18n jsonb`, `description_i18n jsonb`
- `price bigint CHECK(price >= 0)`, `currency char(3) DEFAULT 'IDR'`
- `billing_type text CHECK(one_time,recurring,quantity)`
- `is_active bool`, `config jsonb`, timestamps.

### `invitation_add_ons`
- `id uuid PK`, `invitation_id uuid FK invitations ON DELETE CASCADE`
- `add_on_id uuid FK add_ons`, `quantity int CHECK(quantity > 0)`
- `unit_price_snapshot bigint`, `currency char(3)`, `config_snapshot jsonb`
- `created_at`
Unique `(invitation_id,add_on_id)` unless multiple configurable instances are required.

## 3. Commerce and Entitlements

### `orders`
- `id uuid PK`, `order_number text UNIQUE`
- `payer_user_id uuid FK profiles`, `owner_user_id uuid FK profiles`
- `reseller_user_id uuid NULL FK profiles`, `invitation_id uuid FK invitations`
- `status text CHECK(draft,pending,paid,failed,cancelled,expired,refunded,partially_refunded)`
- `subtotal bigint`, `discount_total bigint`, `tax_total bigint`, `grand_total bigint`
- `currency char(3)`, `coupon_id uuid NULL FK coupons`
- `price_snapshot jsonb NOT NULL`, `idempotency_key text UNIQUE`
- `paid_at timestamptz NULL`, timestamps
Indexes `(payer_user_id,created_at)`, `(owner_user_id,created_at)`, `(status,created_at)`, `invitation_id`.

### `order_items`
- `id uuid PK`, `order_id uuid FK orders ON DELETE CASCADE`
- `item_type text CHECK(template,add_on,extension,other)`
- `reference_id uuid NULL`, `description_snapshot text`
- `quantity int CHECK(quantity > 0)`, `unit_price bigint`, `line_total bigint`
- `metadata_snapshot jsonb DEFAULT '{}'`.

### `payment_attempts`
- `id uuid PK`, `order_id uuid FK orders`
- `provider text`, `provider_transaction_id text NULL`
- `provider_order_id text UNIQUE`, `status text`
- `amount bigint`, `currency char(3)`, `payment_method text NULL`
- `raw_status_code text NULL`, `verified_at timestamptz NULL`
- `idempotency_key text UNIQUE`, `created_at`, `updated_at`
Index `(order_id,created_at)`, `(provider_transaction_id)`.

### `payment_events`
- `id uuid PK`, `payment_attempt_id uuid FK payment_attempts`
- `event_key text UNIQUE`, `event_type text`, `payload_redacted jsonb`
- `signature_valid bool`, `processed_at timestamptz NULL`, `created_at`
Never store secrets or unnecessary card/bank personal data in payload.

### `subscriptions`
- `id uuid PK`, `user_id uuid FK profiles`
- `provider text`, `provider_subscription_id text NULL`
- `plan_code text`, `status text CHECK(trialing,active,past_due,cancelled,expired)`
- `period_start timestamptz`, `period_end timestamptz`
- `cancel_at_period_end bool DEFAULT false`, timestamps.

### `entitlements`
- `id uuid PK`, `user_id uuid FK profiles`
- `entitlement_key text`, `source_type text CHECK(subscription,order,admin)`
- `source_id uuid`, `valid_from timestamptz`, `valid_until timestamptz NULL`
- `value jsonb NOT NULL`, `status text CHECK(active,revoked,expired)`
- timestamps
Index `(user_id,entitlement_key,status)`, `(valid_until)`.

### `coupons`
- `id uuid PK`, `code text UNIQUE`, `discount_type text CHECK(percent,fixed)`
- `discount_value bigint CHECK(discount_value >= 0)`
- `starts_at timestamptz`, `ends_at timestamptz`
- `max_redemptions int NULL`, `per_user_limit int NULL`
- `is_active bool`, `rules jsonb`, timestamps.

### `coupon_redemptions`
- `id uuid PK`, `coupon_id uuid FK coupons`, `user_id uuid FK profiles`
- `order_id uuid UNIQUE FK orders`, `discount_amount bigint`, `created_at`.

## 4. Guests and Event Operations

### `guests`
- `id uuid PK`, `invitation_id uuid FK invitations ON DELETE CASCADE`
- `display_name text`, `email text NULL`, `phone text NULL`
- `guest_group text NULL`, `plus_one_allowed bool DEFAULT false`
- `personalized_token_hash text UNIQUE`, `status text CHECK(invited,viewed,responded,checked_in)`
- `metadata jsonb DEFAULT '{}'`, timestamps
Indexes `(invitation_id,display_name)`, `(invitation_id,status)`, unique normalized phone/email per invitation where non-null as product policy. Token raw value must not be stored.

### `rsvps`
- `id uuid PK`, `invitation_id uuid FK invitations`, `guest_id uuid NULL FK guests`
- `response text CHECK(yes,no,maybe)`, `attendee_count int CHECK(attendee_count >= 0)`
- `answers jsonb DEFAULT '{}'`, `responded_at timestamptz`
- `source text`, timestamps
Indexes `(invitation_id,response)`, `(guest_id,responded_at)`.

### `guestbook_entries`
- `id uuid PK`, `invitation_id uuid FK invitations`, `guest_id uuid NULL FK guests`
- `display_name text`, `message text`, `moderation_status text CHECK(pending,approved,rejected)`
- `created_at`, `moderated_by uuid NULL FK profiles`, `moderated_at timestamptz`
Index `(invitation_id,moderation_status,created_at)`.

### `tickets`
- `id uuid PK`, `invitation_id uuid FK invitations`, `guest_id uuid FK guests`
- `ticket_code text UNIQUE`, `token_hash text UNIQUE`
- `status text CHECK(valid,used,revoked)`, `issued_at timestamptz`, `used_at timestamptz NULL`.
QR encodes opaque token/URL, never guest PII.

### `checkins`
- `id uuid PK`, `ticket_id uuid UNIQUE FK tickets`
- `invitation_id uuid FK invitations`, `checked_in_by uuid NULL FK profiles`
- `checked_in_at timestamptz`, `method text CHECK(qr,manual)`, `device_label text NULL`.
Unique ticket check-in prevents duplicate attendance.

### `event_schedules`
- `id uuid PK`, `invitation_id uuid FK invitations ON DELETE CASCADE`
- `title text`, `starts_at timestamptz`, `ends_at timestamptz NULL`
- `venue text NULL`, `location_url text NULL`, `sort_order int`
Index `(invitation_id,sort_order)`.

### `seating_tables`
- `id uuid PK`, `invitation_id uuid FK invitations ON DELETE CASCADE`
- `label text` (1–80 karakter), `capacity int CHECK(1..1000)`, `sort_order int`.
- `created_at`, `updated_at`; indeks `(invitation_id,sort_order,created_at)`.
- RLS hanya mengizinkan pemilik undangan membaca dan mengelola meja.

### `seating_assignments`
- `id uuid PK`, `invitation_id uuid FK invitations ON DELETE CASCADE`, `guest_id uuid FK guests ON DELETE CASCADE`
- `seating_table_id uuid FK seating_tables ON DELETE CASCADE`, `seat_label text NULL` (maks. 40 karakter).
- Unique `(invitation_id,guest_id)`; indeks untuk `invitation_id`, `guest_id`, dan foreign key `seating_table_id`.
- Trigger memastikan tamu dan meja berasal dari undangan yang sama, mencegah kapasitas terlampaui secara transaksional, dan menolak pengurangan kapasitas di bawah jumlah penempatan aktif.
- RLS hanya mengizinkan pemilik undangan membaca dan mengelola penempatan.

### RPC informasi tempat duduk publik
- `public.get_public_guest_seating(p_token_hash text)` adalah pengecualian token-tamu yang memakai `SECURITY DEFINER` dengan `search_path` tetap; fungsi hanya mengembalikan `table_label` serta `seat_label`.
- Helper `app_private.get_public_guest_seating_internal` memvalidasi hash token 64 karakter, status/masa aktif undangan, versi publikasi, dan rate limit sebelum membaca penempatan. Skema `app_private` tetap tidak diberi `USAGE` kepada `anon`; pemanggilan helper hanya dilakukan oleh wrapper berprivilege.
- Token mentah tidak disimpan atau dikembalikan. Akses publik tidak mengekspos nama, email, nomor telepon, atau data RSVP.
- `guest_public_rate_limits.action` mencakup `rsvp`, `guestbook`, dan `seating`; tabel rate limit tetap tidak dapat diakses langsung oleh peran klien.

## 5. Reseller, Consent, Admin, Analytics

### `locales`
- `code text PK`, `name text`, `native_name text`
- `is_active bool`, `is_default bool`, `sort_order int`, timestamps
- Exactly one active locale is the default. Only locales with shipped translation bundles may be enabled.
- Mutations use permission-checked RPCs; a locale cannot be disabled while referenced by an account or invitation.

### `reseller_profiles`
- `id uuid PK`, `user_id uuid UNIQUE FK profiles`
- `status text CHECK(applied,approved,rejected,suspended)`
- `pricing_tier text`, `terms_version text`, `approved_by uuid NULL FK profiles`
- `approved_at timestamptz NULL`, `settings jsonb`, timestamps.

### `reseller_price_rules`
- `id uuid PK`, `reseller_tier text`, `template_id uuid NULL FK templates`
- `add_on_id uuid NULL FK add_ons`, `wholesale_price bigint`
- `currency char(3)`, `valid_from timestamptz`, `valid_until timestamptz NULL`
- `created_at`
Rules must resolve deterministically and be snapshotted into order.

### `consent_records`
- `id uuid PK`, `user_id uuid FK profiles`, `invitation_id uuid FK invitations`
- `order_id uuid NULL FK orders`, `consent_type text`
- `granted bool`, `consent_text_version text`, `granted_at timestamptz NULL`
- `withdrawn_at timestamptz NULL`, `metadata jsonb`
Index `(invitation_id,consent_type,granted)` and `(user_id,created_at)`.
- Consent records include the text version, user, invitation, optional order, grant timestamp, and withdrawal timestamp. Marketplace consent is optional and separate from purchase terms. Withdrawal archives linked customer-source templates.
- Owners receive column-level read access to their consent history; moderation metadata is returned only by the admin-only review RPC.

### `audit_logs`
- `id uuid PK`, `actor_user_id uuid NULL FK profiles`
- `action text`, `target_type text`, `target_id uuid NULL`
- `before_data jsonb NULL`, `after_data jsonb NULL`
- `ip_hash text NULL`, `user_agent_summary text NULL`, `created_at`
Append-only; redact secrets and unnecessary PII.

### `analytics_events`
- `id uuid PK`, `event_name text`, `user_id uuid NULL FK profiles`
- `invitation_id uuid NULL FK invitations`, `session_id text NULL`
- `properties jsonb`, `occurred_at timestamptz`
- Browser writes are accepted only through a validated RPC and an allowlist of event names and route labels. Dynamic invitation IDs/slugs and guest PII are not stored. Admin reads require `analytics.read`.
Partition/retention policy as volume grows; avoid collecting guest PII.

### `system_settings`
- `key text PK`, `value jsonb NOT NULL`, `updated_by uuid NULL FK profiles`
- `updated_at timestamptz`, `description text`.
- Keys resembling secrets, tokens, passwords, or credentials are rejected. Reads are admin-only except the timezone catalog row; writes use the permission-checked timezone configuration RPC and are audited. Generic direct REST mutations are revoked.
- Public RPC wrappers run as `SECURITY INVOKER`; privileged implementations live in the non-exposed `app_private` schema and enforce owner/permission checks.
Sensitive settings should be stored in secret manager, not this table.

## 6. RLS and Authorization Matrix
Default-deny RLS. Enable RLS on all user-facing tables.

| Resource | Owner | Collaborator | Public visitor | Admin |
|---|---|---|---|---|
| Invitation draft | read/write | read/write if editor | none | support access only if authorized/audited |
| Published invitation | read/manage | read/manage by role | read active public version only | moderation |
| Guest list | CRUD | permission-scoped | none | limited support, audited |
| RSVP | read/manage | scoped | insert/update via valid guest token | moderation |
| Guestbook | moderate | moderate if allowed | submit only | moderate |
| Orders | own/payer/owner visibility by policy | none | none | finance role |
| Payment attempts | own safe status | none | none | finance |
| Templates | read published | read published | read published | template role CRUD |
| Media | own/private or authorized invitation | scoped | only public published assets | authorized moderation |
| System settings | none | none | none | `settings.manage` |
| Consent records | read own; withdraw through RPC | none | none | `consent.read` |
| Analytics events | none | none | none | `analytics.read` |
| Locale catalog | read active | read active | read active | `locales.manage` (RPC-only mutations) |

### RLS policy requirements
- Invitation owner: `owner_user_id = auth.uid()`.
- Collaborator: membership row accepted and role grants requested action.
- Public read: expose only a dedicated safe view or RPC returning active published document and public assets; do not grant raw table-wide read.
- Guest data: never public-select. Use opaque guest token RPC with rate limit and minimal returned fields.
- Admin: role check through trusted role table/function; no user-editable metadata claim.
- Service role bypass only in backend; never browser.
- `SECURITY DEFINER` functions set fixed `search_path`, validate caller, and return minimal fields.

## 7. Constraints and Transaction Rules
1. One active published version pointer per invitation.
2. Published version immutable.
3. Invitation active requires paid entitlement and valid window.
4. Order total equals sum of snapshotted line items less discounts plus taxes.
5. One successful payment event grants entitlement once.
6. Check-in unique per ticket.
7. Collaborator editor count enforced in serializable/locked transaction.
8. Consent record separate from purchase terms; customer-source templates require an approved, active consent and are archived on withdrawal.
9. Reseller, payer, owner, creator are separate references.
10. Currency and amount snapshot immutable after order creation.

## 8. Migration and Seed Rules
- Every schema change is a versioned migration.
- Apply migrations to staging first.
- Back up before destructive changes.
- Seed categories/styles/system defaults idempotently.
- Do not seed real customer data.
- RLS tests are mandatory in CI.
