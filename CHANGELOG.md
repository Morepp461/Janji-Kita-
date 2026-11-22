# Catatan Perubahan

## 2026-11-22 — Fase 0 selesai sepenuhnya

### Ditambahkan
- Fondasi aplikasi React, TypeScript, Vite, dan Tailwind.
- Konfigurasi Supabase lokal serta dasar keamanan basis data dengan akses ditolak secara default.
- Pencatatan kesalahan terstruktur tanpa pesan kesalahan mentah.
- Pemeriksaan format, lint, tipe, pengujian unit, build, dan CI basis data.
- Pemisahan project Supabase staging dan production.
- Pengujian bootstrap klien Supabase untuk publishable key dan anon key lama.

### Diubah
- Penerapan Vercel ditetapkan hanya untuk production dari cabang `main`.
- Penerapan preview dinonaktifkan sesuai kebijakan proyek.
- README utama dan panduan pengembang ditulis dalam bahasa Indonesia.
- Klien Supabase menggunakan publishable key dan tetap mendukung anon key lama untuk kompatibilitas.
- PostgreSQL lokal diselaraskan ke versi utama 17.
- Riwayat migrasi staging dan production diselaraskan dengan versi migrasi repository.

### Keamanan
- Membatasi pemanggilan langsung fungsi event-trigger otomatis RLS Supabase tanpa menonaktifkan perilaku event-trigger internal.
- Pemeriksaan Security Advisor staging dan production tidak menemukan masalah.

### Validasi
- Pemeriksaan CI web dan basis data lulus sebelum penggabungan.
- Penerapan production Vercel untuk commit `83c6891` berstatus READY.
