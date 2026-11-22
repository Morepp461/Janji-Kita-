# DEVELOPMENT ROADMAP — JANJI KITA
**Versi:** 1.0 | **Status:** Final baseline delivery plan

## 1. Delivery Rules
- PRD is product source of truth; architecture/schema/UI/editor/monetization specs are implementation baselines.
- Work is delivered in vertical slices with tests, not UI-only milestones.
- Every phase ends with acceptance review and updated docs.
- Do not claim feature complete until criteria pass on mobile and desktop.
- No production payment until gateway and operational release gates pass.

## 2. Phase 0 — Repository and Foundation
**Status: SELESAI SEPENUHNYA — 22 November 2026.**
**Checkpoint commit:** `83c6891ba446b3ad341e4cf20c49190d063ebd22`.
**Dependencies:** none.
- Create repository structure, lint/format/test/CI.
- Configure local, staging, production environments.
- Setup Supabase projects, migrations, Auth, RLS baseline.
- Konfigurasikan deployment Vercel production-only dari cabang `main`; deployment preview dinonaktifkan sesuai keputusan pemilik proyek.
- Add `.env.example`, secrets policy, error logging.
- README utama dan panduan pengembang ditulis dalam bahasa Indonesia.
- PostgreSQL lokal, staging, dan production diselaraskan ke versi utama 17.
- Riwayat migrasi staging dan production diselaraskan dengan versi migrasi di repository.
**Done when:** instalasi bersih, build, dan seluruh pengujian lulus; project staging dan production terpisah; tidak ada rahasia yang dikomit; pipeline migrasi dapat dijalankan ulang; deployment Vercel hanya berasal dari `main` dan deployment preview tetap nonaktif. Seluruh kriteria tersebut telah dipenuhi dan penerapan production berstatus READY.

## 3. Phase 1 — Identity, Roles, and Admin Foundation
**Status: SELESAI SEPENUHNYA PADA STAGING — 23 November 2026.**
**Checkpoint:** PR #10 — `feat/phase-1-identity-admin`.
**Dependencies:** Phase 0.
- Register/login/reset, profiles, locale/timezone preferences, and Supabase Auth sessions.
- Role and permission model backed by trusted database tables; browser metadata is not used as an authorization source.
- Admin shell with role-gated access and append-only audit records for category, style, feature flag, and role changes.
- Categories/styles CRUD and feature flag management.
- RLS policies isolate profiles and roles by authenticated user; privileged functions are restricted and internal helpers are kept outside the exposed API schema.
- Seed 8 categories and 10 design styles in Supabase staging.
- UI tests cover registration and password recovery; pgTAP covers RLS, grants, and cross-user profile/role isolation.
- Supabase staging Security Advisor reports no security findings.
**Done when:** user cannot access another user's data; admin actions are permission-gated and audited; mobile-responsive authentication works. Kriteria fase ini telah dipenuhi pada staging.
**Catatan rilis:** production migration and merge to `main` remain gated by backup/review and explicit release approval. Vercel preview remains disabled per project decision.

## 4. Phase 2 — Marketplace and Invitation Core
**Dependencies:** Phase 1.
- Template metadata/versioning and asset storage.
- Marketplace browse/search/filter/detail.
- Create invitation from template and blank starter.
- Invitation document schema and public renderer.
- Draft save and preview.
**Done when:** draft can be created, reopened, and previewed; public route cannot expose unpublished draft; template version change does not alter existing invitation snapshot.

## 5. Phase 3 — Visual Editor
**Dependencies:** Phase 2 and stable schema.
- Component registry and property inspector.
- Section/layer operations.
- Content/style/layout controls.
- Responsive preview and validation.
- Autosave, conflict handling, undo/redo.
- Asset upload and processing.
**Done when:** core editing operations pass tests; refresh/network loss does not silently lose saved work; editor usable on Android; renderer preview parity verified.

## 6. Phase 4 — Commerce and Publication
**Dependencies:** Phase 2, Phase 3 basic editor, Phase 1 security.
- Pricing and add-on configuration.
- Order snapshots and coupon rules.
- Midtrans sandbox adapter and webhook.
- Idempotent payment processing.
- 30-day entitlement, expiry and renewal.
- Publish/update atomic version pointer.
**Done when:** no unpaid invitation can publish; duplicate webhook grants one entitlement; expiry enforced by renderer; failed publish leaves old version live. Real payment remains disabled until production merchant approval and release gate.

## 7. Phase 5 — Guest Operations
**Dependencies:** Phase 2 public renderer and Phase 4 publish.
- Guest CRUD and CSV import/export.
- Personalized links.
- RSVP and guestbook.
- QR tickets and check-in.
- Attendance dashboard.
**Done when:** guest data private; invalid/duplicate ticket rejected; RSVP rate limited; CSV import reports row errors.

## 8. Phase 6 — Collaboration, Premium, and Reseller
**Dependencies:** Phase 1 roles, Phase 4 commerce.
- Collaborator invitations and limits.
- Premium subscription and entitlement adapter.
- Reseller application/approval, price rules, client records.
- Attribution and reports.
**Done when:** regular limit enforced transactionally; Premium limit configurable; owner/payer/creator/reseller distinct; no false payout representation.

## 9. Phase 7 — Admin, Analytics, and Localization
**Dependencies:** core modules.
- Complete admin configuration surfaces.
- Template moderation and marketplace consent workflow.
- Analytics and audit dashboards.
- Locale and timezone management.
**Done when:** admin can manage operational content without code for supported fields; consent traceable; locale switching works on dashboard and invitation.

## 10. Phase 8 — Advanced Imports and Experience
**Dependencies:** stable editor and asset pipeline.
- Canva/Figma official integrations where approved.
- PSD/AI/Affinity/PPTX/SVG/PDF import pipelines according to capability.
- Seating planner, livestream, advanced animation.
**Done when:** every format has a compatibility matrix, clear partial-import report, security validation, and tested fallback. Unsupported integrations remain disabled.

## 11. Release Gates
### Functional
All P0 acceptance criteria pass; no dead controls; error and empty states present.

### Security
RLS tests, authorization tests, secret scan, upload validation, rate limiting, webhook verification, dependency audit.

### Data
Backup/restore test, migration rollback plan, version immutability, no cross-environment data leakage.

### Payment
Sandbox E2E, duplicate/out-of-order webhook, reconciliation, pricing snapshot, refund handling, finance audit.

### Performance
Android mobile smoke test, responsive rendering, image optimization, editor memory/performance checks, public page loading.

### Operations
Monitoring, alerting, cost limits, storage cleanup, incident runbook, support workflow.

### Legal/content
Terms, privacy, cookie notice if applicable, asset license review, consent language, payment/refund policy, local compliance review.

## 12. Definition of Done
A feature is done only when:
1. Requirements and UI states are documented.
2. Backend authorization and validation exist.
3. Tests cover success, failure, boundary, and unauthorized cases.
4. Mobile and desktop checked.
5. Logs/metrics/audit are present where needed.
6. No secrets or raw internal data leak to UI.
7. Documentation and changelog updated.
8. Deployed to staging and smoke-tested.
9. Production deploy only after release gate and owner approval.

## 13. Dependencies and Critical Path
Foundation → Auth/RLS → invitation schema → renderer → editor → order/payment → entitlement/publish → guest operations. Reseller and Premium depend on commerce/identity. Advanced imports depend on editor schema and secure asset pipeline. Avoid starting advanced import before core editor model is stable.
