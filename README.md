# Janji Kita

Platform SaaS untuk membuat, mengedit, menerbitkan, mengelola, dan membagikan undangan digital.

## Status proyek

| Fase | Status |
|---|---|
| Fase 0 — Fondasi proyek | **Selesai sepenuhnya** |
| Fase 1 — Identitas dan administrasi | **Selesai sepenuhnya di staging dan production** |
| Fase 2 — Marketplace dan inti undangan | **Selesai sepenuhnya di staging dan production** |
| Fase 3 — Editor visual | **Selesai sepenuhnya di staging dan production** |
| Fase 4 — Commerce dan publikasi | **Selesai sepenuhnya di staging dan production** |
| Fase 5 — Operasi tamu | **Selesai sepenuhnya di staging dan production** |
| Fase 6 — Kolaborasi, Premium, dan Reseller | **Selesai sepenuhnya di staging dan production** |

**Checkpoint dokumentasi:** 23 November 2026. Fase 6 telah diterapkan dan diverifikasi pada Supabase staging, Supabase production, serta Vercel production.

### Fase 1 — Identitas dan administrasi

- Autentikasi mencakup pendaftaran, masuk, pemulihan kata sandi, profil, preferensi bahasa/zona waktu, dan pengelolaan sesi.
- Role dan permission diperiksa di sisi server. Bootstrap super admin menggunakan service role dan perubahan peran melalui RPC yang diaudit.
- Panel admin menyediakan CRUD kategori/gaya desain, feature flags, audit log, dan pengelolaan peran.
- Migrasi diterapkan pada Supabase staging dan production. Masing-masing lingkungan memiliki 8 kategori dan 10 gaya desain awal.
- Seluruh 7 tabel Fase 1 memakai RLS. Pengujian pgTAP mencakup isolasi profil/peran, hak akses, dan pembatasan RPC.
- CI lulus: [run #45050908634](https://github.com/Morepp461/Janji-Kita-/actions/runs/45050908634). Implementasi digabung melalui [PR #10](https://github.com/Morepp461/Janji-Kita-/pull/10) pada commit `8aff277b1ebb88838b2c6c8c2745065428928e13`.
- Deployment Vercel production berstatus READY. Penerapan preview tetap nonaktif.

### Fase 2 — Marketplace dan inti undangan

- Marketplace mendukung pencarian, filter kategori/gaya, pengurutan, pemuatan bertahap, detail template, serta pratinjau desktop dan ponsel.
- Draft dapat dibuat dari template atau kanvas kosong, dibuka kembali, dan dipratinjau.
- Versi template dan versi undangan terbit bersifat immutable. Perubahan template tidak mengubah snapshot draft yang sudah dibuat.
- Rute publik hanya mengembalikan undangan aktif dengan versi terbit. Peran anon tidak dapat membaca kolom internal pemilik.
- Tiga migrasi diterapkan pada staging dan production. Lima tabel Fase 2 memakai RLS dan dua bucket Storage tersedia.
- Data pemilik tetap utuh: 1 akun Auth, 1 profil, dan 0 objek Storage.
- CI lulus dengan 40 pengujian pgTAP: [run #45059131777](https://github.com/Morepp461/Janji-Kita-/actions/runs/45059131777). [PR #12](https://github.com/Morepp461/Janji-Kita-/pull/12) digabung pada commit `be079cad82866c77da301aaacede000287f6db8b`.
- Deployment Vercel production: [janji-kita-morepp.vercel.app](https://janji-kita-morepp.vercel.app).

### Fase 3 — Editor visual

- Editor tersedia melalui rute `/editor/:id` untuk draft milik pengguna yang masuk.
- Registry menyediakan komponen tata letak, teks, media, acara, tamu, sosial, dan dekorasi.
- Panel properti mendukung konten, gaya, tata letak, dan visibilitas responsif desktop/ponsel.
- Operasi lapisan mencakup tambah, pilih, urutkan, duplikat, kunci/buka kunci, sembunyikan/tampilkan, hapus, serta undo/redo.
- Pratinjau memakai renderer undangan yang sama dengan halaman publik. Validasi memeriksa judul, struktur komponen, konten wajib, aset gambar, dan tautan HTTPS.
- Autosave memakai RPC dengan pemeriksaan versi untuk menolak konflik. Perubahan lokal disimpan untuk pemulihan saat offline atau refresh.
- Unggahan aset privat memvalidasi MIME/signature dan ukuran, membaca metadata media, mengoptimalkan gambar menjadi WebP, serta membatasi metadata aset ke folder pemilik.
- Dua migrasi diterapkan pada staging dan production. RLS aktif, akses simpan hanya untuk pengguna terautentikasi, dan smoke test production lulus.
- CI lulus: [run #45063740422](https://github.com/Morepp461/Janji-Kita-/actions/runs/45063740422).
- [PR #15](https://github.com/Morepp461/Janji-Kita-/pull/15) digabung pada commit `5a2a003436cce8a5fb31064985255f23148ab068`. Deployment Vercel production: [janji-kita-nine.vercel.app](https://janji-kita-nine.vercel.app).

### Fase 4 — Commerce dan publikasi

- Admin dapat mengatur harga template, harga kanvas kosong, add-on, serta kupon persentase/nominal dengan masa berlaku dan batas penggunaan.
- Checkout membuat snapshot harga di server. Perubahan harga tidak mengubah pesanan lama. Kupon dibatasi secara transaksional, termasuk batas penggunaan per akun.
- Adapter Midtrans sandbox membuat sesi pembayaran di server. Webhook memverifikasi tanda tangan dan status transaksi langsung ke gateway sebelum mengubah status pesanan.
- Pemrosesan pembayaran idempoten, memeriksa nominal, menyimpan event webhook teredaksi, menangani settlement terlambat, dan mencatat refund.
- Pembayaran sukses membuat entitlement publikasi 30 hari. Perpanjangan menambah masa aktif; renderer menolak undangan kedaluwarsa. Refund penuh mencabut entitlement.
- Publikasi dan pembaruan membuat versi immutable lalu memindahkan pointer publik dalam satu transaksi.
- Dashboard finance bersifat baca-saja untuk peran finance/admin. Job `pg_cron` memperbarui status undangan dan entitlement kedaluwarsa setiap 15 menit.
- **15 migrasi** diterapkan pada staging dan production. Tiga Edge Functions aktif pada kedua project: `create-midtrans-payment`, `midtrans-webhook`, dan `reconcile-midtrans-pending`.
- **74 pengujian pgTAP Fase 4 lulus pada staging.** CI lulus seluruh pemeriksaan aplikasi dan basis data: [run #45090335232](https://github.com/Morepp461/Janji-Kita-/actions/runs/45090335232).
- Pembayaran sandbox dibatasi ke staging. Production menolak transaksi sampai gerbang merchant dan pembayaran nyata disetujui.

### Fase 5 — Operasi tamu

Ruang lingkup implementasi:

- CRUD tamu, pencarian, filter, serta deteksi duplikat email/nomor telepon.
- Impor CSV dengan laporan kesalahan per baris dan ekspor CSV daftar tamu maupun buku tamu.
- Tautan personal dengan token acak; basis data hanya menyimpan hash token.
- RSVP publik, kebijakan plus-one di sisi server, status undangan dibuka, dan pembatasan laju RSVP.
- Guestbook publik hanya menampilkan ucapan yang disetujui. Pemilik dapat memoderasi dan mengekspor ucapan.
- Tiket QR dibuat secara lokal. QR hanya berisi token acak, bukan data pribadi.
- Check-in QR melalui kamera, validasi tiket, penolakan tiket tidak valid/duplikat, dan check-in manual sebagai fallback.
- Dashboard kehadiran menampilkan total tamu, konfirmasi hadir, penolakan, RSVP tertunda, dan jumlah check-in.
- RLS membatasi data tamu, RSVP, tiket, check-in, serta moderasi buku tamu kepada pemilik undangan. Pengiriman publik dilakukan melalui RPC terkontrol.

**Fase 5 selesai sepenuhnya pada 23 November 2026.** Migrasi `phase_5_guest_operations` berhasil diterapkan pada Supabase staging dan production. Pemeriksaan kedua lingkungan mengonfirmasi enam tabel operasi tamu memiliki RLS aktif, peran anon tidak dapat membaca daftar tamu/tiket atau melakukan check-in, RPC publik yang diperlukan tersedia, dan seluruh tabel baru masih kosong sehingga data lama tidak tersentuh. CI lulus seluruh pemeriksaan web, build, migrasi lokal, database lint, serta 222 pengujian pgTAP: [CI cabang fitur](https://github.com/Morepp461/Janji-Kita-/actions/runs/45098327492) dan [CI cabang utama](https://github.com/Morepp461/Janji-Kita-/actions/runs/45098909054). Deployment Vercel production berstatus READY pada commit `951041f793357e182ac5902bcb24707a885d9653`: [janji-kita.vercel.app](https://janji-kita-jh7m58l5p-morepp.vercel.app).

### Fase 6 — Kolaborasi, Premium, dan Reseller

- Kolaborasi undangan mendukung peran editor dan pembaca, undangan melalui email, kotak masuk undangan, penerimaan/pencabutan akses, serta mode baca-saja untuk pembaca.
- Batas editor akun reguler ditegakkan secara transaksional. Paket Premium menyediakan batas kolaborator yang dapat dikonfigurasi admin, entitlement, sinkronisasi status langganan, dan masa tenggang pembayaran.
- Pengelolaan langganan memakai adapter provider yang idempoten. Paket premium_monthly tetap nonaktif dan belum memiliki harga/provider sampai konfigurasi merchant disetujui admin. Fitur Premium sudah tersedia secara teknis, tetapi penjualan langganan otomatis belum dibuka.
- Reseller mendukung pendaftaran, persetujuan admin, tingkat harga, kode referral, aturan harga wholesale, data klien, pengarsipan klien, serta pencatatan penjualan dan margin.
- Reseller dapat membuat dan mengelola undangan atas nama klien yang memiliki akun terverifikasi. Pemilik, pembuat, pembayar, dan reseller disimpan sebagai identitas terpisah.
- Checkout memakai harga wholesale ketika reseller menjadi pembayar. Pembayaran langsung oleh klien tetap memakai harga retail dan menyimpan atribusi referral. Laporan margin merupakan catatan penjualan, bukan klaim payout.
- RLS membatasi tabel kolaborasi, langganan, klien, aturan harga, dan penjualan. Peran anon tidak memiliki hak baca pada tabel privat fase ini. Autosave tetap berjalan sebagai SECURITY INVOKER.
- Tiga migrasi Fase 6 diterapkan pada Supabase staging dan production. RLS, fungsi inti, dan hak akses anonim diverifikasi pada kedua lingkungan.
- CI lulus seluruh pemeriksaan format, lint, TypeScript, unit test, build production, migrasi lokal, database lint, dan pengujian pgTAP: [run #45112026551](https://github.com/Morepp461/Janji-Kita-/actions/runs/45112026551).
- [PR #19](https://github.com/Morepp461/Janji-Kita-/pull/19) digabung ke main pada commit `32c8b69e82bd6e9b55c1542071a8ff899bbdd123`.
- Deployment Vercel production berstatus READY pada commit yang sama: [janji-kita-morepp.vercel.app](https://janji-kita-morepp.vercel.app).

**Fase 6 selesai sepenuhnya pada 23 November 2026.** Implementasi, QA, CI, migrasi staging/production, pengujian akses, dan deployment production telah selesai. Konfigurasi harga dan provider Premium sengaja tetap nonaktif sampai admin menyelesaikan persetujuan komersial.

## Keputusan dan catatan operasional

- **Pengecualian backup/restore — disetujui pemilik proyek pada 23 November 2026:** backup production dilewati pada seluruh fase karena paket Supabase Free dan akses integrasi yang tersedia tidak menyediakan jalur backup manual. Pemilik menerima risiko kehilangan data. Migrasi harus ditinjau sebagai migrasi aditif dan pemulihan mengandalkan corrective/forward migration. Restore tidak diklaim telah diuji.
- Security Advisor production tetap mencatat peringatan `Leaked Password Protection Disabled` yang sudah ada sebelum Fase 5. Fase 5 menambah RPC `SECURITY DEFINER` yang memang diperlukan untuk RSVP, guestbook, status tautan, dan check-in; seluruhnya memakai `search_path` tetap serta pemeriksaan token/pemilik. Tabel `guest_public_rate_limits` sengaja tidak memiliki kebijakan akses dan tidak diberi hak akses kepada peran klien. Peringatan linter terkait pola ini bersifat informatif/terencana.
- Gerbang pembayaran nyata belum dibuka. Transaksi sandbox end-to-end melalui akun merchant masih memerlukan verifikasi kredensial `MIDTRANS_SERVER_KEY`, callback/webhook, rekonsiliasi, dan persetujuan merchant. Rahasia hanya boleh disimpan pada Supabase Function Secrets, bukan di browser atau variabel `VITE_`.
- Penerapan preview Vercel tetap nonaktif. Deployment aplikasi mengikuti cabang `main`.

## Dokumentasi

Dokumen sumber utama dan spesifikasi implementasi tersedia di folder [docs/](./docs/):

- [Dokumen Kebutuhan Produk](./docs/PRD.md)
- [Arsitektur Sistem](./docs/SYSTEM_ARCHITECTURE.md)
- [Skema Basis Data](./docs/DATABASE_SCHEMA.md)
- [Spesifikasi UI/UX](./docs/UI_UX_SPECIFICATION.md)
- [Spesifikasi Editor](./docs/EDITOR_SPECIFICATION.md)
- [Spesifikasi Monetisasi](./docs/MONETIZATION_SPECIFICATION.md)
- [Peta Jalan Pengembangan](./docs/DEVELOPMENT_ROADMAP.md)
- [Panduan Pengembang](./docs/README.md)

## Persyaratan

- Node.js 22.12.x
- npm 10 atau lebih baru
- Git
- Docker Desktop/Engine untuk Supabase lokal
- Supabase CLI
- Project Supabase staging dan production yang terpisah
- Akun Vercel untuk penerapan production

## Menjalankan aplikasi

```bash
nvm use
npm ci
cp .env.example .env.local
npm run dev
```

Isi `.env.local` dengan URL dan kunci publishable Supabase untuk lingkungan yang digunakan. Jangan pernah memasukkan kunci service-role atau kunci pembayaran server ke kode browser.

## Menjalankan Supabase lokal

```bash
supabase start
supabase status
supabase db reset
supabase test db
supabase stop
```

Migrasi berada di `supabase/migrations/`. PostgreSQL lokal menggunakan versi utama 17 agar sesuai dengan staging dan production. Uji migrasi pada lingkungan lokal terlebih dahulu, lalu terapkan ke staging. Production hanya menerima migrasi yang sudah ditinjau dan disetujui. Pengecualian backup/restore berlaku untuk seluruh fase selama keterbatasan paket/akses masih berlaku; risiko kehilangan data diterima dan restore tidak diklaim telah diuji.

## Pemeriksaan kualitas

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test:run
npm run build
npm run check
```

GitHub Actions menjalankan pemeriksaan aplikasi web dan basis data. Aturan perlindungan cabang `main` harus mewajibkan pemeriksaan `Pemeriksaan kualitas web` dan `Pengujian migrasi dan RLS Supabase` sebelum perubahan digabungkan.

## Kebijakan penerapan

- Penerapan preview dinonaktifkan.
- Penerapan production hanya berasal dari cabang `main`.
- Pemeriksaan CI berjalan pada pull request dan push ke `main`.
- Integrasi Git Vercel menerapkan commit dari `main` ke lingkungan production.
- Jangan aktifkan penerapan preview tanpa keputusan proyek yang terdokumentasi.
- Proyek Vercel menggunakan Vite, Node.js 22, perintah kompilasi `npm run build`, dan direktori hasil `dist`.

Variabel lingkungan Vercel production:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_APP_BASE_URL`

Kunci publishable boleh digunakan browser. Jangan menaruh kunci server atau rahasia pembayaran pada variabel berawalan `VITE_`.

## Lingkungan Supabase

Gunakan project yang berbeda untuk setiap lingkungan:

- Lokal: Supabase CLI dan Docker.
- Staging: project Supabase staging khusus.
- Production: project Supabase production khusus.

Jangan pernah mengarahkan staging ke basis data production. URL dan kunci publishable boleh digunakan browser. Kunci service-role hanya boleh berada pada lingkungan server tepercaya.

## Keamanan

- Jangan commit kredensial, token, atau file lingkungan lokal.
- Jangan menaruh rahasia pada variabel berawalan `VITE_`.
- Aktifkan dan uji RLS sebelum tabel bisnis diekspos.
- Semua keputusan bisnis dengan hak istimewa harus dilakukan di sisi server.
- Validasi tipe, ukuran, dan isi berkas yang diunggah.
- Verifikasi tanda tangan webhook dan proses webhook secara idempoten.
- Catat aktivitas administratif dan transaksi penting tanpa menyimpan rahasia.
- Uji pencadangan dan pemulihan sebelum rilis, kecuali ada pengecualian tertulis dari pemilik proyek.

## Pengujian perangkat seluler

Periksa tampilan dan interaksi pada peramban Android dengan lebar layar minimum 360 piksel. Pastikan tidak ada luapan horizontal, tombol tertutup, atau kontrol yang sulit disentuh.

## Kebijakan biaya

Utamakan paket gratis selama kapasitas dan batasnya masih memadai. Pantau kuota basis data, penyimpanan, bandwidth, fungsi server, waktu kompilasi, email, dan biaya gateway. Layanan berbayar atau peningkatan paket memerlukan persetujuan pemilik proyek.

## Aturan perubahan

PRD adalah sumber kebenaran kebutuhan produk. Dokumen teknis menjelaskan cara implementasinya. Jika ada konflik, hentikan bagian yang terdampak, catat permintaan perubahan, perbarui dokumen terkait, lalu lanjutkan implementasi.
