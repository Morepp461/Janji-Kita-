export type DashboardMessage =
  | "workspace"
  | "profile"
  | "profile_description"
  | "display_name"
  | "phone"
  | "dashboard_language"
  | "timezone"
  | "save_profile"
  | "saving"
  | "account_session"
  | "account_status"
  | "role"
  | "session_active"
  | "session_description"
  | "premium"
  | "collaborations"
  | "reseller"
  | "manage_premium"
  | "manage_reseller"
  | "consent_settings"
  | "logout";

const messages: Record<"id" | "en", Record<DashboardMessage, string>> = {
  id: {
    workspace: "Ruang kerja",
    profile: "Profil akun",
    profile_description: "Informasi dasar akun dan preferensi tampilan.",
    display_name: "Nama tampilan",
    phone: "Nomor telepon",
    dashboard_language: "Bahasa dashboard",
    timezone: "Zona waktu",
    save_profile: "Simpan profil",
    saving: "Menyimpan...",
    account_session: "Akun & sesi",
    account_status: "Status",
    role: "Peran",
    session_active: "Aktif pada perangkat ini",
    session_description: "Sesi dikelola oleh Supabase Auth. Tombol keluar mengakhiri sesi saat ini.",
    premium: "Premium",
    collaborations: "Undangan kolaborasi",
    reseller: "Program reseller",
    manage_premium: "Kelola Premium",
    manage_reseller: "Kelola reseller",
    consent_settings: "Persetujuan marketplace",
    logout: "Keluar",
  },
  en: {
    workspace: "Workspace",
    profile: "Account profile",
    profile_description: "Basic account information and display preferences.",
    display_name: "Display name",
    phone: "Phone number",
    dashboard_language: "Dashboard language",
    timezone: "Time zone",
    save_profile: "Save profile",
    saving: "Saving...",
    account_session: "Account & session",
    account_status: "Status",
    role: "Role",
    session_active: "Active on this device",
    session_description: "Your session is managed by Supabase Auth. Sign out ends this session.",
    premium: "Premium",
    collaborations: "Collaboration invitations",
    reseller: "Reseller program",
    manage_premium: "Manage Premium",
    manage_reseller: "Manage resellers",
    consent_settings: "Marketplace consent",
    logout: "Sign out",
  },
};

export function dashboardText(locale: string, key: DashboardMessage): string {
  const language = locale.toLowerCase().startsWith("en") ? "en" : "id";
  return messages[language][key];
}
