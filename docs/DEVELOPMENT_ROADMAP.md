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
**Status: SELESAI SEPENUHNYA PADA STAGING DAN PRODUCTION — 23 November 2026.**
**Checkpoint:** PR #10 telah digabung ke `main` pada commit `8aff277b1ebb88838b2c6c8c2745065428928e13`. **CI:** [Run #76 lulus seluruh pemeriksaan](https://github.com/Morepp461/Janji-Kita-/actions/runs/45050908634). **Deployment Vercel production:** READY.
**Dependencies:** Phase 0.
- Register/login/reset, profiles, locale/timezone preferences, and Supabase Auth sessions.
- Role and permission model backed by trusted database tables; browser metadata is not used as an authorization source.
- Admin shell with role-gated access and append-only audit records for category, style, feature flag, and role changes.
- Categories/styles CRUD and feature flag management.
- RLS policies isolate profiles and roles by authenticated user; privileged functions are restricted and internal helpers are kept outside the exposed API schema.
- Seed 8 categories and 10 design styles in Supabase staging and production.
- UI tests cover registration and password recovery; pgTAP covers RLS, grants, and cross-user profile/role isolation.
- Supabase staging and production Security Advisor report no security findings.
**Done when:** user cannot access another user's data; admin actions are permission-gated and audited; mobile-responsive authentication works. Kriteria fase ini telah dipenuhi di staging dan production.
**Catatan rilis:** keempat migrasi production telah diterapkan dan riwayat migrasi diselaraskan dengan timestamp file repository. Paket Supabase Free tidak menyediakan backup otomatis harian dan backup manual tidak tersedia melalui koneksi yang digunakan. Sesuai persetujuan pemilik, backup dilewati setelah production diverifikasi memiliki 0 akun Auth dan 0 objek Storage. PR #10 telah digabung dan deployment Vercel production berstatus READY. Vercel preview tetap nonaktif.

## 4. Phase 2 — Marketplace and Invitation Core
**Status: SELESAI SEPENUHNYA DI STAGING DAN PRODUCTION — 23 November 2026.**
**Checkpoint:** [PR #12 telah digabung](https://github.com/Morepp461/Janji-Kita-/pull/12) ke `main` pada commit `be079cad82866c77da301aaacede000287f6db8b`.
**CI kode:** [Run #45059131777 lulus](https://github.com/Morepp461/Janji-Kita-/actions/runs/45059131777), termasuk 40 pengujian pgTAP Fase 2, lint skema, format, lint, typecheck, unit test, dan build production. Perubahan setelah checkpoint kode hanya dokumentasi waiver rilis.
**Migrasi production:** `20261122192144` (`phase_2_marketplace_invitation_core`), `20261122192146` (`phase_2_public_renderer_invoker`), dan `20261122192149` (`phase_2_template_version_rls`). Seluruh migrasi tercatat di Supabase production dan staging.
**Deployment Vercel production:** [READY](https://janji-kita-morepp.vercel.app), deployment `dpl_6FsS9VkGeL8FcPNaNBcNT8BKuKFX`, alias production aktif.
**Dependencies:** Phase 1.
- Metadata template, versioning immutable, metadata aset, dan bucket Storage.
- Marketplace dengan pencarian, filter kategori/gaya, pengurutan, pemuatan bertahap, detail `/templates/:slug`, serta pratinjau desktop/ponsel.
- Draft undangan dari template maupun kanvas kosong, daftar draft, buka ulang, dan pratinjau.
- Renderer dokumen berbasis daftar komponen yang diizinkan.
- Renderer publik hanya mengembalikan undangan aktif dan versi terbit melalui RPC `SECURITY INVOKER` dengan RLS; peran anon tidak dapat membaca kolom internal pemilik.
- Pengujian snapshot membuktikan perubahan versi template tidak mengubah draft yang telah dibuat; versi template dan versi undangan terbit tidak dapat diubah.
- Production terverifikasi memiliki lima tabel Fase 2 dengan RLS aktif, dua bucket Storage, dan tidak ada data Fase 2 yang tertinggal.
- Data Auth/profil pemilik tetap utuh (1 akun Auth, 1 profil); Storage objects tetap 0.
**Done when:** draft dapat dibuat, dibuka kembali, dan dipratinjau; rute publik tidak dapat menampilkan draft yang belum diterbitkan; perubahan versi template tidak mengubah snapshot undangan lama. Kriteria staging, production, dan deployment terpenuhi.
**Peringatan yang diketahui:** Security Advisor production menampilkan satu peringatan yang sudah ada, `Leaked Password Protection Disabled`; tidak diubah dalam cakupan Fase 2. Performance Advisor melaporkan indeks FK yang belum digunakan/terindeks; bukan kegagalan keamanan atau build dan dicatat untuk optimasi terpisah.
**Keputusan rilis:** Pemilik proyek secara eksplisit menyetujui pengecualian backup/restore untuk rilis Fase 2 pada 23 November 2026. Risiko kehilangan data diterima; inventaris production sebelum migrasi adalah 1 akun Auth, 1 profil, dan 0 objek Storage. Migrasi Fase 2 bersifat aditif dan recovery dilakukan dengan corrective/forward migration bila diperlukan. Pengecualian hanya berlaku untuk rilis ini. Deployment preview tetap nonaktif.

## 5. Phase 3 — Visual Editor
**Status: IMPLEMENTASI DAN QA STAGING SELESAI — 23 November 2026.**
**Checkpoint:** [PR #14](https://github.com/Morepp461/Janji-Kita-/pull/14) (belum digabung; menunggu persetujuan release gate production). **CI:** [Run #45062979222 lulus seluruh pemeriksaan](https://github.com/Morepp461/Janji-Kita-/actions/runs/45062979222).
**Dependencies:** Phase 2 and stable schema.
- Component registry and property inspector untuk tata letak, teks, media, acara, tamu, sosial, dan dekorasi.
- Section/layer operations: add, select, reorder, duplicate, lock/unlock, hide/show, delete, undo, and redo.
- Content/style/layout controls serta visibilitas responsif desktop/mobile.
- Responsive preview dan validasi struktur, konten wajib, aset, dan tautan.
- Autosave melalui RPC dengan optimistic concurrency, konflik eksplisit, dan pemulihan lokal ketika offline/refresh.
- Asset upload privat dengan validasi MIME/signature/ukuran, ekstraksi metadata, optimasi gambar WebP, dan pembatasan path berdasarkan pemilik.
- Preview editor dan public renderer menggunakan komponen renderer yang sama.
- Dua migrasi Fase 3 diterapkan pada Supabase staging. RLS aktif, Security Advisor bersih, dan pemeriksaan staging untuk RPC, bucket privat, serta kebijakan aset lulus.
**Done when:** core editing operations pass tests; refresh/network loss does not silently lose saved work; responsive mobile layout is implemented; renderer preview parity verified. Seluruh kriteria implementasi dan QA staging telah dipenuhi.

**Production release gate:** migrasi production dan merge ke `main` ditahan sampai pemilik secara eksplisit menyetujui pengecualian backup/restore khusus Fase 3. Persetujuan pengecualian Fase 2 tidak diperluas otomatis.

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
Backup/restore test atau pengecualian tertulis yang disetujui pemilik proyek; migration recovery plan, version immutability, no cross-environment data leakage.

**Pengecualian rilis Fase 2 — disetujui pemilik proyek, 23 November 2026:** backup production dilewati karena paket Supabase Free dan akses integrasi yang tersedia tidak menyediakan jalur backup manual. Pemilik secara eksplisit menerima risiko tersebut dan memerintahkan kelanjutan tanpa backup. Inventaris sebelum migrasi: 1 akun Auth, 1 profil, dan 0 objek Storage. Tiga migrasi Fase 2 bersifat aditif (tabel, indeks, fungsi, policy, bucket, dan grant baru); tidak menghapus atau mengubah data akun/profil yang ada. Pemulihan mengandalkan corrective/forward migration, bukan klaim bahwa restore telah diuji. Pengecualian ini hanya berlaku untuk rilis Fase 2 ini dan tidak menghapus kewajiban backup untuk perubahan destruktif atau rilis berikutnya.

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
9. Production deploy only after release gate and owner approval; an explicitly documented owner-approved exception may waive an unavailable gate for a defined release, with residual risk and recovery approach recorded.

## 13. Dependencies and Critical Path
Foundation → Auth/RLS → invitation schema → renderer → editor → order/payment → entitlement/publish → guest operations. Reseller and Premium depend on commerce/identity. Advanced imports depend on editor schema and secure asset pipeline. Avoid starting advanced import before core editor model is stable.
