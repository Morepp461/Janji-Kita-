# Janji Kita

Platform SaaS untuk membuat dan mengelola undangan digital. Dokumen ini menjadi panduan bagi pengembang dan operator repository.

## Status proyek

- Versi dokumentasi dasar: 1.0.
- **Fase 0: selesai sepenuhnya** setelah seluruh kriteria penerimaan, pengujian, pemeriksaan rilis, dan penggabungan ke cabang utama terpenuhi.
- Kebijakan deployment: production saja. Deployment preview dinonaktifkan.

## Dokumen spesifikasi

- `PRD.md`
- `SYSTEM_ARCHITECTURE.md`
- `DATABASE_SCHEMA.md`
- `UI_UX_SPECIFICATION.md`
- `EDITOR_SPECIFICATION.md`
- `MONETIZATION_SPECIFICATION.md`
- `DEVELOPMENT_ROADMAP.md`

## Teknologi

- Aplikasi web: React, TypeScript, Vite, dan Tailwind CSS.
- Backend dan data: Supabase Auth, PostgreSQL, Storage, serta Edge Functions/API sisi server.
- Hosting: Vercel.
- Target gateway pembayaran: Midtrans.

Provider harus tetap dapat diganti. Paket gratis diprioritaskan, tetapi batas kapasitas dan biaya harus diperiksa sebelum production.

## Persyaratan pengembangan

- Node.js 22.12.x.
- npm 10 atau lebih baru.
- Git.
- Docker Desktop/Engine untuk Supabase lokal.
- Supabase CLI.
- Project Supabase staging dan production yang terpisah.
- Project Vercel untuk deployment production.

## Instalasi aplikasi

```bash
git clone <alamat-repository>
cd Janji-Kita-
nvm use
npm ci
cp .env.example .env.local
npm run dev
```

Isi `.env.local` dengan URL dan publishable key Supabase untuk lingkungan yang digunakan. Jangan masukkan kredensial server ke variabel yang dikirim ke browser.

## Variabel lingkungan

Kredensial browser:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_APP_BASE_URL=http://localhost:5173
```

`VITE_SUPABASE_ANON_KEY` masih didukung untuk kompatibilitas, tetapi penggunaan publishable key diutamakan.

Kredensial server hanya untuk runtime tepercaya:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
MIDTRANS_SERVER_KEY=
MIDTRANS_CLIENT_KEY=
MIDTRANS_IS_PRODUCTION=false
```

`SUPABASE_SERVICE_ROLE_KEY` dan `MIDTRANS_SERVER_KEY` tidak boleh berada di browser atau memakai awalan `VITE_`. Jangan commit file `.env*` selain `.env.example`.

## Supabase lokal

```bash
supabase start
supabase status
supabase db reset
supabase test db
supabase stop
```

File migrasi SQL disimpan berurutan di `supabase/migrations/`. PostgreSQL lokal menggunakan versi utama 17 agar sesuai dengan project staging dan production. Buat dan uji migrasi pada lingkungan lokal terlebih dahulu, kemudian terapkan ke staging. Migrasi production memerlukan peninjauan, rencana pencadangan, dan persetujuan. Pengujian RLS wajib lulus di CI.\n\nCI memakai Supabase CLI terbaru. Pada CLI v3, perintah basis data berjalan ke lingkungan lokal secara default. Operasi ke project terkelola harus menyebut target remote secara eksplisit dan menyertakan persetujuan noninteraktif yang sesuai. Jangan menjalankan operasi remote sebelum memeriksa project tujuan.

## Pemeriksaan kualitas

```bash
npm run format
npm run format:check
npm run lint
npm run typecheck
npm run test:run
npm run build
npm run check
```

CI menjalankan pemeriksaan kualitas aplikasi web dan basis data. Gunakan cabang kerja dan pull request. Jangan mendorong perubahan langsung ke `main`.

## Deployment production saja

Workflow `.github/workflows/ci.yml` menjalankan:

- Pemeriksaan kualitas web pada pull request dan push ke `main`.
- Pengujian migrasi dan RLS menggunakan Supabase lokal pada pull request dan push ke `main`.
- Deployment Vercel production hanya setelah push ke `main` dan seluruh pemeriksaan CI lulus.

Deployment preview tidak digunakan dan harus tetap dinonaktifkan pada pengaturan project Vercel.

Tambahkan GitHub Actions secrets berikut untuk mengaktifkan deployment otomatis:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

Deployment akan dilewati apabila salah satu rahasia belum tersedia. Lindungi cabang `main` dan wajibkan pemeriksaan `Pemeriksaan kualitas web` serta `Pengujian migrasi dan RLS Supabase` berhasil sebelum penggabungan. Status aturan perlindungan cabang harus diverifikasi di pengaturan GitHub repository.

## Lingkungan Supabase

Gunakan project terpisah untuk staging dan production. Jangan arahkan staging ke basis data production. Simpan URL dan publishable key sebagai variabel lingkungan yang sesuai. Kredensial server hanya boleh disimpan sebagai rahasia runtime tepercaya.

Aktifkan pencadangan/pemulihan dan verifikasi kebijakan Storage sebelum production.

## Pembayaran

Gunakan Midtrans sandbox saat mengembangkan modul pembayaran. Pembayaran sungguhan hanya boleh diaktifkan setelah persetujuan merchant, endpoint webhook HTTPS, verifikasi tanda tangan, rekonsiliasi, kebijakan pengembalian dana, dan pengujian menyeluruh lulus.

## Daftar periksa keamanan

- [ ] Tidak ada rahasia di Git atau bundel browser.
- [ ] RLS aktif dan diuji untuk setiap tabel yang dapat diakses pengguna.
- [ ] Semua operasi dengan hak istimewa dilakukan di sisi server.
- [ ] Unggahan divalidasi berdasarkan MIME/tanda tangan dan ukuran.
- [ ] Pembatasan laju diterapkan pada autentikasi, RSVP, buku tamu, unggahan, dan checkout.
- [ ] Tanda tangan webhook diverifikasi dan pemrosesannya idempoten.
- [ ] Aktivitas admin, pembayaran, persetujuan, perubahan peran, dan publikasi tercatat.
- [ ] Pencadangan dan pemulihan sudah diuji.
- [ ] Syarat layanan, privasi, persetujuan, dan kebijakan pengembalian dana siap.

## QA mobile-first

Uji peramban Android dengan lebar minimum 360 piksel:

- Halaman awal, marketplace, dan login.
- Dashboard dan formulir.
- Editor dengan kontrol sentuh.
- Checkout dan pengembalian dari pembayaran.
- Undangan publik, RSVP, dan buku tamu.
- Pengelola tamu dan check-in.

Pastikan tidak ada luapan horizontal, tombol tertutup, atau kontrol terlalu kecil.

## Kebijakan biaya

Domain merupakan biaya awal yang direncanakan. Layanan lain harus menggunakan paket gratis jika memadai. Pantau kuota basis data, penyimpanan, bandwidth/egress, eksekusi fungsi, waktu build, email, dan biaya gateway. Provider berbayar tidak boleh diaktifkan tanpa persetujuan pemilik.

## Sumber kebenaran

PRD menetapkan keputusan produk. Dokumen teknis menjelaskan implementasi. Jika terjadi konflik, hentikan implementasi yang terdampak, buat permintaan perubahan, perbarui PRD terlebih dahulu jika keputusan produk berubah, selaraskan dokumen terkait, lalu lanjutkan pengembangan.
