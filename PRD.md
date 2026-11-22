# JANJI KITA
## Product Requirements Document (PRD)
**Status:** FINAL — Baseline produk v1.0  
**Tanggal:** 22 November 2026  
**Pasar awal:** Indonesia | **Platform:** Web responsive, mobile-first  
**Model:** SaaS self-service, pembayaran per undangan

## 1. Ringkasan Produk
Janji Kita adalah platform untuk membuat, mengedit, menerbitkan, mengelola, dan membagikan undangan digital untuk berbagai acara. Pengguna dapat memulai dari template, kanvas kosong, atau impor desain yang didukung. Draft dapat dibuat dan diedit tanpa membayar; pembayaran wajib dilakukan saat checkout sebelum publikasi. Satu undangan yang berhasil dibayar aktif secara publik selama 30 hari sejak pembayaran terverifikasi.

Fitur utama: template marketplace, visual editor, invitation renderer, guest management, RSVP, guestbook, QR check-in, analytics, dashboard pelanggan, kolaborasi, admin control center, reseller, serta subscription Premium untuk kapasitas kolaborator lebih tinggi.

## 2. Visi, Prinsip, dan Tujuan
### Visi
Menjadi platform undangan digital yang mudah digunakan, fleksibel secara visual, dan mampu melayani kebutuhan acara personal maupun organisasi.

### Prinsip
1. Self-service dan no-code untuk alur operasional.
2. Mobile-first, termasuk penggunaan utama melalui Android.
3. Edit before pay; tidak ada paket undangan gratis.
4. Satu undangan = satu order/pembayaran.
5. Masa publikasi 30 hari sejak pembayaran berhasil.
6. Harga, limit, kategori, add-on, dan kebijakan dapat dikonfigurasi admin.
7. Perubahan template tidak merusak undangan yang telah dibuat.
8. Consent-first untuk penggunaan desain pelanggan.
9. Integrasi hanya menjanjikan kemampuan yang benar-benar tersedia.
10. Tidak ada kontrol UI palsu: fitur harus berfungsi atau jelas dinonaktifkan.

### Tujuan bisnis
- Pendapatan transaksi per undangan dan add-on.
- Pendapatan subscription Premium.
- Distribusi melalui reseller.
- Ekspansi kategori, template, bahasa, dan pasar.

### KPI
Track: draft-to-checkout conversion, payment success rate, median creation time, publish success rate, autosave failure rate, RSVP adoption, support tickets per 100 invitations, renewal rate, reseller activation, serta error rate editor/rendering. Target angka ditetapkan setelah baseline penggunaan nyata.

## 3. Persona
- **Pelanggan individu:** membuat undangan acara pribadi.
- **Organizer/organisasi:** membuat undangan acara komunitas atau bisnis.
- **Reseller:** membuat dan mengelola undangan untuk klien dengan harga khusus.
- **Collaborator:** membantu mengedit undangan berdasarkan izin.
- **Admin:** mengelola operasi, konten, harga, pesanan, dan moderasi.
- **Super Admin:** mengelola role dan konfigurasi kritis.

## 4. Kategori dan Gaya
Kategori awal: Wedding (pernikahan, akad, resepsi, lamaran, engagement, anniversary); Birthday; Family (aqiqah, khitanan, syukuran, baby shower); Graduation; Corporate & Business (seminar, konferensi, workshop, grand opening, gathering); Community; Religious; General Event. Kategori dapat dikelola admin.

Gaya awal: Minimalist, Luxury, Botanical, Modern, Traditional, Vintage, Cute/Playful, Editorial, Cinematic, Custom/Experimental. Admin dapat menambah gaya.

## 5. Lokalisasi
- Bahasa dashboard dan bahasa konten undangan dipilih terpisah.
- Bahasa Indonesia menjadi default.
- Siap untuk multi-language, multi-currency, timezone, format tanggal, dan angka.
- Konten undangan dapat menyimpan terjemahan per locale.
- Simpan timestamp dalam UTC; tampilkan sesuai timezone undangan/pengguna.

## 6. Model Bisnis
### Pembayaran undangan
- Tidak ada paket undangan gratis.
- Draft dapat dibuat, disimpan, dan diedit tanpa pembayaran.
- Pembayaran wajib sebelum publish.
- Satu undangan menghasilkan order tersendiri.
- Harga = harga template/desain + add-on + biaya/pajak yang ditampilkan secara transparan.
- Backend menghitung total; frontend tidak menjadi sumber kebenaran harga.
- Integrasi gateway awal: Midtrans; metode pembayaran mengikuti aktivasi merchant dan ketersediaan gateway.

### Masa aktif
- Aktif publik 30 hari sejak pembayaran dinyatakan berhasil oleh backend.
- Saat expired, URL publik menampilkan halaman expired tanpa membocorkan konten privat.
- Draft, versi, dan data tetap tersimpan sesuai kebijakan retensi.
- Perpanjangan memerlukan transaksi baru. Jika dibayar sebelum expired, default-nya menambah 30 hari dari waktu expired; jika setelah expired, aktif 30 hari sejak pembayaran sukses.
- Masa aktif dan kebijakan perpanjangan harus configurable.

### Premium
- Subscription bulanan untuk meningkatkan batas collaborator.
- Akun reguler: maksimal dua editor total per undangan (owner + satu collaborator).
- Premium: batas lebih tinggi, nilainya diatur admin.
- Premium tidak menggantikan pembayaran per undangan.
- Subscription berakhir/gagal: entitlement kembali ke batas reguler secara aman; data tidak dihapus. Jika jumlah collaborator melebihi batas baru, akses edit tambahan dibatasi tanpa menghapus keanggotaan atau konten.

### Persetujuan penggunaan desain
- Checkbox opsional, tidak dicentang otomatis, terpisah dari persetujuan syarat pembelian.
- Tidak menjadi syarat pembelian dan tidak memengaruhi harga/fitur.
- Catat user, invitation/order, timestamp, versi teks, dan scope consent.
- Tanpa consent, desain tidak boleh dipakai sebagai template, promosi, atau materi publik.
- Consent tidak memberi hak atas aset pihak ketiga; admin wajib memeriksa lisensi dan moderasi.

## 7. User Journey
### Buat dan publish
1. Register/login.
2. Pilih kategori.
3. Pilih template, blank canvas, atau impor.
4. Buat draft.
5. Edit dan preview mobile/desktop.
6. Undang collaborator sesuai entitlement.
7. Lengkapi konten dan validasi.
8. Pilih add-on.
9. Lihat ringkasan harga.
10. Pilih consent marketplace secara opsional.
11. Checkout.
12. Backend membuat transaksi Midtrans dan memverifikasi webhook/status.
13. Pembayaran sukses mengaktifkan publikasi 30 hari.
14. URL publik dibuat dan dapat dibagikan.

### Edit undangan aktif
Perubahan masuk ke draft revision, bukan langsung mengganti publikasi. Pengguna menjalankan Update Published Invitation. Backend memvalidasi dan memublikasikan versi baru secara atomik. Jika gagal, versi publik sebelumnya tetap berjalan. Simpan version history dan dukung restore.

### Expired
Publik melihat halaman expired. Owner tetap dapat mengakses dashboard, draft, dan data. Pembayaran perpanjangan mengaktifkan kembali publikasi sesuai aturan masa aktif.

### Reseller
Reseller memiliki dashboard dan harga khusus. Sistem memisahkan creator, owner, payer, reseller, dan client. Reseller dapat menjadi payer/pengelola atau klien menjadi owner dan membayar langsung dengan atribusi reseller. Rilis awal mencatat order dan margin/rekap; tidak ada affiliate payout otomatis.

## 8. Functional Requirements
### Akun dan akses
Register, login, logout, reset password, profil, sesi, role/permission, status Premium, reseller, invitation collaboration, dan audit aktivitas penting.

### Marketplace
Landing page, kategori, pencarian, filter, sorting, detail template, preview, harga, add-on, status ketersediaan, serta tombol gunakan template.

### Template dan blank canvas
Template memiliki versi, schema, aset, font, konfigurasi responsif, daftar komponen, metadata lisensi, kategori, gaya, harga, dan status publikasi. Blank canvas dimulai dari dokumen kosong yang memakai komponen resmi editor.

### Visual editor
- Canvas berbasis section dan layer; drag/drop, resize, position, spacing, alignment, z-order, grouping, lock, hide/show, duplicate, delete, undo/redo.
- Panel properti untuk konten, typography, warna, background, border, radius, shadow, layout, responsive visibility, dan animasi yang aman.
- Add/remove/reorder/duplicate section.
- Copy/paste style, reusable components, asset library.
- Upload foto/video/audio; pilih font, ilustrasi, dekorasi, background, pattern, dan animasi dari library berlisensi/diizinkan.
- Autosave, draft revision, version history, preview device, publish/update.
- Batas safe area, ukuran, overflow, kontras, dan performa harus divalidasi.
- Tidak ada arbitrary JavaScript. Custom HTML/CSS hanya melalui subset yang disanitasi dan sandboxed.
- Fitur import tidak boleh mengklaim seluruh file eksternal menjadi layer editable. Hasil import dapat berupa asset/flattened preview atau layer hasil konversi parsial sesuai format.

### Import/integrasi desain
Target format dan aplikasi: Canva, Figma, PSD, AI, Affinity, PPTX, SVG, PDF, PNG, JPG. Dukungan aktual tergantung API resmi, izin, format, dan batas parser. Sediakan upload file yang didukung, import asset, serta status hasil import. Tidak boleh menjanjikan API/provider yang belum disetujui atau tidak tersedia.

### Invitation engine
Render halaman publik dari immutable published version. Mendukung opening, countdown, detail acara, Maps link/embed sesuai kebijakan, gallery, video, musik, RSVP, guestbook, gift information, personalized guest names, QR, attendance, multi-schedule, WhatsApp share, livestream, digital ticket, QR check-in, seating arrangement, dan multilingual. Tiap fitur dapat diaktifkan per invitation/add-on dan harus punya fallback mobile.

### Guest management
Manual add/edit/delete, CSV/XLSX import/export, personalized links, RSVP tracking, status hadir, QR code/ticket, check-in, duplicate detection, search/filter, privacy controls, dan export.

### RSVP/guestbook
RSVP fields configurable, response status, plus-one policy, deadline, guestbook moderation, spam/rate limits, owner moderation, and export.

### QR/check-in/ticket/seating
Unique token per guest/ticket; QR tidak boleh berisi PII mentah. Check-in idempotent, mencatat waktu/operator, mendeteksi duplikasi, dan mendukung manual fallback. Seating plan dapat mengatur meja/kapasitas dan penempatan tamu.

### Dashboard pelanggan
Daftar undangan, status draft/pending/active/expired, masa aktif, order, analytics, guest list, collaborator, domain/link, extension, version history, and settings.

### Kolaborasi
Owner mengundang collaborator. Role minimal: owner, editor. Regulary max 2 total; Premium limit configurable. Authorization dicek backend per invitation.

### Reseller
Application/approval, dashboard, wholesale price, create/manage client invitation, attribution, payer/owner separation, order history, and margin reporting. No automatic affiliate payout in initial release.

### Admin control center
User/role, template, category, style, add-on, pricing, subscription, order, payment, coupon, reseller, media, moderation, analytics, feature flags, localization, retention, security settings, audit logs, and system health. Admin actions harus permission-gated dan diaudit.

## 9. Pembayaran dan Order
- Buat order server-side dengan snapshot item, harga, diskon, pajak, payer, owner, reseller attribution, dan currency.
- Gunakan idempotency key.
- Buat transaksi gateway dari backend; jangan expose server key ke browser.
- Verifikasi signature webhook dan/atau status ke API gateway.
- Webhook dapat datang berulang/tidak berurutan; proses idempotent.
- Hanya status paid/settlement/captured yang tervalidasi mengaktifkan invitation entitlement sesuai mapping gateway.
- Pending/failed/expired/cancelled tidak boleh publish.
- Simpan payment attempt, gateway reference, status history, dan audit.
- Refund/dispute harus punya state dan dampak entitlement yang jelas; admin-only jika belum otomatis.

## 10. Data dan Privasi
Data utama: users, profiles, invitations, invitation_versions, templates, template_versions, assets, orders, order_items, payment_attempts, subscriptions, entitlements, collaborators, guests, rsvps, guestbook_entries, tickets, checkins, reseller_profiles, consent_records, coupons, add_ons, categories, locales, audit_logs, analytics_events.

Minimalkan data pribadi. Guest list tidak boleh terbuka publik. QR memakai token acak. Media menggunakan private storage dan signed URL bila privat. Tetapkan retention, deletion, backup, dan export policy.

## 11. Non-Functional Requirements
- Responsive pada mobile/tablet/desktop; editor mobile usable tanpa horizontal overflow.
- Autosave tahan jaringan putus dan konflik versi.
- Publish atomik dan rollback ke published version terakhir.
- Authorization server-side; RLS sebagai lapisan tambahan.
- Validasi upload MIME/signature/size, malware scanning bila tersedia, rate limit.
- Secrets hanya server-side.
- Monitoring error, latency, payment webhook, storage, render, dan queue.
- Backup dan restore diuji.
- Accessibility: keyboard navigation, semantic controls, contrast, labels.
- SEO/metadata untuk halaman publik tanpa mengekspos data privat.
- Cost controls: quotas, file size, duration, storage lifecycle, feature flags.

## 12. Acceptance Criteria Global
1. Pengguna dapat membuat draft tanpa membayar, tetapi tidak dapat publish.
2. Total harga berasal dari backend dan cocok dengan checkout.
3. Webhook pembayaran valid mengaktifkan invitation selama 30 hari tepat satu kali.
4. Webhook duplikat tidak menggandakan entitlement.
5. Expired URL tidak menampilkan undangan.
6. Edit draft tidak mengubah versi publik sampai publish update berhasil.
7. Publish gagal tidak merusak versi publik sebelumnya.
8. Akun reguler tidak dapat memiliki lebih dari dua editor aktif per invitation.
9. Premium limit mengikuti konfigurasi admin.
10. Guest data privat; QR tidak memuat PII mentah.
11. Consent desain opsional, eksplisit, dan tercatat.
12. Semua admin action sensitif diaudit.
13. Semua kontrol yang tampil bekerja atau dinyatakan disabled.
14. Tampilan dan alur utama dapat digunakan di Android mobile browser.

## 13. Prioritas Rilis
**P0 Foundation:** auth, dashboard, categories/templates, draft invitation, basic editor, preview, order/payment, 30-day publish/expiry, admin pricing/templates, basic guest/RSVP, responsive public renderer, audit/security baseline.

**P1 Core expansion:** full editor tools, collaboration, guest CSV, QR ticket/check-in, guestbook, gallery/video/audio, reseller, Premium subscription, analytics, localization, version restore.

**P2 Advanced:** advanced import pipelines, seating planner, livestream integrations, richer animation library, advanced reporting, additional gateways/currencies, marketplace submission workflow.

Prioritas adalah urutan engineering; fitur P1/P2 tetap bagian dari product vision dan tidak boleh diklaim tersedia sebelum implementasi lulus acceptance criteria.

## 14. Risiko
API eksternal berubah/tidak tersedia; biaya media/egress; desain import tidak sepenuhnya editable; penyalahgunaan upload; webhook gagal; editor berat pada ponsel; hak cipta aset; privacy guest; dan reseller fraud. Mitigasi: feature flags, provider abstraction, cost limits, sandboxing, signed URLs, idempotency, audit, moderation, dan fallback.

## 15. Keputusan Terkunci
Janji Kita; pasar awal Indonesia; web mobile-first; bayar per undangan; tidak ada paket undangan gratis; draft gratis; publish setelah payment; aktif 30 hari sejak payment success; harga template + add-ons; full visual editor; template/blank/import; reguler maksimal 2 editor total; Premium bulanan dengan limit configurable; admin no-code; reseller dahulu; path URL `/i/{slug}`; Midtrans target gateway; bahasa Indonesia awal dan arsitektur multi-locale; biaya selain domain ditekan ke free tier sampai ada pendapatan; desain marketplace consent opsional; expired link nonaktif tetapi data tetap tersimpan.

## 16. Aturan Perubahan
Dokumen ini adalah baseline produk. Keputusan baru harus dicatat sebagai change request, menyebut alasan, dampak terhadap harga/data/UX/security/roadmap, lalu memperbarui PRD dan dokumen teknis terkait sebelum implementasi.
