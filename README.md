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

## Teknologi Baseline
- Frontend: React + TypeScript + Vite + Tailwind CSS.
- Backend/data: Supabase Auth + PostgreSQL + Storage + server-side Edge Functions/API.
- Hosting web: Vercel.
- Payment target: Midtrans.
Teknologi/provider dapat berubah melalui keputusan engineering yang dicatat. Free tier diprioritaskan; batas dan biaya wajib diverifikasi sebelum production.

## Prasyarat
- Node.js versi LTS yang didukung proyek.
- npm (atau package manager yang dikunci repository).
- Git.
- Akun Supabase untuk environment development/staging.
- Akun Vercel untuk preview/deployment.
- Midtrans sandbox hanya saat mengerjakan modul pembayaran.

## Instalasi
1. Clone repository.
2. Masuk ke folder proyek.
3. Install dependency sesuai lockfile.
4. Salin `.env.example` menjadi `.env.local`.
5. Isi variabel development yang diperlukan.
6. Jalankan migrasi database lokal/staging sesuai instruksi migration runner.
7. Jalankan development server.

Contoh perintah umum (sesuaikan scripts aktual di `package.json`):
```bash
git clone <repository-url>
cd janji-kita
npm ci
cp .env.example .env.local
npm run dev
```
Jangan membuat `.env.example` berisi credential asli. Jika repository memakai pnpm/yarn, ikuti lockfile dan README khusus package manager tersebut.

## Environment Variables
Nama variabel final harus disesuaikan dengan implementasi aktual. Pola yang disarankan:
```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
MIDTRANS_SERVER_KEY=
MIDTRANS_CLIENT_KEY=
MIDTRANS_IS_PRODUCTION=false
APP_BASE_URL=http://localhost:5173
```
`SUPABASE_SERVICE_ROLE_KEY` dan `MIDTRANS_SERVER_KEY` hanya boleh berada di environment server/secret store. Jangan pernah memakai prefix `VITE_` untuk secret. Jangan commit `.env*` selain `.env.example`.

## Database and Migrations
- Gunakan migration SQL berurutan dan tersimpan di Git.
- Terapkan ke development terlebih dahulu, lalu staging.
- Jalankan RLS tests dan seed idempotent.
- Production migration memerlukan backup, review, dan approval.
- Jangan mengedit schema production secara manual tanpa migration.

## Development Workflow
1. Baca PRD dan dokumen spesifikasi terkait.
2. Buat issue/task dengan acceptance criteria.
3. Implementasikan satu vertical slice.
4. Tambahkan unit/integration/RLS tests.
5. Jalankan lint, typecheck, tests, dan build.
6. Deploy preview.
7. Uji Android mobile dan desktop.
8. Update dokumentasi/changelog.
9. Merge melalui pull request setelah review.

## Testing
Scripts yang disarankan:
```bash
npm run lint
npm run typecheck
npm test
npm run build
```
Nama script harus mengikuti `package.json` aktual. Test minimum:
- Auth dan authorization.
- RLS cross-user isolation.
- Invitation draft/versioning.
- Renderer active/expired.
- Price calculation.
- Payment webhook signature/idempotency.
- Collaborator limits.
- Guest privacy, RSVP rate limits, QR duplicate check-in.
- Mobile responsive smoke tests.

## Deployment
### Vercel
1. Import repository ke Vercel.
2. Atur build command/output sesuai project.
3. Isi environment variables per environment.
4. Hubungkan preview deployment untuk branch/PR.
5. Production deploy hanya dari branch terlindungi setelah CI lulus.

### Supabase
- Pisahkan project development/staging/production.
- Aktifkan RLS untuk seluruh tabel yang terekspos.
- Simpan secrets di environment server.
- Konfigurasikan Storage policies dan lifecycle cleanup.
- Pastikan backup dan recovery tersedia.

### Payment
Gunakan Midtrans sandbox terlebih dahulu. Production payment hanya aktif setelah merchant approval, webhook HTTPS, signature verification, reconciliation, refund policy, dan end-to-end test lulus.

## Security Checklist
- [ ] Tidak ada secret di Git atau browser bundle.
- [ ] RLS aktif dan diuji.
- [ ] Semua privileged action server-side.
- [ ] Upload divalidasi berdasarkan MIME/signature dan ukuran.
- [ ] Rate limit auth, RSVP, guestbook, upload, checkout.
- [ ] Webhook signature diverifikasi dan idempotent.
- [ ] Audit log untuk admin, payment, consent, role, publish.
- [ ] Backup/restore diuji.
- [ ] Terms, privacy, consent, dan refund policy siap.

## Mobile-first QA
Uji pada Android browser dengan lebar 360px dan ukuran umum lain:
- Landing, marketplace, login.
- Dashboard dan form.
- Editor dengan touch controls.
- Checkout dan payment return.
- Public invitation, RSVP, guestbook.
- Guest manager dan check-in.
Pastikan tidak ada horizontal overflow, tombol tertutup, atau kontrol terlalu kecil.

## Cost Policy
Domain adalah biaya awal yang direncanakan. Layanan lain harus memakai free tier jika memadai. Pantau kuota database, storage, bandwidth/egress, function execution, build minutes, email, dan gateway fee. Paid API/provider tidak boleh diaktifkan tanpa persetujuan pemilik. Free tier tidak boleh diasumsikan cukup untuk skala produksi tanpa pengujian.

## Support and Operations
Sediakan runbook untuk webhook tertunda, payment mismatch, invitation expired, upload gagal, restore version, user report, dan suspected abuse. Catat insiden tanpa menyimpan data sensitif berlebihan.

## Source of Truth
PRD menetapkan keputusan produk. Dokumen teknis menjelaskan implementasi. Jika ada konflik:
1. Hentikan implementasi yang terdampak.
2. Buat change request.
3. Perbarui PRD terlebih dahulu jika keputusan produk berubah.
4. Sinkronkan semua dokumen terkait.
5. Baru lanjutkan coding.
