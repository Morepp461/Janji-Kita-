# Janji Kita

Platform SaaS untuk membuat, mengedit, menerbitkan, mengelola, dan membagikan undangan digital.

## Status proyek

**Fase 0: Fondasi Repository dan Infrastruktur**

Status penyelesaian fase dicatat pada bagian ini setelah seluruh kriteria penerimaan fase 0 terpenuhi, CI dan QA lulus, serta perubahan digabungkan ke cabang utama.

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
- Akun Vercel untuk deployment production

## Menjalankan aplikasi

```bash
nvm use
npm ci
cp .env.example .env.local
npm run dev
```

Isi `.env.local` dengan URL dan publishable key Supabase untuk lingkungan yang digunakan. Jangan pernah memasukkan service-role key atau kunci pembayaran server ke kode browser.

## Menjalankan Supabase lokal

```bash
supabase start
supabase status
supabase db reset
supabase test db
supabase stop
```

Migrasi berada di `supabase/migrations/`. Uji migrasi pada lingkungan lokal terlebih dahulu, lalu terapkan ke staging. Production harus menggunakan project Supabase terpisah dan hanya menerima migrasi yang sudah ditinjau serta disetujui.

## Pemeriksaan kualitas

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test:run
npm run build
npm run check
```

GitHub Actions menjalankan pemeriksaan aplikasi web dan basis data. Semua pemeriksaan wajib lulus sebelum perubahan digabungkan ke `main`.

## Kebijakan deployment: production saja

- Deployment preview dinonaktifkan sesuai konfigurasi proyek.
- Deployment production hanya dilakukan dari cabang `main`.
- Deployment production menunggu seluruh pemeriksaan CI berhasil.
- Gunakan GitHub Environment bernama `production` untuk proses rilis.
- Jangan aktifkan deployment preview tanpa perubahan keputusan proyek yang terdokumentasi.

Project Vercel menggunakan framework Vite, Node.js 22, perintah build `npm run build`, dan direktori hasil `dist`.

Rahasia GitHub Actions untuk deployment otomatis:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

Jika rahasia tersebut belum tersedia, langkah deployment otomatis akan dilewati. Jangan mengganti rahasia dengan kredensial yang ditulis langsung di repository.

## Lingkungan Supabase

Gunakan project yang berbeda untuk setiap lingkungan:

- Lokal: Supabase CLI dan Docker.
- Staging: project Supabase staging khusus.
- Production: project Supabase production khusus.

Jangan pernah mengarahkan staging ke basis data production. URL dan publishable key boleh digunakan oleh browser. Service-role key hanya boleh berada pada lingkungan server tepercaya.

## Keamanan

- Jangan commit kredensial asli, token, atau file lingkungan lokal.
- Jangan menaruh rahasia pada variabel berawalan `VITE_`.
- Aktifkan dan uji RLS sebelum tabel bisnis diekspos.
- Semua keputusan bisnis dengan hak istimewa harus dilakukan di sisi server.
- Validasi tipe, ukuran, dan isi berkas yang diunggah.
- Verifikasi tanda tangan webhook dan proses webhook secara idempoten.
- Catat aktivitas administratif dan transaksi penting tanpa menyimpan rahasia.
- Uji proses pencadangan dan pemulihan sebelum rilis produk.

## QA perangkat seluler

Periksa tampilan dan interaksi pada peramban Android dengan lebar layar minimum 360 piksel. Pastikan tidak ada luapan horizontal, tombol tertutup, atau kontrol yang sulit disentuh.

## Kebijakan biaya

Utamakan paket gratis selama kapasitas dan batasnya masih memadai. Pantau kuota basis data, penyimpanan, bandwidth, fungsi server, waktu build, email, dan biaya gateway. Layanan berbayar atau peningkatan paket memerlukan persetujuan pemilik proyek.

## Aturan perubahan

PRD adalah sumber kebenaran kebutuhan produk. Dokumen teknis menjelaskan cara implementasinya. Jika ada konflik, hentikan bagian yang terdampak, catat permintaan perubahan, perbarui dokumen terkait, lalu lanjutkan implementasi.
