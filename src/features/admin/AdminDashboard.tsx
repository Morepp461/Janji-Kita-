import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

type CatalogItem = {
  id: string;
  slug: string;
  name_i18n: Record<string, string>;
  description_i18n: Record<string, string>;
  sort_order: number;
  is_active: boolean;
};

type FeatureFlag = {
  key: string;
  enabled: boolean;
  is_public: boolean;
  config: Record<string, unknown>;
  updated_at: string;
};

type AuditEntry = {
  id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  created_at: string;
  actor_user_id: string | null;
};

type AdminDashboardProps = {
  client: SupabaseClient;
  isSuperAdmin: boolean;
};

type CatalogKind = "categories" | "design_styles";

const catalogLabels: Record<CatalogKind, string> = {
  categories: "Kategori",
  design_styles: "Gaya desain",
};

export default function AdminDashboard({ client, isSuperAdmin }: AdminDashboardProps) {
  const [tab, setTab] = useState<"categories" | "styles" | "flags" | "audit" | "roles">(
    "categories",
  );
  const [categories, setCategories] = useState<CatalogItem[]>([]);
  const [styles, setStyles] = useState<CatalogItem[]>([]);
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<{ kind: CatalogKind; item: CatalogItem } | null>(null);
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [roleUserId, setRoleUserId] = useState("");
  const [role, setRole] = useState("admin");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    const [categoryResult, styleResult, flagResult, auditResult] = await Promise.all([
      client.from("categories").select("*").order("sort_order"),
      client.from("design_styles").select("*").order("sort_order"),
      client.from("feature_flags").select("*").order("key"),
      client
        .from("audit_logs")
        .select("id,action,target_type,target_id,created_at,actor_user_id")
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

    const firstError =
      categoryResult.error || styleResult.error || flagResult.error || auditResult.error;
    if (firstError) setError(firstError.message);
    setCategories((categoryResult.data || []) as CatalogItem[]);
    setStyles((styleResult.data || []) as CatalogItem[]);
    setFlags((flagResult.data || []) as FeatureFlag[]);
    setAudit((auditResult.data || []) as AuditEntry[]);
    setLoading(false);
  }, [client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function beginEdit(kind: CatalogKind, item?: CatalogItem) {
    setEditing(
      item
        ? { kind, item }
        : {
            kind,
            item: {
              id: "",
              slug: "",
              name_i18n: {},
              description_i18n: {},
              sort_order: 0,
              is_active: true,
            },
          },
    );
    setSlug(item?.slug || "");
    setName(item?.name_i18n?.["id-ID"] || "");
    setDescription(item?.description_i18n?.["id-ID"] || "");
    setNotice("");
    setError("");
  }

  async function saveCatalog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setError("");
    setNotice("");
    const payload = {
      slug: slug.trim(),
      name_i18n: { "id-ID": name.trim() },
      description_i18n: { "id-ID": description.trim() },
      sort_order: editing.item.sort_order,
      is_active: editing.item.is_active,
    };
    const query = editing.item.id
      ? client.from(editing.kind).update(payload).eq("id", editing.item.id)
      : client.from(editing.kind).insert(payload);
    const { error: saveError } = await query;
    if (saveError) {
      setError(saveError.message);
      return;
    }
    setEditing(null);
    setNotice(`${catalogLabels[editing.kind]} berhasil disimpan.`);
    await refresh();
  }

  async function deleteCatalog(kind: CatalogKind, item: CatalogItem) {
    if (!window.confirm(`Hapus ${item.name_i18n?.["id-ID"] || item.slug}?`)) return;
    const { error: deleteError } = await client.from(kind).delete().eq("id", item.id);
    if (deleteError) setError(deleteError.message);
    else {
      setNotice(`${catalogLabels[kind]} berhasil dihapus.`);
      await refresh();
    }
  }

  async function toggleFlag(flag: FeatureFlag) {
    const { error: updateError } = await client
      .from("feature_flags")
      .update({ enabled: !flag.enabled })
      .eq("key", flag.key);
    if (updateError) setError(updateError.message);
    else {
      setNotice(`Feature flag ${flag.key} diperbarui.`);
      await refresh();
    }
  }

  async function changeRole(action: "grant" | "revoke") {
    setError("");
    setNotice("");
    const { error: roleError } = await client.rpc("admin_set_user_role", {
      p_user_id: roleUserId.trim(),
      p_role: role,
      p_action: action,
    });
    if (roleError) setError(roleError.message);
    else {
      setNotice(`Peran ${role} berhasil ${action === "grant" ? "diberikan" : "dicabut"}.`);
      await refresh();
    }
  }

  const catalog = tab === "categories" ? categories : styles;
  const catalogKind: CatalogKind = tab === "categories" ? "categories" : "design_styles";

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#a36d55]">
            Control center
          </p>
          <h2 className="mt-1 text-2xl font-semibold">Administrasi</h2>
          <p className="mt-1 text-sm text-[#76675f]">
            Akses mengikuti izin server dan setiap perubahan penting tercatat.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/admin/commerce" className="rounded-xl border border-[#ddcec3] px-4 py-2 text-sm font-semibold hover:bg-[#f8f1eb]">
            Kelola commerce
          </a>
          <button
            className="rounded-xl border border-[#ddcec3] px-4 py-2 text-sm font-semibold hover:bg-[#f8f1eb]"
            onClick={() => void refresh()}
            type="button"
          >
            Muat ulang
          </button>
        </div>
      </div>

      <nav aria-label="Menu administrasi" className="flex gap-2 overflow-x-auto pb-1">
        {(
          [
            ["categories", "Kategori"],
            ["styles", "Gaya desain"],
            ["flags", "Feature flags"],
            ["audit", "Audit log"],
            ...(isSuperAdmin ? [["roles", "Peran pengguna"]] : []),
          ] as string[][]
        ).map(([key, label]) => (
          <button
            aria-current={tab === key ? "page" : undefined}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${tab === key ? "bg-[#754b3b] text-white" : "border border-[#ddcec3] text-[#765e52] hover:bg-[#f8f1eb]"}`}
            key={key}
            onClick={() => setTab(key as typeof tab)}
            type="button"
          >
            {label}
          </button>
        ))}
      </nav>

      {notice && (
        <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</p>
      )}
      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {(tab === "categories" || tab === "styles") && (
        <div className="rounded-2xl border border-[#eaded5] bg-white p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="font-semibold">{catalogLabels[catalogKind]}</h3>
            <button
              className="rounded-lg bg-[#754b3b] px-3 py-2 text-sm font-semibold text-white"
              onClick={() => beginEdit(catalogKind)}
              type="button"
            >
              Tambah
            </button>
          </div>
          {editing?.kind === catalogKind && (
            <form
              className="mb-5 grid gap-3 rounded-xl bg-[#faf5f0] p-4 sm:grid-cols-2"
              onSubmit={saveCatalog}
            >
              <label className="text-sm font-medium">
                Slug
                <input
                  className="mt-1 w-full rounded-lg border border-[#ddcec3] bg-white px-3 py-2"
                  onChange={(event) => setSlug(event.target.value)}
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  required
                  value={slug}
                />
              </label>
              <label className="text-sm font-medium">
                Nama (Indonesia)
                <input
                  className="mt-1 w-full rounded-lg border border-[#ddcec3] bg-white px-3 py-2"
                  maxLength={100}
                  onChange={(event) => setName(event.target.value)}
                  required
                  value={name}
                />
              </label>
              <label className="text-sm font-medium sm:col-span-2">
                Deskripsi
                <textarea
                  className="mt-1 w-full rounded-lg border border-[#ddcec3] bg-white px-3 py-2"
                  maxLength={500}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={2}
                  value={description}
                />
              </label>
              <div className="flex gap-2 sm:col-span-2">
                <button
                  className="rounded-lg bg-[#754b3b] px-4 py-2 text-sm font-semibold text-white"
                  type="submit"
                >
                  Simpan
                </button>
                <button
                  className="rounded-lg border border-[#ddcec3] px-4 py-2 text-sm"
                  onClick={() => setEditing(null)}
                  type="button"
                >
                  Batal
                </button>
              </div>
            </form>
          )}
          {loading ? (
            <p className="py-8 text-sm text-[#887970]">Memuat data...</p>
          ) : (
            <div className="divide-y divide-[#f0e7e0]">
              {catalog.map((item) => (
                <div
                  className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                  key={item.id}
                >
                  <div>
                    <p className="font-medium">{item.name_i18n?.["id-ID"] || item.slug}</p>
                    <p className="text-xs text-[#887970]">
                      {item.slug} · {item.is_active ? "Aktif" : "Nonaktif"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="rounded-lg border border-[#ddcec3] px-3 py-2 text-xs font-semibold"
                      onClick={() => beginEdit(catalogKind, item)}
                      type="button"
                    >
                      Ubah
                    </button>
                    <button
                      className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700"
                      onClick={() => void deleteCatalog(catalogKind, item)}
                      type="button"
                    >
                      Hapus
                    </button>
                  </div>
                </div>
              ))}
              {catalog.length === 0 && (
                <p className="py-8 text-sm text-[#887970]">Belum ada data.</p>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "flags" && (
        <div className="rounded-2xl border border-[#eaded5] bg-white p-4 sm:p-6">
          <h3 className="mb-4 font-semibold">Feature flags</h3>
          {loading ? (
            <p className="py-8 text-sm text-[#887970]">Memuat data...</p>
          ) : (
            flags.map((flag) => (
              <div
                className="flex flex-col gap-3 border-b border-[#f0e7e0] py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between"
                key={flag.key}
              >
                <div>
                  <p className="font-medium">{flag.key}</p>
                  <p className="text-xs text-[#887970]">
                    {flag.is_public ? "Dapat dibaca publik" : "Internal"}
                  </p>
                </div>
                <button
                  aria-pressed={flag.enabled}
                  className={`rounded-full px-4 py-2 text-sm font-semibold ${flag.enabled ? "bg-green-100 text-green-800" : "bg-[#eee8e3] text-[#6f625a]"}`}
                  onClick={() => void toggleFlag(flag)}
                  type="button"
                >
                  {flag.enabled ? "Aktif" : "Nonaktif"}
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "audit" && (
        <div className="rounded-2xl border border-[#eaded5] bg-white p-4 sm:p-6">
          <h3 className="mb-4 font-semibold">Riwayat aktivitas administratif</h3>
          {loading ? (
            <p className="py-8 text-sm text-[#887970]">Memuat data...</p>
          ) : (
            <div className="divide-y divide-[#f0e7e0]">
              {audit.map((entry) => (
                <div className="py-3" key={entry.id}>
                  <p className="text-sm font-semibold">
                    {entry.action} · {entry.target_type}
                  </p>
                  <p className="mt-1 break-all text-xs text-[#887970]">
                    {entry.target_id || "Tanpa ID target"} · {entry.actor_user_id || "Sistem"}
                  </p>
                  <time className="mt-1 block text-xs text-[#887970]" dateTime={entry.created_at}>
                    {new Date(entry.created_at).toLocaleString("id-ID")}
                  </time>
                </div>
              ))}
              {audit.length === 0 && (
                <p className="py-8 text-sm text-[#887970]">Belum ada aktivitas.</p>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "roles" && isSuperAdmin && (
        <div className="rounded-2xl border border-[#eaded5] bg-white p-4 sm:p-6">
          <h3 className="font-semibold">Kelola peran pengguna</h3>
          <p className="mt-1 text-sm text-[#76675f]">
            Gunakan UUID pengguna dari Supabase Auth. Perubahan peran sendiri ditolak dan seluruh
            perubahan dicatat.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_180px]">
            <label className="text-sm font-medium sm:col-span-2">
              ID pengguna
              <input
                className="mt-1 w-full rounded-lg border border-[#ddcec3] px-3 py-2"
                onChange={(event) => setRoleUserId(event.target.value)}
                placeholder="UUID pengguna"
                value={roleUserId}
              />
            </label>
            <label className="text-sm font-medium">
              Peran
              <select
                className="mt-1 w-full rounded-lg border border-[#ddcec3] px-3 py-2"
                onChange={(event) => setRole(event.target.value)}
                value={role}
              >
                {[
                  "user",
                  "admin",
                  "finance",
                  "support",
                  "moderator",
                  "reseller",
                  "super_admin",
                ].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end gap-2">
              <button
                className="rounded-lg bg-[#754b3b] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                disabled={!roleUserId.trim()}
                onClick={() => void changeRole("grant")}
                type="button"
              >
                Berikan
              </button>
              <button
                className="rounded-lg border border-[#ddcec3] px-3 py-2 text-sm disabled:opacity-50"
                disabled={!roleUserId.trim()}
                onClick={() => void changeRole("revoke")}
                type="button"
              >
                Cabut
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
