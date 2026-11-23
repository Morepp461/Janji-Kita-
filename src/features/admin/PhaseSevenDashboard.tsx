import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

type TemplateRow = {
  id: string;
  slug: string;
  title: string;
  status: "draft" | "published" | "archived";
  current_version_id: string | null;
  source_invitation_id: string | null;
  source_consent_id: string | null;
  moderation_note: string | null;
  moderated_at: string | null;
};
type ConsentRow = {
  id: string;
  user_id: string;
  invitation_id: string;
  order_id: string | null;
  granted: boolean;
  granted_at: string | null;
  withdrawn_at: string | null;
  consent_text_version: string;
  metadata: Record<string, unknown>;
};
type LocaleRow = {
  code: string;
  name: string;
  native_name: string;
  is_active: boolean;
  is_default: boolean;
  sort_order: number;
};
type SettingRow = {
  key: string;
  value: unknown;
  description: string;
  updated_by: string | null;
  updated_at: string;
};
type MediaAsset = {
  id: string;
  owner_user_id: string | null;
  storage_bucket: string;
  object_path: string;
  media_type: string;
  mime_type: string;
  byte_size: number;
  visibility: string;
  processing_status: string;
  created_at: string;
};
type AuditRow = {
  id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  actor_user_id: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  created_at: string;
};
type Summary = {
  users_total: number;
  invitations_total: number;
  invitations_active: number;
  invitations_draft: number;
  templates_total: number;
  templates_published: number;
  templates_pending: number;
  orders_total: number;
  orders_paid: number;
  orders_pending: number;
  consents_active: number;
  consents_withdrawn: number;
  events_total: number;
  events_by_name: Record<string, number>;
  period_days: number;
};
type Tab = "analytics" | "templates" | "consents" | "media" | "locales" | "settings" | "audit";

const emptySummary: Summary = {
  users_total: 0,
  invitations_total: 0,
  invitations_active: 0,
  invitations_draft: 0,
  templates_total: 0,
  templates_published: 0,
  templates_pending: 0,
  orders_total: 0,
  orders_paid: 0,
  orders_pending: 0,
  consents_active: 0,
  consents_withdrawn: 0,
  events_total: 0,
  events_by_name: {},
  period_days: 30,
};

const cardClass = "rounded-2xl border border-[#eaded5] bg-white p-4 sm:p-5";
const inputClass = "mt-1 w-full rounded-lg border border-[#ddcec3] bg-white px-3 py-2 text-sm";
const buttonClass =
  "rounded-lg border border-[#ddcec3] px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50";
const primaryClass =
  "rounded-lg bg-[#754b3b] px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50";

const dateTime = (value: string | null) =>
  value ? new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "—";

export default function PhaseSevenDashboard({
  client,
  userId,
}: {
  client: SupabaseClient;
  userId: string;
}) {
  const [tab, setTab] = useState<Tab>("analytics");
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [consents, setConsents] = useState<ConsentRow[]>([]);
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);
  const [locales, setLocales] = useState<LocaleRow[]>([]);
  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [timezoneText, setTimezoneText] = useState("Asia/Jakarta, Asia/Makassar, Asia/Jayapura, Asia/Singapore, UTC");
  const [localeCode, setLocaleCode] = useState("");
  const [localeName, setLocaleName] = useState("");
  const [localeNativeName, setLocaleNativeName] = useState("");
  const [settingKey, setSettingKey] = useState("");
  const [settingDescription, setSettingDescription] = useState("");
  const [settingValue, setSettingValue] = useState("{}");
  const [auditFilter, setAuditFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    const [summaryResult, templateResult, consentResult, mediaResult, localeResult, settingResult, auditResult] =
      await Promise.all([
        client.rpc("admin_get_analytics_summary", { p_days: 30 }),
        client
          .from("templates")
          .select(
            "id,slug,title,status,current_version_id,source_invitation_id,source_consent_id,moderation_note,moderated_at",
          )
          .order("updated_at", { ascending: false }),
        client
          .from("consent_records")
          .select(
            "id,user_id,invitation_id,order_id,granted,granted_at,withdrawn_at,consent_text_version,metadata",
          )
          .eq("consent_type", "marketplace_template")
          .order("created_at", { ascending: false })
          .limit(100),
        client
          .from("media_assets")
          .select("id,owner_user_id,storage_bucket,object_path,media_type,mime_type,byte_size,visibility,processing_status,created_at")
          .order("created_at", { ascending: false })
          .limit(100),
        client.from("locales").select("*").order("sort_order"),
        client.from("system_settings").select("*").order("key"),
        client
          .from("audit_logs")
          .select("id,action,target_type,target_id,actor_user_id,before_data,after_data,created_at")
          .order("created_at", { ascending: false })
          .limit(100),
      ]);
    const firstError =
      summaryResult.error ||
      templateResult.error ||
      consentResult.error ||
      mediaResult.error ||
      localeResult.error ||
      settingResult.error ||
      auditResult.error;
    if (firstError) setError(firstError.message);
    if (summaryResult.data) setSummary(summaryResult.data as Summary);
    setTemplates((templateResult.data || []) as TemplateRow[]);
    setConsents((consentResult.data || []) as ConsentRow[]);
    setMediaAssets((mediaResult.data || []) as MediaAsset[]);
    setLocales((localeResult.data || []) as LocaleRow[]);
    const nextSettings = (settingResult.data || []) as SettingRow[];
    setSettings(nextSettings);
    const timezoneSetting = nextSettings.find((item) => item.key === "localization.timezones");
    if (Array.isArray(timezoneSetting?.value)) {
      setTimezoneText((timezoneSetting.value as unknown[]).filter((item) => typeof item === "string").join(", "));
    }
    setAudit((auditResult.data || []) as AuditRow[]);
    setLoading(false);
  }, [client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function runAction(action: () => PromiseLike<{ error: { message: string } | null }>, success: string) {
    setSaving(true);
    setError("");
    setNotice("");
    const result = await action();
    if (result.error) setError(result.error.message);
    else {
      setNotice(success);
      await refresh();
    }
    setSaving(false);
  }

  async function moderateTemplate(item: TemplateRow, status: "draft" | "published" | "archived") {
    const label = status === "published" ? "menerbitkan" : status === "archived" ? "mengarsipkan" : "mengembalikan ke draft";
    if (!window.confirm(`Yakin ${label} template “${item.title}”?`)) return;
    await runAction(
      () =>
        client.rpc("admin_set_template_moderation", {
          p_template_id: item.id,
          p_status: status,
          p_note: status === "published" ? "Lolos peninjauan admin." : null,
        }),
      `Status template “${item.title}” diperbarui.`,
    );
  }

  async function setMediaStatus(item: MediaAsset, status: "ready" | "quarantined") {
    const action = status === "quarantined" ? "memasukkan aset ke karantina" : "memulihkan aset";
    if (!window.confirm(`Yakin ${action} ini?`)) return;
    await runAction(
      () => client.from("media_assets").update({ processing_status: status, updated_at: new Date().toISOString() }).eq("id", item.id),
      status === "quarantined" ? "Aset berhasil dikarantina." : "Status aset berhasil dipulihkan.",
    );
  }

  async function reviewConsent(item: ConsentRow, decision: "approved" | "rejected") {
    const note = window.prompt(
      decision === "approved" ? "Catatan persetujuan (opsional):" : "Alasan penolakan:",
      "",
    );
    if (note === null) return;
    await runAction(
      () =>
        client.rpc("admin_review_marketplace_consent", {
          p_consent_id: item.id,
          p_decision: decision,
          p_note: note.trim() || null,
        }),
      `Persetujuan marketplace ${decision === "approved" ? "disetujui" : "ditolak"}.`,
    );
  }

  async function saveLocale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = localeCode.trim();
    if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(code)) {
      setError("Kode bahasa harus menggunakan format seperti id-ID atau en.");
      return;
    }
    await runAction(
      () =>
        client.from("locales").insert({
          code,
          name: localeName.trim(),
          native_name: localeNativeName.trim(),
          is_active: true,
          is_default: false,
          sort_order: locales.length * 10 + 10,
        }),
      "Bahasa berhasil ditambahkan.",
    );
    setLocaleCode("");
    setLocaleName("");
    setLocaleNativeName("");
  }

  async function setDefaultLocale(code: string) {
    await runAction(
      () => client.rpc("admin_set_default_locale", { p_code: code }),
      "Bahasa bawaan berhasil diperbarui.",
    );
  }

  async function toggleLocale(item: LocaleRow) {
    if (item.is_default && item.is_active) {
      setError("Pilih bahasa bawaan yang lain sebelum menonaktifkan bahasa ini.");
      return;
    }
    await runAction(
      () =>
        client
          .from("locales")
          .update({ is_active: !item.is_active, updated_at: new Date().toISOString() })
          .eq("code", item.code),
      `Bahasa ${item.code} berhasil diperbarui.`,
    );
  }

  async function saveTimezones(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = [...new Set(timezoneText.split(",").map((item) => item.trim()).filter(Boolean))];
    if (!values.length || values.length > 40) {
      setError("Masukkan 1 sampai 40 zona waktu.");
      return;
    }
    try {
      values.forEach((value) => new Intl.DateTimeFormat("en", { timeZone: value }));
    } catch {
      setError("Ada zona waktu yang tidak dikenal.");
      return;
    }
    await runAction(
      () =>
        client.from("system_settings").upsert(
          {
            key: "localization.timezones",
            value: values,
            updated_by: userId,
            description: "Daftar zona waktu yang dapat dipilih pengguna dan undangan.",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" },
        ),
      "Daftar zona waktu berhasil disimpan.",
    );
  }

  async function saveSetting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const key = settingKey.trim().toLowerCase();
    if (!/^[a-z][a-z0-9_.-]{1,119}$/.test(key) || /(secret|token|password|private.?key|server.?key|credential)/i.test(key)) {
      setError("Kunci tidak valid atau berisi nama kredensial terlarang. Simpan rahasia di secret manager.");
      return;
    }
    let value: unknown;
    try {
      value = JSON.parse(settingValue);
    } catch {
      setError("Nilai pengaturan harus berupa JSON yang valid.");
      return;
    }
    await runAction(
      () =>
        client.from("system_settings").upsert(
          {
            key,
            value,
            updated_by: userId,
            description: settingDescription.trim(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" },
        ),
      "Pengaturan sistem berhasil disimpan.",
    );
    setSettingKey("");
    setSettingDescription("");
    setSettingValue("{}");
  }

  async function deleteSetting(key: string) {
    if (!window.confirm(`Hapus pengaturan “${key}”?`)) return;
    await runAction(
      () => client.from("system_settings").delete().eq("key", key),
      "Pengaturan sistem berhasil dihapus.",
    );
  }

  const filteredAudit = useMemo(() => {
    const term = auditFilter.trim().toLowerCase();
    if (!term) return audit;
    return audit.filter((entry) =>
      [entry.action, entry.target_type, entry.target_id || "", entry.actor_user_id || ""]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [audit, auditFilter]);

  const activeConsents = consents.filter((item) => item.granted && !item.withdrawn_at);
  const eventEntries = Object.entries(summary.events_by_name || {}).sort((a, b) => b[1] - a[1]);
  const tabs: Array<[Tab, string]> = [
    ["analytics", "Analitik"],
    ["templates", "Moderasi template"],
    ["consents", "Persetujuan marketplace"],
    ["media", "Media"],
    ["locales", "Bahasa & zona waktu"],
    ["settings", "Pengaturan sistem"],
    ["audit", "Audit log"],
  ];

  return (
    <main className="min-h-screen bg-[#fffaf6] px-4 py-7 text-[#30251f] sm:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#a36d55]">
              Janji Kita · Pusat administrasi
            </p>
            <h1 className="mt-2 text-2xl font-semibold">Operasional, analitik, dan lokalisasi</h1>
            <p className="mt-1 text-sm text-[#76675f]">
              Kelola konten, persetujuan penggunaan desain, konfigurasi, dan jejak aktivitas.
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" className={buttonClass} onClick={() => void refresh()} disabled={loading}>
              Muat ulang
            </button>
            <a href="/" className={buttonClass}>Ruang kerja</a>
          </div>
        </header>

        {notice && <p role="status" className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</p>}
        {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        <nav aria-label="Menu operasional admin" className="flex gap-2 overflow-x-auto pb-1">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-current={tab === key ? "page" : undefined}
              onClick={() => setTab(key)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${tab === key ? "bg-[#754b3b] text-white" : "border border-[#ddcec3] text-[#765e52] hover:bg-[#f8f1eb]"}`}
            >
              {label}
            </button>
          ))}
        </nav>

        {loading ? (
          <section className={cardClass}><p className="py-8 text-center text-sm text-[#76675f]">Memuat data operasional...</p></section>
        ) : (
          <>
            {tab === "analytics" && (
              <section className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    ["Pengguna", summary.users_total],
                    ["Undangan", summary.invitations_total],
                    ["Undangan aktif", summary.invitations_active],
                    ["Draft undangan", summary.invitations_draft],
                    ["Template terbit", summary.templates_published],
                    ["Template menunggu", summary.templates_pending],
                    ["Pesanan lunas", summary.orders_paid],
                    ["Pesanan menunggu", summary.orders_pending],
                    ["Persetujuan aktif", summary.consents_active],
                    ["Persetujuan dicabut", summary.consents_withdrawn],
                    ["Peristiwa 30 hari", summary.events_total],
                    ["Total pesanan", summary.orders_total],
                  ].map(([label, value]) => (
                    <article key={label} className={cardClass}>
                      <p className="text-sm text-[#76675f]">{label}</p>
                      <p className="mt-2 text-2xl font-semibold tabular-nums">{Number(value).toLocaleString("id-ID")}</p>
                    </article>
                  ))}
                </div>
                <section className={cardClass}>
                  <h2 className="font-semibold">Aktivitas 30 hari terakhir</h2>
                  <p className="mt-1 text-xs text-[#887970]">Data berasal dari peristiwa aplikasi tanpa nama, email, nomor telepon, atau isi undangan.</p>
                  <div className="mt-4 space-y-3">
                    {eventEntries.map(([name, count]) => {
                      const max = Math.max(1, ...eventEntries.map((item) => item[1]));
                      return (
                        <div key={name}>
                          <div className="mb-1 flex justify-between gap-3 text-sm">
                            <span>{name}</span><strong className="tabular-nums">{count}</strong>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-[#f0e7e0]">
                            <div className="h-full rounded-full bg-[#a36d55]" style={{ width: `${(count / max) * 100}%` }} />
                          </div>
                        </div>
                      );
                    })}
                    {!eventEntries.length && <p className="text-sm text-[#887970]">Belum ada peristiwa analitik pada periode ini.</p>}
                  </div>
                </section>
              </section>
            )}

            {tab === "templates" && (
              <section className={cardClass}>
                <div className="mb-4">
                  <h2 className="font-semibold">Moderasi template marketplace</h2>
                  <p className="mt-1 text-sm text-[#76675f]">Template draft tidak tampil di marketplace sampai lolos peninjauan dan diterbitkan.</p>
                </div>
                <div className="divide-y divide-[#f0e7e0]">
                  {templates.map((item) => (
                    <article key={item.id} className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <p className="font-semibold">{item.title}</p>
                        <p className="mt-1 break-all text-xs text-[#887970]">{item.slug} · {item.status} · versi {item.current_version_id ? "tersedia" : "belum tersedia"}</p>
                        {item.source_invitation_id && <p className="mt-1 break-all text-xs text-[#887970]">Sumber undangan: {item.source_invitation_id}</p>}
                        {item.source_consent_id && <p className="mt-1 break-all text-xs text-[#887970]">Persetujuan: {item.source_consent_id}</p>}
                        {item.moderation_note && <p className="mt-1 text-xs text-[#76675f]">Catatan: {item.moderation_note}</p>}
                        {item.moderated_at && <p className="mt-1 text-xs text-[#887970]">Ditinjau: {dateTime(item.moderated_at)}</p>}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {item.status !== "published" && <button className={primaryClass} disabled={saving || !item.current_version_id} onClick={() => void moderateTemplate(item, "published")} type="button">Terbitkan</button>}
                        {item.status !== "draft" && <button className={buttonClass} disabled={saving} onClick={() => void moderateTemplate(item, "draft")} type="button">Kembalikan ke draft</button>}
                        {item.status !== "archived" && <button className={buttonClass} disabled={saving} onClick={() => void moderateTemplate(item, "archived")} type="button">Arsipkan</button>}
                      </div>
                    </article>
                  ))}
                  {!templates.length && <p className="py-8 text-center text-sm text-[#887970]">Belum ada template untuk ditinjau.</p>}
                </div>
              </section>
            )}

            {tab === "consents" && (
              <section className={cardClass}>
                <div className="mb-4">
                  <h2 className="font-semibold">Persetujuan penggunaan desain pelanggan</h2>
                  <p className="mt-1 text-sm text-[#76675f]">Persetujuan bersifat opsional, terpisah dari pembelian, dan dapat dicabut pemilik kapan saja.</p>
                  <p className="mt-1 text-xs text-[#887970]">{activeConsents.length} persetujuan aktif · {consents.length - activeConsents.length} dicabut/tidak aktif · menampilkan maksimal 100 catatan terbaru.</p>
                </div>
                <div className="divide-y divide-[#f0e7e0]">
                  {consents.map((item) => {
                    const state = item.withdrawn_at ? "Dicabut pemilik" : item.metadata.moderation_status === "approved" ? "Disetujui" : item.metadata.moderation_status === "rejected" ? "Ditolak" : item.granted ? "Menunggu tinjauan" : "Tidak diberikan";
                    const canReview = item.granted && !item.withdrawn_at && item.metadata.moderation_status !== "approved" && item.metadata.moderation_status !== "rejected";
                    return (
                      <article key={item.id} className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                          <p className="font-semibold">{state}</p>
                          <p className="mt-1 break-all text-xs text-[#887970]">Pengguna: {item.user_id}</p>
                          <p className="break-all text-xs text-[#887970]">Undangan: {item.invitation_id}</p>
                          <p className="break-all text-xs text-[#887970]">Pesanan: {item.order_id || "—"} · versi teks: {item.consent_text_version}</p>
                          <p className="mt-1 text-xs text-[#887970]">Diberikan: {dateTime(item.granted_at)} · Dicabut: {dateTime(item.withdrawn_at)}</p>
                          {typeof item.metadata.review_note === "string" && <p className="mt-1 text-xs text-[#76675f]">Catatan tinjauan: {item.metadata.review_note}</p>}
                        </div>
                        {canReview && (
                          <div className="flex gap-2">
                            <button className={primaryClass} disabled={saving} onClick={() => void reviewConsent(item, "approved")} type="button">Setujui</button>
                            <button className={buttonClass} disabled={saving} onClick={() => void reviewConsent(item, "rejected")} type="button">Tolak</button>
                          </div>
                        )}
                      </article>
                    );
                  })}
                  {!consents.length && <p className="py-8 text-center text-sm text-[#887970]">Belum ada persetujuan marketplace.</p>}
                </div>
              </section>
            )}

            {tab === "media" && (
              <section className={cardClass}>
                <div className="mb-4">
                  <h2 className="font-semibold">Inventaris media</h2>
                  <p className="mt-1 text-sm text-[#76675f]">Tinjau metadata aset dan karantina berkas yang bermasalah. Berkas privat tidak dibuka atau ditampilkan melalui panel ini.</p>
                  <p className="mt-1 text-xs text-[#887970]">Menampilkan maksimal 100 aset terbaru.</p>
                </div>
                <div className="divide-y divide-[#f0e7e0]">
                  {mediaAssets.map((item) => (
                    <article key={item.id} className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <p className="font-semibold">{item.media_type} · {item.mime_type}</p>
                        <p className="mt-1 break-all text-xs text-[#887970]">{item.storage_bucket} · {item.visibility} · {item.processing_status}</p>
                        <p className="break-all text-xs text-[#887970]">Aset: {item.id} · Pemilik: {item.owner_user_id || "Sistem"}</p>
                        <p className="text-xs text-[#887970]">{(item.byte_size / 1024 / 1024).toFixed(2)} MB · {dateTime(item.created_at)}</p>
                      </div>
                      {item.processing_status === "quarantined" ? (
                        <button type="button" className={buttonClass} disabled={saving} onClick={() => void setMediaStatus(item, "ready")}>Pulihkan status</button>
                      ) : (
                        <button type="button" className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-50" disabled={saving} onClick={() => void setMediaStatus(item, "quarantined")}>Karantina</button>
                      )}
                    </article>
                  ))}
                  {!mediaAssets.length && <p className="py-8 text-center text-sm text-[#887970]">Belum ada aset media.</p>}
                </div>
              </section>
            )}

            {tab === "locales" && (
              <div className="grid gap-4 lg:grid-cols-2">
                <section className={cardClass}>
                  <h2 className="font-semibold">Bahasa yang didukung</h2>
                  <p className="mt-1 text-sm text-[#76675f]">Bahasa bawaan digunakan saat preferensi pengguna belum ditentukan.</p>
                  <div className="mt-4 divide-y divide-[#f0e7e0]">
                    {locales.map((item) => (
                      <div key={item.code} className="flex flex-wrap items-center justify-between gap-3 py-3">
                        <div>
                          <p className="font-semibold">{item.native_name} <span className="text-xs font-normal text-[#887970]">({item.code})</span></p>
                          <p className="text-xs text-[#887970]">{item.name} · {item.is_active ? "Aktif" : "Nonaktif"}{item.is_default ? " · Bawaan" : ""}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {!item.is_default && item.is_active && <button type="button" className={buttonClass} disabled={saving} onClick={() => void setDefaultLocale(item.code)}>Jadikan bawaan</button>}
                          <button type="button" className={buttonClass} disabled={saving} onClick={() => void toggleLocale(item)}>{item.is_active ? "Nonaktifkan" : "Aktifkan"}</button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <form onSubmit={(event) => void saveLocale(event)} className="mt-5 grid gap-3 border-t border-[#f0e7e0] pt-4">
                    <h3 className="text-sm font-semibold">Tambah bahasa</h3>
                    <label className="text-sm">Kode bahasa<input required value={localeCode} onChange={(event) => setLocaleCode(event.target.value)} placeholder="contoh: en" className={inputClass} /></label>
                    <label className="text-sm">Nama bahasa<input required value={localeName} onChange={(event) => setLocaleName(event.target.value)} className={inputClass} /></label>
                    <label className="text-sm">Nama asli<input required value={localeNativeName} onChange={(event) => setLocaleNativeName(event.target.value)} className={inputClass} /></label>
                    <button className={primaryClass} disabled={saving}>Tambah bahasa</button>
                  </form>
                </section>

                <section className={cardClass}>
                  <h2 className="font-semibold">Zona waktu</h2>
                  <p className="mt-1 text-sm text-[#76675f]">Daftar ini digunakan pada preferensi akun dan pengaturan undangan.</p>
                  <form onSubmit={(event) => void saveTimezones(event)} className="mt-4 space-y-3">
                    <label className="block text-sm">Zona waktu, pisahkan dengan koma<textarea rows={6} value={timezoneText} onChange={(event) => setTimezoneText(event.target.value)} className={inputClass} /></label>
                    <button className={primaryClass} disabled={saving}>Simpan zona waktu</button>
                  </form>
                  <p className="mt-3 text-xs text-[#887970]">Gunakan nama zona waktu IANA, misalnya Asia/Jakarta atau UTC.</p>
                </section>
              </div>
            )}

            {tab === "settings" && (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <section className={cardClass}>
                  <h2 className="font-semibold">Pengaturan aman</h2>
                  <p className="mt-1 text-sm text-[#76675f]">Hanya konfigurasi operasional non-rahasia. Kunci API, token, dan kredensial wajib disimpan pada secret manager.</p>
                  <div className="mt-4 divide-y divide-[#f0e7e0]">
                    {settings.map((item) => (
                      <div key={item.key} className="py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="break-all text-sm font-semibold">{item.key}</p>
                            <p className="mt-1 text-xs text-[#887970]">{item.description}</p>
                            <pre className="mt-2 max-h-32 overflow-auto rounded-lg bg-[#faf5f0] p-2 text-xs">{JSON.stringify(item.value, null, 2)}</pre>
                          </div>
                          {item.key !== "localization.timezones" && <button className="text-xs font-semibold text-red-700 underline" type="button" disabled={saving} onClick={() => void deleteSetting(item.key)}>Hapus</button>}
                        </div>
                      </div>
                    ))}
                    {!settings.length && <p className="py-4 text-sm text-[#887970]">Belum ada pengaturan khusus.</p>}
                  </div>
                </section>
                <section className={cardClass}>
                  <h2 className="font-semibold">Tambah / ubah pengaturan</h2>
                  <form onSubmit={(event) => void saveSetting(event)} className="mt-4 space-y-3">
                    <label className="block text-sm">Kunci<input required value={settingKey} onChange={(event) => setSettingKey(event.target.value)} placeholder="contoh: retention.audit_days" className={inputClass} /></label>
                    <label className="block text-sm">Deskripsi<input required maxLength={500} value={settingDescription} onChange={(event) => setSettingDescription(event.target.value)} className={inputClass} /></label>
                    <label className="block text-sm">Nilai JSON<textarea required rows={7} value={settingValue} onChange={(event) => setSettingValue(event.target.value)} className={inputClass} /></label>
                    <button className={primaryClass} disabled={saving}>Simpan pengaturan</button>
                  </form>
                </section>
              </div>
            )}

            {tab === "audit" && (
              <section className={cardClass}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div><h2 className="font-semibold">Jejak aktivitas administratif</h2><p className="mt-1 text-xs text-[#887970]">Catatan bersifat append-only; data rahasia tidak ditampilkan.</p></div>
                  <label className="text-sm">Cari aktivitas<input value={auditFilter} onChange={(event) => setAuditFilter(event.target.value)} className={inputClass} placeholder="Aksi, target, atau ID" /></label>
                </div>
                <div className="mt-4 divide-y divide-[#f0e7e0]">
                  {filteredAudit.map((item) => (
                    <details key={item.id} className="py-3">
                      <summary className="cursor-pointer list-inside text-sm font-semibold">{item.action} · {item.target_type} <span className="font-normal text-[#887970]">· {dateTime(item.created_at)}</span></summary>
                      <p className="mt-2 break-all text-xs text-[#887970]">Target: {item.target_id || "—"} · Pelaku: {item.actor_user_id || "Sistem"}</p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <pre className="overflow-auto rounded-lg bg-[#faf5f0] p-2 text-xs">{JSON.stringify(item.before_data, null, 2) || "—"}</pre>
                        <pre className="overflow-auto rounded-lg bg-[#faf5f0] p-2 text-xs">{JSON.stringify(item.after_data, null, 2) || "—"}</pre>
                      </div>
                    </details>
                  ))}
                  {!filteredAudit.length && <p className="py-8 text-center text-sm text-[#887970]">Tidak ada aktivitas yang cocok.</p>}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
