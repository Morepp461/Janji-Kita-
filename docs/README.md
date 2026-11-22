# Janji Kita

Platform SaaS untuk membuat dan mengelola undangan digital. Dokumen ini adalah panduan awal repository untuk developer dan operator.

## Status

Dokumentasi baseline final v1.0. Dokumen spesifikasi:
- `PRD.md`
- `SYSTEM_ARCHITECTURE.md`
- `DATABASE_SCHEMA.md`
- `UI_UX_SPECIFICATION.md`
- `EDITOR_SPECIFICATION.md`
- `MONETIZATION_SPECIFICATION.md`
- `DEVELOPMENT_ROADMAP.md`

## Teknologi

- Frontend: React + TypeScript + Vite + Tailwind CSS.
- Backend/data: Supabase Auth + PostgreSQL + Storage + server-side Edge Functions/API.
- Hosting web: Vercel.
- Payment target: Midtrans.

Provider harus tetap dapat diganti. Free tier diprioritaskan; batas dan biaya wajib diverifikasi sebelum production.

## Prasyarat

- Node.js 22 LTS dan npm 10 atau lebih baru.
- Git.
- Docker Desktop/Engine untuk Supabase lokal.
- Supabase CLI.
- Akun Supabase untuk environment staging dan production.
- Akun Vercel untuk preview/deployment.
- Midtrans sandbox hanya saat mengerjakan modul pembayaran.

## Instalasi aplikasi

```bash
git clone <repository-url>
cd janji-kita
nvm use
npm ci
cp .env.example .env.local
npm run dev
```

Isi `.env.local` dengan URL dan anon/publishable key Supabase lokal atau environment yang dituju. Jangan masukkan credential server ke variabel browser.

## Environment Variables

Variabel browser:
```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_APP_BASE_URL=http://localhost:5173
```

Variabel server hanya untuk runtime tepercaya:
```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
MIDTRANS_SERVER_KEY=
MIDTRANS_CLIENT_KEY=
MIDTRANS_IS_PRODUCTION=false
```

`SUPABASE_SERVICE_ROLE_KEY` dan `MIDTRANS_SERVER_KEY` tidak boleh berada di browser atau memakai prefix `VITE_`. Jangan commit file `.env*` selain `.env.example`.

## Supabase lokal

```bash
supabase start
supabase status
supabase db reset
supabase test db
supabase stop
```

Migration SQL disimpan berurutan di `supabase/migrations/`. Terapkan dan uji di local terlebih dahulu, lalu staging. Production migration memerlukan backup, review, dan approval. RLS tests wajib lulus di CI.

## Quality checks

```bash
npm run format
npm run format:check
npm run lint
npm run typecheck
npm run test:run
npm run build
npm run check
```

CI menjalankan quality gates web dan database. Gunakan branch dan pull request; jangan push langsung ke `main`.

## Deployment

### Vercel

Workflow `.github/workflows/ci.yml` menyiapkan:
- Preview deployment untuk pull request setelah web dan database checks lulus.
- Production deployment hanya untuk push ke `main` setelah seluruh CI lulus.
- Production deployment memakai GitHub Environment `production`.

Setelah project Vercel dibuat dan repository dihubungkan, tambahkan GitHub Actions secrets:
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

Workflow deployment akan dilewati selama secrets belum tersedia. Lindungi branch `main` dan wajibkan workflow CI sukses sebelum merge.

### Supabase

Buat project terpisah untuk staging dan production. Jangan arahkan staging ke database production. Setelah project tersedia, simpan URL dan anon key sebagai environment variables serta credential server sebagai secrets. Aktifkan backup/recovery dan verifikasi Storage policies sebelum production.

### Payment

Gunakan Midtrans sandbox terlebih dahulu. Production payment hanya aktif setelah merchant approval, webhook HTTPS, signature verification, reconciliation, refund policy, dan end-to-end test lulus.

## Security checklist

- [ ] Tidak ada secret di Git atau browser bundle.
- [ ] RLS aktif dan diuji untuk setiap tabel user-facing.
- [ ] Semua privileged action server-side.
- [ ] Upload divalidasi berdasarkan MIME/signature dan ukuran.
- [ ] Rate limit auth, RSVP, guestbook, upload, checkout.
- [ ] Webhook signature diverifikasi dan idempotent.
- [ ] Audit log untuk admin, payment, consent, role, publish.
- [ ] Backup/restore diuji.
- [ ] Terms, privacy, consent, dan refund policy siap.

## Mobile-first QA

Uji Android browser pada lebar minimum 360px:
- Landing, marketplace, login.
- Dashboard dan form.
- Editor dengan touch controls.
- Checkout dan payment return.
- Public invitation, RSVP, guestbook.
- Guest manager dan check-in.

Pastikan tidak ada horizontal overflow, tombol tertutup, atau kontrol terlalu kecil.

## Cost policy

Domain adalah biaya awal yang direncanakan. Layanan lain harus memakai free tier jika memadai. Pantau kuota database, storage, bandwidth/egress, function execution, build minutes, email, dan gateway fee. Paid API/provider tidak boleh diaktifkan tanpa persetujuan pemilik.

## Source of truth

PRD menetapkan keputusan produk. Dokumen teknis menjelaskan implementasi. Jika ada konflik, hentikan implementasi yang terdampak, buat change request, perbarui PRD terlebih dahulu bila keputusan produk berubah, sinkronkan dokumen terkait, lalu lanjutkan coding.
