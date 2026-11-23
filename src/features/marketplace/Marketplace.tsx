import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createBlankInvitationDocument,
  isInvitationDocument,
  type InvitationDocument,
} from "../invitations/document";
import InvitationDocumentView from "../invitations/InvitationDocumentView";

type CatalogItem = { id: string; name_i18n: Record<string, string> };
type Template = {
  id: string;
  slug: string;
  title: string;
  description: string;
  category_id: string;
  style_id: string;
  base_price: number;
  currency: string;
  current_version_id: string | null;
  thumbnail_asset_id: string | null;
};
type Draft = {
  id: string;
  title: string;
  status: string;
  draft_version_id: string | null;
  updated_at: string;
};

type Props = {
  client: SupabaseClient | null;
  userId: string | null;
  isAdmin?: boolean;
  initialTemplateSlug?: string;
};

const currency = (amount: number, code: string) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: code,
    maximumFractionDigits: 0,
  }).format(amount);

export default function Marketplace({
  client,
  userId,
  isAdmin = false,
  initialTemplateSlug,
}: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [categories, setCategories] = useState<CatalogItem[]>([]);
  const [styles, setStyles] = useState<CatalogItem[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [styleFilter, setStyleFilter] = useState("");
  const [sortOrder, setSortOrder] = useState("recent");
  const [visibleCount, setVisibleCount] = useState(12);
  const [previewViewport, setPreviewViewport] = useState<"desktop" | "mobile">("desktop");
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<InvitationDocument | null>(null);
  const [selectedDraftTitle, setSelectedDraftTitle] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [blankCategory, setBlankCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [templateTitle, setTemplateTitle] = useState("");
  const [templateSlug, setTemplateSlug] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templateCategory, setTemplateCategory] = useState("");
  const [templateStyle, setTemplateStyle] = useState("");
  const [templatePrice, setTemplatePrice] = useState("0");
  const [templateDocument, setTemplateDocument] = useState(() =>
    JSON.stringify(createBlankInvitationDocument("Nama Acara"), null, 2),
  );
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [licenseNote, setLicenseNote] = useState("");
  const [versionTemplateId, setVersionTemplateId] = useState("");
  const [versionDocument, setVersionDocument] = useState("");
  const [versionNote, setVersionNote] = useState("");

  const refresh = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError("");
    const [templateResult, categoryResult, styleResult] = await Promise.all([
      client
        .from("templates")
        .select(
          "id,slug,title,description,category_id,style_id,base_price,currency,current_version_id,thumbnail_asset_id",
        )
        .order("created_at", { ascending: false }),
      client.from("categories").select("id,name_i18n").eq("is_active", true).order("sort_order"),
      client.from("design_styles").select("id,name_i18n").eq("is_active", true).order("sort_order"),
    ]);
    const firstError = templateResult.error || categoryResult.error || styleResult.error;
    if (firstError) setError(firstError.message);
    const nextTemplates = (templateResult.data || []) as Template[];
    setTemplates(nextTemplates);
    setCategories((categoryResult.data || []) as CatalogItem[]);
    setStyles((styleResult.data || []) as CatalogItem[]);
    const assetIds = nextTemplates
      .map((item) => item.thumbnail_asset_id)
      .filter((id): id is string => Boolean(id));
    if (assetIds.length) {
      const { data: assets } = await client
        .from("media_assets")
        .select("id,object_path,storage_bucket")
        .in("id", assetIds);
      const urls: Record<string, string> = {};
      for (const asset of assets || []) {
        if (asset.storage_bucket === "template-assets") {
          urls[asset.id] = client.storage
            .from("template-assets")
            .getPublicUrl(asset.object_path).data.publicUrl;
        }
      }
      setThumbnails(urls);
    } else {
      setThumbnails({});
    }
    if (userId) {
      const { data: ownedDrafts, error: draftError } = await client
        .from("invitations")
        .select("id,title,status,draft_version_id,updated_at")
        .eq("owner_user_id", userId)
        .eq("status", "draft")
        .order("updated_at", { ascending: false });
      if (draftError) setError(draftError.message);
      setDrafts((ownedDrafts || []) as Draft[]);
    } else {
      setDrafts([]);
    }
    setLoading(false);
  }, [client, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filteredTemplates = useMemo(() => {
    const filtered = templates.filter((item) => {
      const query = search.trim().toLocaleLowerCase("id-ID");
      const matchesQuery =
        !query ||
        [item.title, item.description, item.slug].some((value) =>
          value.toLocaleLowerCase("id-ID").includes(query),
        );
      return (
        matchesQuery &&
        (!categoryFilter || item.category_id === categoryFilter) &&
        (!styleFilter || item.style_id === styleFilter)
      );
    });
    if (sortOrder === "title") {
      filtered.sort((a, b) => a.title.localeCompare(b.title, "id-ID"));
    } else if (sortOrder === "price-asc") {
      filtered.sort((a, b) => a.base_price - b.base_price);
    } else if (sortOrder === "price-desc") {
      filtered.sort((a, b) => b.base_price - a.base_price);
    }
    return filtered;
  }, [templates, search, categoryFilter, styleFilter, sortOrder]);
  const visibleTemplates = useMemo(
    () => filteredTemplates.slice(0, visibleCount),
    [filteredTemplates, visibleCount],
  );

  useEffect(() => {
    setVisibleCount(12);
  }, [search, categoryFilter, styleFilter, sortOrder]);

  const openTemplate = useCallback(
    async (template: Template) => {
      setSelectedTemplate(template);
      setSelectedDocument(null);
      setNewTitle(template.title);
      setError("");
      if (!client || !template.current_version_id) return;
      const { data, error: versionError } = await client
        .from("template_versions")
        .select("document")
        .eq("id", template.current_version_id)
        .maybeSingle();
      if (versionError) setError(versionError.message);
      else if (data && isInvitationDocument(data.document)) setSelectedDocument(data.document);
      else setError("Versi template tidak memakai skema dokumen yang didukung.");
    },
    [client],
  );

  useEffect(() => {
    if (!initialTemplateSlug || loading) return;
    const template = templates.find((item) => item.slug === initialTemplateSlug);
    if (template) void openTemplate(template);
    else setError("Template yang diminta tidak tersedia atau belum diterbitkan.");
  }, [initialTemplateSlug, loading, templates, openTemplate]);

  async function createDraft(template: Template | null) {
    if (!client || !userId) {
      setError("Masuk terlebih dahulu untuk membuat dan menyimpan draft.");
      return;
    }
    const categoryId = template?.category_id || blankCategory;
    if (!categoryId) {
      setError("Pilih kategori acara untuk kanvas kosong.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    const { data, error: createError } = await client.rpc("create_invitation_draft", {
      p_title: newTitle.trim() || template?.title || "Undangan baru",
      p_event_category_id: categoryId,
      p_template_id: template?.id || null,
    });
    if (createError) setError(createError.message);
    else {
      setNotice("Draft undangan berhasil dibuat dan tersimpan.");
      setSelectedTemplate(null);
      await refresh();
      await openDraft(String(data));
    }
    setSaving(false);
  }

  async function openDraft(id: string) {
    if (!client) return;
    setError("");
    const draft = drafts.find((item) => item.id === id);
    const { data: invitation, error: invitationError } = await client
      .from("invitations")
      .select("title,draft_version_id")
      .eq("id", id)
      .maybeSingle();
    if (invitationError || !invitation) {
      setError(invitationError?.message || "Draft tidak ditemukan atau bukan milik akun ini.");
      return;
    }
    setSelectedDraftTitle(invitation.title);
    if (!invitation.draft_version_id) {
      setError("Draft belum memiliki versi dokumen.");
      return;
    }
    const { data: version, error: versionError } = await client
      .from("invitation_versions")
      .select("document")
      .eq("id", invitation.draft_version_id)
      .maybeSingle();
    if (versionError) setError(versionError.message);
    else if (version && isInvitationDocument(version.document))
      setSelectedDocument(version.document);
    else setError("Dokumen draft tidak valid.");
    if (draft) setNotice("Draft berhasil dibuka.");
  }

  async function createTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || !userId) return;
    setSaving(true);
    setError("");
    setNotice("");
    let thumbnailAssetId: string | null = null;
    try {
      const parsed: unknown = JSON.parse(templateDocument);
      if (!isInvitationDocument(parsed))
        throw new Error("Dokumen harus memakai schemaVersion 1 dan memiliki pages atau sections.");
      if (templateFile) {
        if (
          !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(templateFile.type) ||
          templateFile.size > 15 * 1024 * 1024
        ) {
          throw new Error(
            "Gambar pratinjau harus JPG, PNG, WebP, atau AVIF dengan ukuran maksimal 15 MB.",
          );
        }
        if (!licenseNote.trim()) throw new Error("Catatan lisensi aset wajib diisi.");
        const safeName = templateFile.name.replace(/[^a-zA-Z0-9._-]/g, "-");
        const objectPath = `templates/${templateSlug}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await client.storage
          .from("template-assets")
          .upload(objectPath, templateFile, { contentType: templateFile.type, upsert: false });
        if (uploadError) throw uploadError;
        const { data: asset, error: assetError } = await client
          .from("media_assets")
          .insert({
            owner_user_id: userId,
            storage_bucket: "template-assets",
            object_path: objectPath,
            media_type: "image",
            mime_type: templateFile.type,
            byte_size: templateFile.size,
            visibility: "template",
            processing_status: "ready",
            license_metadata: { source: "admin_upload", note: licenseNote.trim() },
          })
          .select("id")
          .single();
        if (assetError) throw assetError;
        thumbnailAssetId = asset.id;
      }
      const { error: saveError } = await client.rpc("admin_create_template", {
        p_slug: templateSlug.trim(),
        p_title: templateTitle.trim(),
        p_description: templateDescription.trim(),
        p_category_id: templateCategory,
        p_style_id: templateStyle,
        p_base_price: Math.max(0, Math.round(Number(templatePrice) || 0)),
        p_document: parsed,
        p_thumbnail_asset_id: thumbnailAssetId,
      });
      if (saveError) throw saveError;
      setNotice("Template dan versi awal disimpan sebagai draft dan menunggu moderasi admin.");
      setTemplateTitle("");
      setTemplateSlug("");
      setTemplateDescription("");
      setTemplateFile(null);
      setLicenseNote("");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Template gagal disimpan.");
    } finally {
      setSaving(false);
    }
  }

  async function createTemplateVersion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || !versionTemplateId) return;
    setSaving(true);
    setError("");
    try {
      const parsed: unknown = JSON.parse(versionDocument);
      if (!isInvitationDocument(parsed))
        throw new Error("Dokumen harus memakai schemaVersion 1 dan memiliki pages atau sections.");
      const { error: versionError } = await client.rpc("admin_create_template_version", {
        p_template_id: versionTemplateId,
        p_document: parsed,
        p_change_note: versionNote.trim() || null,
      });
      if (versionError) throw versionError;
      setNotice(
        "Versi template baru disimpan sebagai draft untuk ditinjau. Template tidak tampil di marketplace sampai disetujui.",
      );
      setVersionTemplateId("");
      setVersionDocument("");
      setVersionNote("");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Versi baru gagal disimpan.");
    } finally {
      setSaving(false);
    }
  }

  const categoryName = (id: string) =>
    categories.find((item) => item.id === id)?.name_i18n?.["id-ID"] || "Kategori";
  const styleName = (id: string) =>
    styles.find((item) => item.id === id)?.name_i18n?.["id-ID"] || "Gaya";

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#a36d55]">Marketplace</p>
          <h2 className="mt-1 text-2xl font-semibold">Jelajahi template undangan</h2>
          <p className="mt-1 text-sm text-[#76675f]">
            Pilih desain atau mulai dari kanvas kosong. Draft dapat dibuat tanpa pembayaran.
          </p>
        </div>
        <div className="flex items-center gap-4">
          {!userId && (
            <a className="text-sm font-semibold text-[#754b3b] underline" href="/">
              Masuk untuk menyimpan draft
            </a>
          )}
          <a className="text-sm font-semibold text-[#754b3b] underline" href="/templates">
            Buka halaman marketplace
          </a>
        </div>
      </div>

      {(notice || error) && (
        <p
          role={error ? "alert" : "status"}
          className={`rounded-xl px-4 py-3 text-sm ${error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-800"}`}
        >
          {error || notice}
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_180px_180px]">
        <input
          aria-label="Cari template"
          className="w-full rounded-xl border border-[#ddcec3] bg-white px-4 py-3"
          placeholder="Cari nama atau deskripsi template..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          aria-label="Filter kategori"
          className="rounded-xl border border-[#ddcec3] bg-white px-4 py-3"
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
        >
          <option value="">Semua kategori</option>
          {categories.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name_i18n?.["id-ID"] || "Kategori"}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter gaya"
          className="rounded-xl border border-[#ddcec3] bg-white px-4 py-3"
          value={styleFilter}
          onChange={(event) => setStyleFilter(event.target.value)}
        >
          <option value="">Semua gaya</option>
          {styles.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name_i18n?.["id-ID"] || "Gaya"}
            </option>
          ))}
        </select>
        <select
          aria-label="Urutkan template"
          className="rounded-xl border border-[#ddcec3] bg-white px-4 py-3"
          value={sortOrder}
          onChange={(event) => setSortOrder(event.target.value)}
        >
          <option value="recent">Terbaru</option>
          <option value="title">Nama A-Z</option>
          <option value="price-asc">Harga terendah</option>
          <option value="price-desc">Harga tertinggi</option>
        </select>
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-[#76675f]">Memuat marketplace...</p>
      ) : filteredTemplates.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleTemplates.map((template) => (
            <article
              key={template.id}
              className="overflow-hidden rounded-2xl border border-[#eaded5] bg-white"
            >
              {template.thumbnail_asset_id && thumbnails[template.thumbnail_asset_id] ? (
                <img
                  className="aspect-[4/3] w-full object-cover"
                  src={thumbnails[template.thumbnail_asset_id]}
                  alt={`Pratinjau ${template.title}`}
                  loading="lazy"
                />
              ) : (
                <div className="flex aspect-[4/3] items-center justify-center bg-[#f4eae2] text-sm text-[#8a6c5d]">
                  Pratinjau template
                </div>
              )}
              <div className="space-y-3 p-5">
                <div>
                  <h3 className="font-semibold">{template.title}</h3>
                  <p className="mt-1 text-xs text-[#887970]">
                    {categoryName(template.category_id)} · {styleName(template.style_id)}
                  </p>
                </div>
                <p className="line-clamp-2 text-sm text-[#76675f]">
                  {template.description || "Template undangan digital."}
                </p>
                <div className="flex items-center justify-between gap-3">
                  <strong className="text-sm">
                    {currency(template.base_price, template.currency)}
                  </strong>
                  <a
                    className="rounded-lg border border-[#ddcec3] px-3 py-2 text-sm font-semibold"
                    href={`/templates/${template.slug}`}
                  >
                    Detail template
                  </a>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[#ddcec3] bg-white p-8 text-center">
          <h3 className="font-semibold">Belum ada template tersedia</h3>
          <p className="mt-2 text-sm text-[#76675f]">
            Template yang sudah ditinjau dan diterbitkan admin akan muncul di sini.
          </p>
        </div>
      )}
      {!loading && visibleCount < filteredTemplates.length && (
        <div className="flex justify-center">
          <button
            className="rounded-xl border border-[#ddcec3] bg-white px-5 py-3 text-sm font-semibold"
            onClick={() => setVisibleCount((count) => count + 12)}
          >
            Muat lebih banyak template
          </button>
        </div>
      )}

      <section className="rounded-2xl border border-[#eaded5] bg-white p-5 sm:p-6">
        <h3 className="text-lg font-semibold">Mulai dari kanvas kosong</h3>
        <p className="mt-1 text-sm text-[#76675f]">
          Draft akan disimpan ke akun Anda. Fitur penyuntingan visual lengkap tersedia pada fase
          berikutnya.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px_auto]">
          <input
            aria-label="Judul undangan kosong"
            className="rounded-xl border border-[#ddcec3] px-4 py-3"
            placeholder="Contoh: Pernikahan Dina & Raka"
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
          />
          <select
            aria-label="Kategori kanvas kosong"
            className="rounded-xl border border-[#ddcec3] px-4 py-3"
            value={blankCategory}
            onChange={(event) => setBlankCategory(event.target.value)}
          >
            <option value="">Pilih kategori acara</option>
            {categories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name_i18n?.["id-ID"] || "Kategori"}
              </option>
            ))}
          </select>
          <button
            disabled={saving || !userId}
            className="rounded-xl bg-[#754b3b] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
            onClick={() => void createDraft(null)}
          >
            {saving ? "Menyimpan..." : "Buat draft kosong"}
          </button>
        </div>
      </section>

      {userId && (
        <section className="rounded-2xl border border-[#eaded5] bg-white p-5 sm:p-6">
          <h3 className="text-lg font-semibold">Draft undangan saya</h3>
          {drafts.length ? (
            <ul className="mt-4 divide-y divide-[#f0e7e1]">
              {drafts.map((draft) => (
                <li
                  key={draft.id}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">{draft.title}</p>
                    <p className="text-xs text-[#887970]">
                      Terakhir diperbarui {new Date(draft.updated_at).toLocaleString("id-ID")}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={`/editor/${draft.id}`}
                      className="rounded-lg bg-[#754b3b] px-3 py-2 text-sm font-semibold text-white"
                    >
                      Buka editor
                    </a>
                    <button
                      className="rounded-lg border border-[#ddcec3] px-3 py-2 text-sm font-semibold"
                      onClick={() => void openDraft(draft.id)}
                    >
                      Pratinjau
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-[#76675f]">
              Belum ada draft. Pilih template atau mulai dari kanvas kosong.
            </p>
          )}
        </section>
      )}

      {isAdmin && (
        <section className="rounded-2xl border border-[#eaded5] bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">Pengelolaan template</h3>
              <p className="text-sm text-[#76675f]">
                Hanya admin dengan izin templates.manage yang dapat membuat draft template. Publikasi dilakukan setelah moderasi.
              </p>
            </div>
            <button
              className="rounded-lg border border-[#ddcec3] px-3 py-2 text-sm font-semibold"
              onClick={() => setShowTemplateForm((value) => !value)}
            >
              {showTemplateForm ? "Tutup" : "Tambah template"}
            </button>
          </div>
          {showTemplateForm && (
            <form
              className="mt-5 grid gap-3 md:grid-cols-2"
              onSubmit={(event) => void createTemplate(event)}
            >
              <label className="text-sm font-medium">
                Nama template
                <input
                  required
                  maxLength={120}
                  className="mt-1 w-full rounded-lg border border-[#ddcec3] px-3 py-2"
                  value={templateTitle}
                  onChange={(event) => setTemplateTitle(event.target.value)}
                />
              </label>
              <label className="text-sm font-medium">
                Slug
                <input
                  required
                  pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                  className="mt-1 w-full rounded-lg border border-[#ddcec3] px-3 py-2"
                  value={templateSlug}
                  onChange={(event) => setTemplateSlug(event.target.value)}
                />
              </label>
              <label className="text-sm font-medium">
                Kategori
                <select
                  required
                  className="mt-1 w-full rounded-lg border border-[#ddcec3] px-3 py-2"
                  value={templateCategory}
                  onChange={(event) => setTemplateCategory(event.target.value)}
                >
                  <option value="">Pilih kategori</option>
                  {categories.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name_i18n?.["id-ID"] || "Kategori"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium">
                Gaya
                <select
                  required
                  className="mt-1 w-full rounded-lg border border-[#ddcec3] px-3 py-2"
                  value={templateStyle}
                  onChange={(event) => setTemplateStyle(event.target.value)}
                >
                  <option value="">Pilih gaya</option>
                  {styles.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name_i18n?.["id-ID"] || "Gaya"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium">
                Harga dasar (IDR)
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="mt-1 w-full rounded-lg border border-[#ddcec3] px-3 py-2"
                  value={templatePrice}
                  onChange={(event) => setTemplatePrice(event.target.value)}
                />
              </label>
              <label className="text-sm font-medium">
                Gambar pratinjau (opsional)
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  className="mt-1 block w-full text-sm"
                  onChange={(event) => setTemplateFile(event.target.files?.[0] || null)}
                />
              </label>
              <label className="text-sm font-medium md:col-span-2">
                Deskripsi
                <textarea
                  maxLength={2000}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-[#ddcec3] px-3 py-2"
                  value={templateDescription}
                  onChange={(event) => setTemplateDescription(event.target.value)}
                />
              </label>
              {templateFile && (
                <label className="text-sm font-medium md:col-span-2">
                  Catatan lisensi/sumber gambar
                  <textarea
                    required
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-[#ddcec3] px-3 py-2"
                    value={licenseNote}
                    onChange={(event) => setLicenseNote(event.target.value)}
                    placeholder="Jelaskan sumber dan izin penggunaan aset."
                  />
                </label>
              )}
              <label className="text-sm font-medium md:col-span-2">
                Dokumen template (JSON schema versi 1)
                <textarea
                  required
                  rows={10}
                  className="mt-1 w-full rounded-lg border border-[#ddcec3] px-3 py-2 font-mono text-xs"
                  value={templateDocument}
                  onChange={(event) => setTemplateDocument(event.target.value)}
                />
              </label>
              <button
                disabled={saving}
                className="rounded-xl bg-[#754b3b] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50 md:col-span-2"
              >
                {saving ? "Menyimpan..." : "Simpan sebagai draft"}
              </button>
            </form>
          )}
          <form
            className="mt-6 grid gap-3 border-t border-[#f0e7e1] pt-5"
            onSubmit={(event) => void createTemplateVersion(event)}
          >
            <h4 className="font-semibold">Buat versi template untuk ditinjau</h4>
            <select
              required
              className="rounded-lg border border-[#ddcec3] px-3 py-2"
              value={versionTemplateId}
              onChange={async (event) => {
                const id = event.target.value;
                setVersionTemplateId(id);
                const template = templates.find((item) => item.id === id);
                if (client && template?.current_version_id) {
                  const { data } = await client
                    .from("template_versions")
                    .select("document")
                    .eq("id", template.current_version_id)
                    .maybeSingle();
                  if (data?.document) setVersionDocument(JSON.stringify(data.document, null, 2));
                }
              }}
            >
              <option value="">Pilih template</option>
              {templates.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
            <input
              className="rounded-lg border border-[#ddcec3] px-3 py-2"
              value={versionNote}
              onChange={(event) => setVersionNote(event.target.value)}
              placeholder="Catatan perubahan versi"
            />
            <textarea
              required
              rows={8}
              className="rounded-lg border border-[#ddcec3] px-3 py-2 font-mono text-xs"
              value={versionDocument}
              onChange={(event) => setVersionDocument(event.target.value)}
              placeholder="Pilih template untuk memuat dokumen versi saat ini."
            />
            <button
              disabled={saving || !versionTemplateId}
              className="rounded-xl border border-[#754b3b] px-5 py-3 text-sm font-semibold text-[#754b3b] disabled:opacity-50"
            >
              {saving ? "Menyimpan..." : "Simpan versi draft baru"}
            </button>
          </form>
        </section>
      )}

      {selectedTemplate && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-5"
          role="dialog"
          aria-modal="true"
          aria-label="Detail template"
        >
          <section className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-[#fffaf6] p-5 sm:rounded-3xl sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#a36d55]">
                  Detail template
                </p>
                <h3 className="mt-1 text-2xl font-semibold">{selectedTemplate.title}</h3>
                <p className="mt-1 text-sm text-[#76675f]">
                  {categoryName(selectedTemplate.category_id)} ·{" "}
                  {styleName(selectedTemplate.style_id)}
                </p>
              </div>
              {initialTemplateSlug ? (
                <a className="rounded-lg border border-[#ddcec3] px-3 py-2" href="/templates">
                  Kembali ke marketplace
                </a>
              ) : (
                <button
                  aria-label="Tutup detail"
                  className="rounded-lg border border-[#ddcec3] px-3 py-2"
                  onClick={() => setSelectedTemplate(null)}
                >
                  Tutup
                </button>
              )}
            </div>
            <p className="mt-4 text-sm leading-6 text-[#76675f]">{selectedTemplate.description}</p>
            <div className="mt-5 rounded-2xl border border-[#eaded5] bg-white p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#887970]">
                  Pratinjau desain
                </p>
                <div className="flex gap-2">
                  <button
                    className={`rounded-lg border px-3 py-1.5 text-xs ${previewViewport === "desktop" ? "border-[#754b3b] bg-[#f7eee8] font-semibold" : "border-[#ddcec3]"}`}
                    aria-pressed={previewViewport === "desktop"}
                    onClick={() => setPreviewViewport("desktop")}
                  >
                    Desktop
                  </button>
                  <button
                    className={`rounded-lg border px-3 py-1.5 text-xs ${previewViewport === "mobile" ? "border-[#754b3b] bg-[#f7eee8] font-semibold" : "border-[#ddcec3]"}`}
                    aria-pressed={previewViewport === "mobile"}
                    onClick={() => setPreviewViewport("mobile")}
                  >
                    Ponsel
                  </button>
                </div>
              </div>
              <div
                className={`mx-auto transition-all ${previewViewport === "mobile" ? "max-w-sm" : "max-w-3xl"}`}
              >
                {selectedDocument ? (
                  <InvitationDocumentView document={selectedDocument} client={client} />
                ) : (
                  <p className="p-6 text-sm text-[#76675f]">Memuat pratinjau...</p>
                )}
              </div>
            </div>
            <p className="mt-4 font-semibold">
              {currency(selectedTemplate.base_price, selectedTemplate.currency)}
            </p>
            {userId && (
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <input
                  aria-label="Judul undangan"
                  className="min-w-0 flex-1 rounded-xl border border-[#ddcec3] bg-white px-4 py-3"
                  value={newTitle}
                  onChange={(event) => setNewTitle(event.target.value)}
                />
                <button
                  disabled={saving}
                  className="rounded-xl bg-[#754b3b] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
                  onClick={() => void createDraft(selectedTemplate)}
                >
                  {saving ? "Membuat..." : "Gunakan template"}
                </button>
              </div>
            )}
            {!userId && (
              <p className="mt-4 text-sm text-[#76675f]">
                Masuk untuk membuat draft dari template ini.
              </p>
            )}
          </section>
        </div>
      )}

      {selectedDocument && !selectedTemplate && selectedDraftTitle && (
        <section className="rounded-2xl border border-[#eaded5] bg-white p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-[#a36d55]">
                Pratinjau draft
              </p>
              <h3 className="text-lg font-semibold">{selectedDraftTitle}</h3>
            </div>
            <button
              className="rounded-lg border border-[#ddcec3] px-3 py-2 text-sm"
              onClick={() => {
                setSelectedDocument(null);
                setSelectedDraftTitle("");
              }}
            >
              Tutup pratinjau
            </button>
          </div>
          <div className="mt-4 rounded-xl bg-[#fffaf6] p-2">
            <InvitationDocumentView document={selectedDocument} client={client} />
          </div>
        </section>
      )}
    </section>
  );
}
