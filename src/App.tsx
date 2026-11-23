import { useEffect, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import AdminDashboard from "./features/admin/AdminDashboard";
import PhaseSevenDashboard from "./features/admin/PhaseSevenDashboard";
import ConsentSettings from "./features/consent/ConsentSettings";
import { dashboardText } from "./shared/i18n";
import CommerceAdmin from "./features/admin/CommerceAdmin";
import FinanceDashboard from "./features/admin/FinanceDashboard";
import AuthPage from "./features/auth/AuthPage";
import Marketplace from "./features/marketplace/Marketplace";
import PublicInvitation from "./features/invitations/PublicInvitation";
import CheckoutPage from "./features/commerce/CheckoutPage";
import OrdersPage from "./features/commerce/OrdersPage";
import InvitationEditor from "./features/editor/InvitationEditor";
import GuestOperations from "./features/guests/GuestOperations";
import CollaborationPage from "./features/collaboration/CollaborationPage";
import PremiumPage from "./features/premium/PremiumPage";
import ResellerWorkspace from "./features/reseller/ResellerWorkspace";
import { getSupabaseClient } from "./lib/supabase";

type Profile = {
  id: string;
  display_name: string;
  phone: string | null;
  preferred_locale: string;
  timezone: string;
  account_status: "active" | "suspended" | "closed";
};

export default function App() {
  const client = getSupabaseClient();
  const pathname = window.location.pathname;
  const [session, setSession] = useState<Session | null>(null);
  const currentUserId = session?.user?.id;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [phone, setPhone] = useState("");
  const [locale, setLocale] = useState("id-ID");
  const [timezone, setTimezone] = useState("Asia/Jakarta");
  const [localeOptions, setLocaleOptions] = useState<Array<{ code: string; native_name: string }>>([
    { code: "id-ID", native_name: "Bahasa Indonesia" },
    { code: "en", native_name: "English" },
  ]);
  const [timezoneOptions, setTimezoneOptions] = useState([
    "Asia/Jakarta",
    "Asia/Makassar",
    "Asia/Jayapura",
    "UTC",
  ]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!client) {
      setLoading(false);
      return;
    }
    let active = true;
    client.auth
      .getSession()
      .then(({ data }) => {
        if (active) setSession(data.session);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const { data } = client.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === "PASSWORD_RECOVERY") setRecoveryMode(true);
      if (event === "SIGNED_OUT") {
        setProfile(null);
        setRoles([]);
      }
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [client]);

  useEffect(() => {
    if (!client) return;
    let active = true;
    client.rpc("get_public_localization_config").then(({ data }) => {
      if (!active || !data || typeof data !== "object") return;
      const config = data as {
        locales?: Array<{ code: string; native_name: string }>;
        timezones?: string[];
      };
      if (Array.isArray(config.locales) && config.locales.length) setLocaleOptions(config.locales);
      if (Array.isArray(config.timezones) && config.timezones.length)
        setTimezoneOptions(config.timezones);
    });
    return () => {
      active = false;
    };
  }, [client]);

  useEffect(() => {
    if (!client || !session?.user) {
      setProfile(null);
      setRoles([]);
      return;
    }
    let active = true;
    const supabase = client;
    const userId = session.user.id;
    async function loadIdentity() {
      const [profileResult, rolesResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("id,display_name,phone,preferred_locale,timezone,account_status")
          .eq("id", userId)
          .maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId),
      ]);
      if (!active) return;
      if (profileResult.error) setError(profileResult.error.message);
      if (rolesResult.error) setError(rolesResult.error.message);
      const nextProfile = profileResult.data as Profile | null;
      setProfile(nextProfile);
      setProfileName(nextProfile?.display_name || "");
      setPhone(nextProfile?.phone || "");
      setLocale(nextProfile?.preferred_locale || "id-ID");
      setTimezone(nextProfile?.timezone || "Asia/Jakarta");
      setRoles((rolesResult.data || []).map((item: { role: string }) => item.role));
    }
    void loadIdentity();
    return () => {
      active = false;
    };
  }, [client, session]);

  useEffect(() => {
    if (!client || !currentUserId) return;
    const eventName = pathname.startsWith("/i/")
      ? "invitation_view"
      : pathname.startsWith("/admin")
      ? "admin_view"
      : pathname.startsWith("/editor/")
        ? "editor_view"
        : pathname.startsWith("/checkout/")
          ? "checkout_view"
          : pathname === "/templates" || pathname.startsWith("/templates/")
            ? "marketplace_view"
            : pathname === "/settings/consents"
              ? "consent_settings_view"
              : "dashboard_view";
    const analyticsRoute = pathname.startsWith("/editor/")
      ? "/editor/:id"
      : pathname.startsWith("/checkout/")
        ? "/checkout/:id"
        : pathname.startsWith("/i/")
          ? "/i/:slug"
          : pathname.startsWith("/admin")
            ? "/admin"
            : pathname.startsWith("/settings/consents")
              ? "/settings/consents"
              : pathname.startsWith("/templates")
                ? "/templates"
                : pathname === "/"
                  ? "/"
                  : "/other";
    void client.rpc("track_analytics_event", {
      p_event_name: eventName,
      p_invitation_id: null,
      p_properties: { route: analyticsRoute },
    });
  }, [client, currentUserId, pathname]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || !session?.user) return;
    setSaving(true);
    setError("");
    setNotice("");
    const { error: updateError } = await client
      .from("profiles")
      .update({
        display_name: profileName.trim(),
        phone: phone.trim() || null,
        preferred_locale: locale,
        timezone,
      })
      .eq("id", session.user.id);
    if (updateError) setError(updateError.message);
    else {
      setNotice("Profil berhasil diperbarui.");
      setProfile((current) =>
        current
          ? {
              ...current,
              display_name: profileName.trim(),
              phone: phone.trim() || null,
              preferred_locale: locale,
              timezone,
            }
          : current,
      );
    }
    setSaving(false);
  }

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get("new-password") || "");
    setSaving(true);
    setError("");
    setNotice("");
    const { error: updateError } = await client.auth.updateUser({ password });
    if (updateError) setError(updateError.message);
    else {
      setRecoveryMode(false);
      setNotice("Kata sandi berhasil diperbarui.");
    }
    setSaving(false);
  }

  if (!client) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#fffaf6] px-6 text-[#30251f]">
        <section className="max-w-lg rounded-3xl border border-[#eaded5] bg-white p-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#a36d55]">Janji Kita</p>
          <h1 className="mt-4 text-2xl font-semibold">Konfigurasi belum tersedia</h1>
          <p className="mt-2 text-sm leading-6 text-[#76675f]">
            Isi VITE_SUPABASE_URL dan VITE_SUPABASE_PUBLISHABLE_KEY pada environment aplikasi untuk
            mengaktifkan autentikasi.
          </p>
        </section>
      </main>
    );
  }

  if (pathname.startsWith("/i/")) {
    const slug = decodeURIComponent(pathname.slice(4).split("/")[0] || "");
    return <PublicInvitation client={client} slug={slug} />;
  }
  const templateSlug = pathname.startsWith("/templates/")
    ? pathname.slice("/templates/".length).split("/")[0] || undefined
    : undefined;
  if (!session && (pathname === "/templates" || templateSlug)) {
    return <Marketplace client={client} userId={null} initialTemplateSlug={templateSlug} />;
  }

  if (recoveryMode) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#fffaf6] px-4 py-10 text-[#30251f]">
        <form
          className="w-full max-w-md rounded-3xl border border-[#eaded5] bg-white p-7"
          onSubmit={updatePassword}
        >
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#a36d55]">Janji Kita</p>
          <h1 className="mt-4 text-2xl font-semibold">Atur kata sandi baru</h1>
          <label className="mt-6 block text-sm font-medium">
            Kata sandi baru
            <input
              autoComplete="new-password"
              className="mt-2 w-full rounded-xl border border-[#ddcec3] px-4 py-3"
              minLength={8}
              name="new-password"
              required
              type="password"
            />
          </label>
          {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
          <button
            className="mt-5 w-full rounded-xl bg-[#754b3b] px-4 py-3 font-semibold text-white disabled:opacity-60"
            disabled={saving}
            type="submit"
          >
            Simpan kata sandi
          </button>
        </form>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#fffaf6] text-sm text-[#76675f]">
        Memuat sesi...
      </main>
    );
  }

  if (!session) return <AuthPage client={client} />;

  if (profile?.account_status === "suspended" || profile?.account_status === "closed") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#fffaf6] px-5">
        <section className="max-w-md rounded-3xl border border-[#eaded5] bg-white p-8 text-center">
          <h1 className="text-2xl font-semibold">Akun tidak aktif</h1>
          <p className="mt-2 text-sm text-[#76675f]">
            Akses akun ini sedang dibatasi. Hubungi dukungan Janji Kita.
          </p>
          <button
            className="mt-5 rounded-xl border border-[#ddcec3] px-4 py-2 text-sm font-semibold"
            onClick={() => void client.auth.signOut()}
            type="button"
          >
            Keluar
          </button>
        </section>
      </main>
    );
  }

  const editorMatch = pathname.match(/^\/editor\/([0-9a-f-]+)\/?$/i);
  if (editorMatch) {
    return (
      <InvitationEditor client={client} invitationId={editorMatch[1]} userId={session.user.id} />
    );
  }

  const collaborationMatch = pathname.match(/^\/invitations\/([0-9a-f-]+)\/collaborators\/?$/i);
  if (collaborationMatch)
    return (
      <CollaborationPage
        client={client}
        invitationId={collaborationMatch[1]}
        userId={session.user.id}
        email={session.user.email || ""}
      />
    );
  if (pathname === "/collaborations")
    return (
      <CollaborationPage
        client={client}
        invitationId=""
        userId={session.user.id}
        email={session.user.email || ""}
      />
    );

  const guestMatch = pathname.match(/^\/invitations\/([0-9a-f-]+)\/guests\/?$/i);
  if (guestMatch) return <GuestOperations client={client} invitationId={guestMatch[1]} />;

  const isAdmin = roles.includes("admin") || roles.includes("super_admin");
  if (pathname === "/settings/consents") return <ConsentSettings client={client} />;
  if (pathname === "/admin/operations" && isAdmin) return <PhaseSevenDashboard client={client} />;
  const isFinance = roles.includes("finance");
  const isSuperAdmin = roles.includes("super_admin");
  const checkoutMatch = pathname.match(/^\/checkout\/([0-9a-f-]+)\/?$/i);
  if (checkoutMatch) {
    return (
      <CheckoutPage client={client} userId={session.user.id} invitationId={checkoutMatch[1]} />
    );
  }
  if (pathname === "/orders") return <OrdersPage client={client} />;
  if (pathname === "/premium")
    return <PremiumPage client={client} userId={session.user.id} isAdmin={isAdmin} />;
  if (pathname === "/admin/subscriptions" && isAdmin)
    return <PremiumPage client={client} userId={session.user.id} isAdmin />;
  if (pathname === "/reseller")
    return <ResellerWorkspace client={client} userId={session.user.id} isAdmin={false} />;
  if (pathname === "/admin/resellers" && isAdmin)
    return <ResellerWorkspace client={client} userId={session.user.id} isAdmin />;
  if (pathname === "/admin/commerce" && isAdmin) return <CommerceAdmin client={client} />;
  if (pathname === "/finance/orders" && (isAdmin || isFinance))
    return <FinanceDashboard client={client} />;
  if (pathname === "/templates" || templateSlug) {
    return (
      <Marketplace
        client={client}
        userId={session.user.id}
        isAdmin={isAdmin}
        initialTemplateSlug={templateSlug}
      />
    );
  }

  return (
    <main className="min-h-screen bg-[#fffaf6] px-4 py-6 text-[#30251f] sm:px-8 sm:py-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-col gap-4 border-b border-[#eaded5] pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#a36d55]">
              Janji Kita
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              {dashboardText(locale, "workspace")}
            </h1>
            <p className="mt-1 text-sm text-[#76675f]">{session.user.email}</p>
          </div>
          <button
            className="rounded-xl border border-[#ddcec3] px-4 py-2 text-sm font-semibold hover:bg-white"
            onClick={() => void client.auth.signOut()}
            type="button"
          >
            {dashboardText(locale, "logout")}
          </button>
        </header>

        {(notice || error) && (
          <p
            className={`rounded-xl px-4 py-3 text-sm ${error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-800"}`}
          >
            {error || notice}
          </p>
        )}

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-3xl border border-[#eaded5] bg-white p-5 sm:p-7">
            <h2 className="text-xl font-semibold">{dashboardText(locale, "profile")}</h2>
            <p className="mt-1 text-sm text-[#76675f]">
              {dashboardText(locale, "profile_description")}
            </p>
            <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={saveProfile}>
              <label className="text-sm font-medium sm:col-span-2">
                {dashboardText(locale, "display_name")}
                <input
                  className="mt-2 w-full rounded-xl border border-[#ddcec3] px-4 py-3"
                  maxLength={80}
                  onChange={(event) => setProfileName(event.target.value)}
                  required
                  value={profileName}
                />
              </label>
              <label className="text-sm font-medium">
                {dashboardText(locale, "phone")}
                <input
                  className="mt-2 w-full rounded-xl border border-[#ddcec3] px-4 py-3"
                  onChange={(event) => setPhone(event.target.value)}
                  value={phone}
                />
              </label>
              <label className="text-sm font-medium">
                {dashboardText(locale, "dashboard_language")}
                <select
                  className="mt-2 w-full rounded-xl border border-[#ddcec3] px-4 py-3"
                  onChange={(event) => setLocale(event.target.value)}
                  value={locale}
                >
                  {localeOptions.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.native_name}
                    </option>
                  ))}
                  {!localeOptions.some((item) => item.code === locale) && (
                    <option value={locale}>{locale}</option>
                  )}
                </select>
              </label>
              <label className="text-sm font-medium sm:col-span-2">
                {dashboardText(locale, "timezone")}
                <select
                  className="mt-2 w-full rounded-xl border border-[#ddcec3] px-4 py-3"
                  onChange={(event) => setTimezone(event.target.value)}
                  value={timezone}
                >
                  {timezoneOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                  {!timezoneOptions.includes(timezone) && (
                    <option value={timezone}>{timezone}</option>
                  )}
                </select>
              </label>
              <div className="sm:col-span-2">
                <button
                  className="rounded-xl bg-[#754b3b] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
                  disabled={saving}
                  type="submit"
                >
                  {saving ? dashboardText(locale, "saving") : dashboardText(locale, "save_profile")}
                </button>
              </div>
            </form>
          </div>

          <aside className="rounded-3xl border border-[#eaded5] bg-white p-5 sm:p-7">
            <h2 className="text-xl font-semibold">{dashboardText(locale, "account_session")}</h2>
            <dl className="mt-5 space-y-4 text-sm">
              <div>
                <dt className="text-[#887970]">{dashboardText(locale, "account_status")}</dt>
                <dd className="mt-1 font-semibold">{profile?.account_status || "Memuat"}</dd>
              </div>
              <div>
                <dt className="text-[#887970]">{dashboardText(locale, "role")}</dt>
                <dd className="mt-1 font-semibold">{roles.join(", ") || "user"}</dd>
              </div>
              <div>
                <dt className="text-[#887970]">Sesi</dt>
                <dd className="mt-1 font-semibold">{dashboardText(locale, "session_active")}</dd>
              </div>
            </dl>
            <p className="mt-5 text-xs leading-5 text-[#887970]">
              {dashboardText(locale, "session_description")}
            </p>
          </aside>
        </section>

        <nav className="flex flex-wrap gap-2" aria-label="Fitur akun">
          <a
            href="/premium"
            className="rounded-xl border border-[#ddcec3] bg-white px-4 py-2 text-sm font-semibold"
          >
            {dashboardText(locale, "premium")}
          </a>
          <a
            href="/collaborations"
            className="rounded-xl border border-[#ddcec3] bg-white px-4 py-2 text-sm font-semibold"
          >
            {dashboardText(locale, "collaborations")}
          </a>
          <a
            href="/reseller"
            className="rounded-xl border border-[#ddcec3] bg-white px-4 py-2 text-sm font-semibold"
          >
            {dashboardText(locale, "reseller")}
          </a>
          {isAdmin && (
            <>
              <a
                href="/admin/subscriptions"
                className="rounded-xl border border-[#ddcec3] bg-white px-4 py-2 text-sm font-semibold"
              >
                {dashboardText(locale, "manage_premium")}
              </a>
              <a
                href="/admin/resellers"
                className="rounded-xl border border-[#ddcec3] bg-white px-4 py-2 text-sm font-semibold"
              >
                {dashboardText(locale, "manage_reseller")}
              </a>
              <a
                href="/admin/operations"
                className="rounded-xl border border-[#ddcec3] bg-white px-4 py-2 text-sm font-semibold"
              >
                Operasional & analitik
              </a>
            </>
          )}
        </nav>

        <nav className="flex flex-wrap gap-2" aria-label="Pengaturan privasi">
          <a
            href="/settings/consents"
            className="rounded-xl border border-[#ddcec3] bg-white px-4 py-2 text-sm font-semibold"
          >
            {dashboardText(locale, "consent_settings")}
          </a>
        </nav>

        <Marketplace client={client} userId={session.user.id} isAdmin={isAdmin} />

        {isAdmin && <AdminDashboard client={client} isSuperAdmin={isSuperAdmin} />}
      </div>
    </main>
  );
}
