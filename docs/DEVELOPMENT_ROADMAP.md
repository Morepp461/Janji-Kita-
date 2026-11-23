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
**Keputusan backup global — disetujui pemilik proyek, 23 November 2026:** pemilik secara eksplisit menetapkan pengecualian backup/restore berlaku untuk seluruh fase proyek, bukan hanya Fase 2 atau Fase 3, karena paket Supabase Free dan akses integrasi yang tersedia tidak menyediakan jalur backup manual. Pemilik menerima risiko kehilangan data dan mengizinkan pekerjaan fase berikutnya berlanjut tanpa backup. Restore tidak diklaim telah diuji; recovery mengandalkan corrective/forward migration. Persetujuan ini tidak mengubah kewajiban untuk mencatat risiko, memeriksa sifat migrasi, dan menyiapkan rencana recovery pada setiap rilis.

## 5. Phase 3 — Visual Editor
**Status: IMPLEMENTASI, QA, DAN MIGRASI PRODUCTION SELESAI — 23 November 2026.**
**Checkpoint:** [PR #15 telah digabung](https://github.com/Morepp461/Janji-Kita-/pull/15) ke `main` pada commit `5a2a003436cce8a5fb31064985255f23148ab068`. **CI:** [Run #45063740422 lulus seluruh pemeriksaan](https://github.com/Morepp461/Janji-Kita-/actions/runs/45063740422). **Deployment Vercel production:** [READY](https://janji-kita-nine.vercel.app).
**Dependencies:** Phase 2 and stable schema.
- Component registry and property inspector untuk tata letak, teks, media, acara, tamu, sosial, dan dekorasi.
- Section/layer operations: add, select, reorder, duplicate, lock/unlock, hide/show, delete, undo, and redo.
- Content/style/layout controls serta visibilitas responsif desktop/mobile.
- Responsive preview dan validasi struktur, konten wajib, aset, dan tautan.
- Autosave melalui RPC dengan optimistic concurrency, konflik eksplisit, dan pemulihan lokal ketika offline/refresh.
- Asset upload privat dengan validasi MIME/signature/ukuran, ekstraksi metadata, optimasi gambar WebP, dan pembatasan path berdasarkan pemilik.
- Preview editor dan public renderer menggunakan komponen renderer yang sama.
- Dua migrasi Fase 3 diterapkan pada Supabase staging dan production. Production mencatat versi `20261122234541` dan `20261122234549`; pemeriksaan RPC, hak eksekusi, RLS, bucket privat, dan satu kebijakan INSERT aset lulus.
- Security Advisor production masih menampilkan satu peringatan Auth yang sudah ada, `Leaked Password Protection Disabled`; tidak diubah dalam cakupan Fase 3.
**Done when:** core editing operations pass tests; refresh/network loss does not silently lose saved work; responsive mobile layout is implemented; renderer preview parity verified. Seluruh kriteria implementasi dan QA staging telah dipenuhi.

**Production release:** migrasi production telah diterapkan dan diverifikasi. PR #15 memuat implementasi editor visual. Deployment preview tetap nonaktif.

## 6. Phase 4 — Commerce and Publication
**Status: SELESAI SEPENUHNYA PADA STAGING DAN PRODUCTION — 23 November 2026.**
**Checkpoint:** [PR #16](https://github.com/Morepp461/Janji-Kita-/pull/16); [CI run #45090335232 lulus seluruh job](https://github.com/Morepp461/Janji-Kita-/actions/runs/45090335232).
**Dependencies:** Phase 2, Phase 3 basic editor, Phase 1 security.

### Implementasi dan verifikasi
- Pricing, konfigurasi add-on, snapshot order, kupon dengan batas penggunaan, dan perhitungan harga server-side.
- Midtrans sandbox adapter, pembuatan sesi pembayaran, verifikasi signature dan status webhook, rekonsiliasi pending, serta pemrosesan idempoten.
- Entitlement publikasi 30 hari, perpanjangan, expiry terjadwal, refund sebagian/penuh, dan renderer yang menolak undangan kedaluwarsa.
- Publikasi/pembaruan versi immutable dengan perpindahan pointer atomik; kegagalan publikasi tidak mengganti versi publik sebelumnya.
- Dashboard admin commerce dan dashboard finance read-only.
- Seluruh **15 migrasi Fase 4** diterapkan pada Supabase staging dan production.
- Tiga Edge Functions aktif pada kedua project: `create-midtrans-payment`, `midtrans-webhook`, dan `reconcile-midtrans-pending`. Guard server-side hanya mengizinkan integrasi sandbox pada project staging; seluruh transaksi ditolak pada project production.
- **74 pengujian pgTAP Fase 4 lulus pada staging** dan **18 pengujian regresi editor Fase 3 lulus** setelah kontrak autosave tetap menggunakan SECURITY INVOKER.
- CI menjalankan format, lint, typecheck, unit test, build, seluruh migrasi lokal, database lint, dan **169 pengujian pgTAP lintas fase**; seluruh job lulus pada run #45090335232.
- Smoke test production memastikan tabel commerce tersedia, RLS aktif pada semua tabel commerce, anon tidak dapat membaca order/payment attempts, dan job expiry aktif setiap 15 menit.
- Konfigurasi Vercel production tetap menggunakan Supabase production; deployment preview tetap nonaktif dan deployment aplikasi hanya berasal dari `main`.

### Gerbang sebelum menerima pembayaran nyata
- Pembayaran production tetap dinonaktifkan. Transaksi sandbox end-to-end melalui akun merchant belum diverifikasi karena kredensial `MIDTRANS_SERVER_KEY` belum dapat diverifikasi melalui akses yang tersedia.
- Sebelum menerima uang sungguhan, wajib melakukan transaksi sandbox, memverifikasi callback/webhook dan rekonsiliasi, memperoleh persetujuan merchant production, serta memenuhi seluruh launch gate pada MONETIZATION_SPECIFICATION.md.
- Kunci Midtrans hanya boleh disimpan pada Supabase Function Secrets, tidak pada variabel `VITE_` atau repository.

**Done when:** seluruh kriteria implementasi fase ini telah lulus pada staging dan migrasi/guard produksi telah diterapkan. Penerimaan uang sungguhan tetap dikunci sampai launch gate monetisasi terpenuhi.

## 7. Phase 5 — Guest Operations
**Dependencies:** Phase 2 public renderer and Phase 4 publish.
- Guest CRUD and CSV import/export.
- Personalized links.
- RSVP and guestbook.
- QR tickets and check-in.
- Attendance dashboard.
**Done when:** guest data private; invalid/duplicate ticket rejected; RSVP rate limited; CSV import reports row errors.

## 8. Fase 6 — Kolaborasi, Premium, dan Reseller

**SELESAI SEPENUHNYA — 23 NOVEMBER 2026**

**Ketergantungan:** role Fase 1 dan commerce Fase 4.

- Undangan kolaborator melalui email dengan peran editor dan pembaca.
- Kotak masuk undangan, penerimaan, pencabutan akses, dan tampilan baca-saja.
- Batas editor akun reguler ditegakkan secara transaksional.
- Paket Premium menyediakan batas kolaborator yang dapat dikonfigurasi admin, hak akses berbasis langganan, sinkronisasi status, dan masa tenggang.
- Aplikasi dan persetujuan reseller, tingkat harga, kode rujukan, aturan harga khusus reseller, data klien, serta pengarsipan klien.
- Reseller dapat membuat dan mengelola undangan atas nama klien terverifikasi.
- Pemilik, pembuat, pembayar, dan reseller disimpan sebagai identitas terpisah.
- Harga khusus reseller diterapkan ketika reseller menjadi pembayar. Pembayaran langsung klien tetap memakai harga retail dengan atribusi reseller.
- Laporan penjualan dan margin tidak diklaim sebagai pencairan komisi.
- Kebijakan RLS, hak akses Storage, audit, dan adapter penyedia langganan diterapkan.

**Kriteria selesai — seluruhnya terpenuhi:**
- Batas akun reguler dan Premium diuji secara transaksional.
- Hak akses editor/pembaca dan akses reseller diverifikasi.
- Atribusi pemilik/pembuat/pembayar/reseller teruji.
- Tiga migrasi diterapkan dan diverifikasi pada Supabase staging serta production.
- CI lulus: [run #45112026551](https://github.com/Morepp461/Janji-Kita-/actions/runs/45112026551).
- [PR #19](https://github.com/Morepp461/Janji-Kita-/pull/19) digabung pada commit `32c8b69e82bd6e9b55c1542071a8ff899bbdd123`.
- Vercel production berstatus SIAP pada commit yang sama: [janji-kita-morepp.vercel.app](https://janji-kita-morepp.vercel.app).

**Catatan operasional:** paket Premium tetap nonaktif tanpa harga dan penyedia pembayaran yang disetujui admin. Implementasi adapter langganan selesai, tetapi penjualan langganan otomatis belum dibuka.

## 9. Fase 7 — Operasional Admin, Analitik, dan Lokalisasi

**STATUS: SELESAI SEPENUHNYA PADA STAGING DAN PRODUCTION — 23 NOVEMBER 2026.**

**Checkpoint rilis:** [PR #23 digabung](https://github.com/Morepp461/Janji-Kita-/pull/23) ke `main` pada commit `fdae3b5169aefd8fc911821f4dd4432e02c57ee4`. **CI:** [run #45117350630 lulus seluruh job](https://github.com/Morepp461/Janji-Kita-/actions/runs/45117350630), termasuk 318 pengujian pgTAP lintas fase. **Vercel production:** [READY](https://janji-kita-morepp.vercel.app) pada commit yang sama.

**Ketergantungan:** fondasi admin dan permission Fase 1, marketplace/editor Fase 2–3, commerce dan consent checkout Fase 4, serta operasi tamu Fase 5.

### Implementasi dan verifikasi

- Pusat admin menyediakan ringkasan analitik agregat, moderasi template, antrean persetujuan marketplace, inventaris media, katalog locale/zona waktu, pengaturan sistem, dan audit log.
- Template baru dan versi baru dibuat sebagai draft. Template bersumber dari desain pelanggan harus memiliki persetujuan aktif yang terhubung ke undangan sumber dan disetujui moderator sebelum dapat dipublikasikan.
- Checkout menyediakan persetujuan penggunaan desain pelanggan yang opsional dan tidak dicentang otomatis. Pemilik dapat membaca riwayat dan menarik persetujuan. Template terkait diarsipkan saat persetujuan ditarik atau ditolak.
- Analitik memakai allowlist peristiwa dan label rute. ID undangan, slug, kontak tamu, isi dokumen, dan data pribadi tidak diterima sebagai properti analitik.
- Preferensi bahasa dashboard terpisah dari locale dan zona waktu undangan. Pilihan divalidasi di server; undangan baru mewarisi preferensi pemilik, dan renderer publik menggunakan locale/zona waktu undangan.
- Helper berprivilege berada di skema privat `app_private`; RPC yang terekspos berjalan sebagai `SECURITY INVOKER`. Pemeriksaan permission/ownership tetap dilakukan pada implementasi privat.
- RLS aktif pada tabel consent, analitik, locale, pengaturan sistem, template, dan media. Peran anon tidak dapat menjalankan helper analitik privat atau RPC admin.
- Empat migrasi Fase 7 diterapkan pada Supabase staging dan production:
  - Staging: `20261123051019`, `20261123051844`, `20261123051921`, `20261123052434`.
  - Production: `20261123052117`, `20261123052120`, `20261123052123`, `20261123052436`.
- Kedua lingkungan diverifikasi memiliki dua locale aktif dan tepat satu locale default, satu katalog zona waktu publik, serta batas eksekusi RPC privat yang sesuai. Data awal fase ini tetap kosong: belum ada catatan consent atau peristiwa analitik.
- Security Advisor tidak menunjukkan temuan baru dari RPC Fase 7. Peringatan yang tetap tercatat merupakan temuan lintas fase yang telah ada, termasuk proteksi kata sandi bocor yang belum diaktifkan dan RPC `SECURITY DEFINER` yang memang diperlukan untuk operasi tamu/kolaborasi/commerce.
- CI lulus format, lint, typecheck, unit test, build production, seluruh migrasi lokal, database lint, dan 318 pengujian pgTAP: [run #45117350630](https://github.com/Morepp461/Janji-Kita-/actions/runs/45117350630).

### Kriteria selesai — seluruhnya terpenuhi

- Admin dapat mengelola konten operasional yang didukung tanpa perubahan kode.
- Template bersumber dari desain pelanggan tidak dapat dipublikasikan tanpa persetujuan yang aktif dan disetujui.
- Riwayat persetujuan dapat ditelusuri dan pencabutan memblokir penggunaan lanjutan serta mengarsipkan template terkait.
- Analitik menyimpan hanya peristiwa dan label rute yang diizinkan tanpa data pribadi.
- Bahasa dashboard dan locale/zona waktu undangan bekerja secara terpisah pada editor serta renderer publik.
- RLS, batas eksekusi RPC, migrasi, dan pengujian regresi lulus pada pipeline CI.
- Migrasi diterapkan dan diverifikasi pada Supabase staging serta production.
- PR #23 telah digabung dan Vercel production berstatus READY pada commit rilis.

**Checkpoint fase:** implementasi, QA, CI, migrasi staging/production, verifikasi keamanan, dan deployment production selesai sepenuhnya. Fase 7 menjadi checkpoint terbaru proyek.

## 10. Fase 8 — Impor dan Pengalaman Lanjutan
**Dependensi:** editor visual dan pipeline aset stabil.
- Matriks kompatibilitas untuk Canva, Figma, PSD, AI, Affinity, PPTX, SVG, PDF, PNG, dan JPG. Canva/Figma tetap nonaktif sampai API resmi mendapat persetujuan.
- Impor PNG/JPG sebagai aset gambar; SVG disanitasi lalu dirasterisasi; PDF hanya pratinjau lokal. PSD, AI, Affinity, dan PPTX menampilkan status belum didukung beserta fallback ekspor yang jelas.
- Laporan impor memuat format sumber, objek editable, elemen yang diratakan, elemen yang dilewati, peringatan, dan fallback.
- Perencana tempat duduk mengelola meja, kapasitas, dan penempatan tamu. Kapasitas diperiksa secara transaksional di database; informasi meja/kursi publik hanya tersedia melalui token personal yang di-hash dan RPC terbatas.
- Tautan livestream hanya menerima URL HTTPS eksternal. Penyematan provider dan integrasi API tidak diaktifkan tanpa persetujuan resmi.
- Preset animasi aman: fade-in, rise-in, soft-zoom, dan float; mendukung durasi, pemicu, jeda, serta fallback `prefers-reduced-motion`.
**Selesai ketika:** semua format memiliki matriks kompatibilitas, laporan hasil impor yang jelas, validasi keamanan, dan fallback teruji; fitur tempat duduk, tautan livestream, serta animasi tersedia di editor dan renderer publik; integrasi yang belum disetujui tetap nonaktif.

## 11. Release Gates
### Functional
All P0 acceptance criteria pass; no dead controls; error and empty states present.

### Security
RLS tests, authorization tests, secret scan, upload validation, rate limiting, webhook verification, dependency audit.

### Data
Backup/restore test atau pengecualian tertulis yang disetujui pemilik proyek; migration recovery plan, version immutability, no cross-environment data leakage.

**Pengecualian backup global — disetujui pemilik proyek, 23 November 2026:** backup production dilewati pada seluruh fase karena paket Supabase Free dan akses integrasi yang tersedia tidak menyediakan jalur backup manual. Pemilik secara eksplisit menerima risiko kehilangan data dan mengizinkan semua fase proyek berlanjut tanpa backup. Inventaris sebelum migrasi Fase 2: 1 akun Auth, 1 profil, dan 0 objek Storage. Migrasi Fase 2 dan Fase 3 yang diterapkan bersifat aditif; pemulihan mengandalkan corrective/forward migration, bukan klaim bahwa restore telah diuji. Setiap fase tetap harus mencatat inventaris data, meninjau sifat migrasi, dan menyiapkan recovery plan.

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
