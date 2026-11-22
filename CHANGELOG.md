# Catatan Perubahan

## Belum Dirilis

### Ditambahkan
- Fondasi aplikasi React, TypeScript, Vite, dan Tailwind.
- Konfigurasi Supabase lokal serta dasar keamanan basis data dengan akses ditolak secara default.
- Pencatatan kesalahan terstruktur tanpa pesan kesalahan mentah.
- Pemeriksaan format, lint, tipe, pengujian unit, build, dan CI basis data.
- Pemisahan project Supabase staging dan production.

### Diubah
- Deployment Vercel ditetapkan hanya untuk production dari cabang `main`.
- Deployment preview dinonaktifkan sesuai kebijakan proyek.
- README utama dan panduan pengembang ditulis dalam bahasa Indonesia.
- Klien Supabase menggunakan publishable key dan tetap mendukung anon key lama untuk kompatibilitas.

### Keamanan
- Membatasi pemanggilan langsung fungsi event-trigger otomatis RLS Supabase tanpa menonaktifkan perilaku event-trigger internal.
