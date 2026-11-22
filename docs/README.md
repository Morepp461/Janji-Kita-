# Janji Kita

Platform SaaS untuk membuat dan mengelola undangan digital. Dokumen ini menjadi panduan bagi pengembang dan operator repository.

## Status proyek

- Versi dokumentasi dasar: 1.0.
- **Fase 0: selesai sepenuhnya.**
- **Fase 1: selesai sepenuhnya pada Supabase staging.**
- Checkpoint fase 1: [PR #10](https://github.com/Morepp461/Janji-Kita-/pull/10).
- Seluruh CI fase 1 lulus: [hasil CI #70](https://github.com/Morepp461/Janji-Kita-/actions/runs/45050010670) mencakup pemeriksaan web, migrasi, lint basis data, dan pgTAP.
- Fase 1 mencakup autentikasi, profil, role/permission, panel admin, kategori/gaya, feature flags, audit log, dan RLS.
- Security Advisor staging setelah migrasi fase 1: tidak ada temuan keamanan.
- Production belum dimigrasikan; ikuti release gate, backup/review, dan persetujuan pemilik sebelum rollout.
- Checkpoint penggabungan: `83c6891ba446b3ad341e4cf20c49190d063ebd22`.
- Pemeriksaan CI sebelum penggabungan lulus: [lihat hasil CI](https://github.com/Morepp461/Janji-Kita-/actions/runs/45046403758).
- Penerapan production Vercel dari cabang `main` berstatus **READY**.
- Penerapan preview dinonaktifkan; hanya production yang digunakan.

Catatan tata kelola: status perlindungan cabang `main` belum dapat diverifikasi melalui integrasi GitHub yang tersedia. Pastikan kedua pemeriksaan CI diwajibkan sebelum penggabungan berikutnya.

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

Penyedia teknologi harus tetap dapat diganti. Paket gratis diprioritaskan, tetapi batas kapasitas dan biaya harus diperiksa sebelum penerapan production.

## Persyaratan pengembangan

- Node.js 22.12.x.
- npm 10 atau lebih baru.
- Git.
- Docker Desktop/Engine untuk Supabase lokal.
- Supabase CLI.
- Project Supabase staging dan production yang terpisah.
- Project Vercel untuk penerapan production.

## Instalasi aplikasi

```bash
git clone <alamat-repository>
cd Janji-Kita-
nvm use
npm ci
cp .env.example .env.local
npm run dev
```

Isi `.env.local` dengan URL dan kunci publishable Supabase untuk lingkungan yang digunakan. Jangan masukkan kredensial server ke variabel yang dikirim ke browser.

## Variabel lingkungan

Kredensial browser:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_APP_BASE_URL=http://localhost:5173
```

`VITE_SUPABASE_ANON_KEY` masih didukung untuk kompatibilitas, tetapi penggunaan kunci publishable diutamakan.

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

File migrasi SQL disimpan berurutan di `supabase/migrations/`. PostgreSQL lokal menggunakan versi utama 17 agar sesuai dengan project staging dan production. Buat dan uji migrasi pada lingkungan lokal terlebih dahulu, kemudian terapkan ke staging. Migrasi production memerlukan peninjauan, rencana pencadangan, dan persetujuan. Pengujian RLS wajib lulus di CI.

CI memakai Supabase CLI 3.0.0 yang dipatok agar hasil pemeriksaan konsisten. Pada CLI v3, perintah basis data berjalan ke lingkungan lokal secara default. Operasi ke project terkelola harus menyebut target remote secara eksplisit dan menyertakan persetujuan noninteraktif yang sesuai. Jangan menjalankan operasi remote sebelum memeriksa project tujuan.

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

## Penerapan production saja

Workflow `.github/workflows/ci.yml` menjalankan:

- Pemeriksaan kualitas web pada pull request dan push ke `main`.
- Pengujian migrasi dan RLS menggunakan Supabase lokal pada pull request dan push ke `main`.

Integrasi Git Vercel menerapkan perubahan dari cabang `main` ke production. Penerapan preview dinonaktifkan dan harus tetap nonaktif.

Variabel lingkungan production yang telah disiapkan pada Vercel:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_APP_BASE_URL`

Lindungi cabang `main` dan wajibkan pemeriksaan `Pemeriksaan kualitas web` serta `Pengujian migrasi dan RLS Supabase` berhasil sebelum penggabungan. Status aturan perlindungan cabang harus diverifikasi pada pengaturan repository GitHub.

## Lingkungan Supabase

Gunakan project terpisah untuk staging dan production. Jangan arahkan staging ke basis data production. Simpan URL dan kunci publishable sebagai variabel lingkungan yang sesuai. Kredensial server hanya boleh disimpan sebagai rahasia runtime tepercaya.

Aktifkan pencadangan/pemulihan dan verifikasi kebijakan Storage sebelum production.

## Pembayaran

Gunakan lingkungan uji Midtrans saat mengembangkan modul pembayaran. Pembayaran sungguhan hanya boleh diaktifkan setelah persetujuan merchant, endpoint webhook HTTPS, verifikasi tanda tangan, rekonsiliasi, kebijakan pengembalian dana, dan pengujian menyeluruh lulus.

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

## Pengujian yang mengutamakan perangkat seluler

Uji peramban Android dengan lebar minimum 360 piksel:

- Halaman awal, marketplace, dan login.
- Dashboard dan formulir.
- Editor dengan kontrol sentuh.
- Checkout dan pengembalian dari pembayaran.
- Undangan publik, RSVP, dan buku tamu.
- Pengelola tamu dan check-in.

Pastikan tidak ada luapan horizontal, tombol tertutup, atau kontrol terlalu kecil.

## Kebijakan biaya

Domain merupakan biaya awal yang direncanakan. Layanan lain harus menggunakan paket gratis jika memadai. Pantau kuota basis data, penyimpanan, bandwidth/egress, eksekusi fungsi, waktu kompilasi, email, dan biaya gateway. Penyedia berbayar tidak boleh diaktifkan tanpa persetujuan pemilik.

## Sumber kebenaran

PRD menetapkan keputusan produk. Dokumen teknis menjelaskan implementasi. Jika terjadi konflik, hentikan implementasi yang terdampak, buat permintaan perubahan, perbarui PRD terlebih dahulu jika keputusan produk berubah, selaraskan dokumen terkait, lalu lanjutkan pengembangan.


## Bootstrap super admin pertama

Project staging masih memerlukan akun pemilik sebelum panel admin dapat digunakan. Setelah akun pemilik berhasil mendaftar:

1. Ambil UUID akun dari Supabase Authentication > Users pada project yang sesuai.
2. Jalankan perintah berikut melalui akses SQL tepercaya/service role, bukan dari browser:

```sql
select public.bootstrap_first_super_admin('<UUID_AKUN_PEMILIK>');
```

3. Fungsi hanya berhasil jika belum ada super admin dan profil pengguna sudah tersedia.
4. Setelah bootstrap, kelola role berikutnya dari panel admin. Pengguna tidak dapat mengubah role sendiri.

Jangan menjalankan bootstrap ini pada production sebelum migrasi production disetujui dan diterapkan.
