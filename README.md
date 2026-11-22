# Janji Kita

Platform SaaS untuk membuat, mengedit, menerbitkan, mengelola, dan membagikan undangan digital.

## Status proyek

**Fase 0: selesai sepenuhnya.**

**Fase 1: selesai sepenuhnya pada lingkungan staging.**

**Checkpoint: 23 November 2026**

- Implementasi autentikasi: pendaftaran, masuk, pemulihan kata sandi, profil, preferensi bahasa/zona waktu, dan pengelolaan sesi.
- Model role/permission server-side, bootstrap super admin melalui service role, dan pengelolaan peran melalui RPC yang diaudit.
- Panel admin untuk CRUD kategori/gaya desain, feature flags, audit log, dan pengelolaan peran.
- Migrasi fase 1 diterapkan pada Supabase staging; 8 kategori dan 10 gaya desain awal tersedia.
- Seluruh tabel fase 1 memakai RLS. Security Advisor staging tidak menemukan temuan keamanan.
- Pengujian pgTAP mencakup isolasi profil/peran antar pengguna, hak akses, dan pembatasan fungsi RPC.
- Seluruh pemeriksaan CI lulus: format, lint, tipe, pengujian unit, build, migrasi lokal, lint basis data, dan pgTAP ([hasil CI #70](https://github.com/Morepp461/Janji-Kita-/actions/runs/45050010670)).
- Implementasi tersedia pada [PR #10](https://github.com/Morepp461/Janji-Kita-/pull/10).

**Batas penerapan:** Fase 1 dinyatakan selesai pada staging. Supabase production belum menerima migrasi fase 1. PR belum digabung ke `main` karena Vercel hanya menerapkan perubahan dari `main`; penggabungan sebelum migrasi production siap akan merilis aplikasi yang membutuhkan skema basis data yang belum tersedia. Migrasi production memerlukan pencadangan, peninjauan, dan persetujuan rilis. Penerapan preview Vercel tetap nonaktif.

**Checkpoint: 22 November 2026**

- PR fondasi #1 telah digabungkan ke `main`: [lihat perubahan](https://github.com/Morepp461/Janji-Kita-/pull/1).
- Pemeriksaan CI sebelum penggabungan berhasil: [format, lint, tipe, pengujian unit, build, migrasi, dan RLS](https://github.com/Morepp461/Janji-Kita-/actions/runs/45046403758).
- Penerapan production Vercel untuk commit `83c6891` berstatus **READY**.
- Project Supabase staging dan production terpisah; riwayat migrasi keduanya selaras dengan berkas migrasi repository.
- Pemeriksaan Security Advisor pada kedua project Supabase tidak menemukan masalah.
- Penerapan preview dinonaktifkan. Penerapan aplikasi hanya melalui cabang `main`.

Alamat aplikasi production: [janji-kita-nine.vercel.app](https://janji-kita-nine.vercel.app).

**Catatan tata kelola:** status perlindungan cabang `main` belum dapat diverifikasi melalui integrasi GitHub yang tersedia. Pastikan aturan cabang mewajibkan pemeriksaan `Pemeriksaan kualitas web` dan `Pengujian migrasi dan RLS Supabase` sebelum perubahan berikutnya digabungkan.

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
- Akun Supabase dengan project staging dan production terpisah
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

Migrasi berada di `supabase/migrations/`. PostgreSQL lokal menggunakan versi utama 17 agar sesuai dengan project staging dan production. Uji migrasi pada lingkungan lokal terlebih dahulu, lalu terapkan ke staging. Production harus menggunakan project Supabase terpisah dan hanya menerima migrasi yang sudah ditinjau serta disetujui.

## Pemeriksaan kualitas

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test:run
npm run build
npm run check
```

GitHub Actions menjalankan pemeriksaan aplikasi web dan basis data. Wajibkan pemeriksaan `Pemeriksaan kualitas web` serta `Pengujian migrasi dan RLS Supabase` pada aturan perlindungan cabang `main` agar perubahan tidak dapat digabungkan sebelum keduanya lulus.

## Kebijakan penerapan: production saja

- Penerapan preview dinonaktifkan sesuai konfigurasi proyek.
- Penerapan production hanya berasal dari cabang `main`.
- Pemeriksaan CI berjalan pada pull request dan push ke `main`.
- Integrasi Git Vercel menerapkan commit dari `main` ke lingkungan production.
- Jangan aktifkan penerapan preview tanpa perubahan keputusan proyek yang terdokumentasi.

Proyek Vercel menggunakan kerangka kerja Vite, Node.js 22, perintah kompilasi `npm run build`, dan direktori hasil `dist`.

Variabel lingkungan production Vercel yang telah disiapkan:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_APP_BASE_URL`

Kunci publishable boleh digunakan browser. Jangan menaruh kunci server atau rahasia pembayaran pada variabel berawalan `VITE_`.

## Lingkungan Supabase

Gunakan project yang berbeda untuk setiap lingkungan:

- Lokal: Supabase CLI dan Docker.
- Staging: project Supabase staging khusus.
- Production: project Supabase production khusus.

Jangan pernah mengarahkan staging ke basis data production. URL dan kunci publishable boleh digunakan oleh browser. Kunci service-role hanya boleh berada pada lingkungan server tepercaya.

## Keamanan

- Jangan commit kredensial asli, token, atau file lingkungan lokal.
- Jangan menaruh rahasia pada variabel berawalan `VITE_`.
- Aktifkan dan uji RLS sebelum tabel bisnis diekspos.
- Semua keputusan bisnis dengan hak istimewa harus dilakukan di sisi server.
- Validasi tipe, ukuran, dan isi berkas yang diunggah.
- Verifikasi tanda tangan webhook dan proses webhook secara idempoten.
- Catat aktivitas administratif dan transaksi penting tanpa menyimpan rahasia.
- Uji proses pencadangan dan pemulihan sebelum rilis produk.

## Pengujian perangkat seluler

Periksa tampilan dan interaksi pada peramban Android dengan lebar layar minimum 360 piksel. Pastikan tidak ada luapan horizontal, tombol tertutup, atau kontrol yang sulit disentuh.

## Kebijakan biaya

Utamakan paket gratis selama kapasitas dan batasnya masih memadai. Pantau kuota basis data, penyimpanan, bandwidth, fungsi server, waktu kompilasi, email, dan biaya gateway. Layanan berbayar atau peningkatan paket memerlukan persetujuan pemilik proyek.

## Aturan perubahan

PRD adalah sumber kebenaran kebutuhan produk. Dokumen teknis menjelaskan cara implementasinya. Jika ada konflik, hentikan bagian yang terdampak, catat permintaan perubahan, perbarui dokumen terkait, lalu lanjutkan implementasi.
