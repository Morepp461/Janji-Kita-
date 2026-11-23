import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { InvitationDocument, InvitationNode } from "../invitations/document";
import { addNode, getSections, updateNode } from "./editorModel";
import {
  IMPORT_COMPATIBILITY,
  classifyImport,
  sanitizeSvg,
  validateImportSignature,
  type ImportCapability,
} from "./importPipeline";

type Props = {
  client: SupabaseClient;
  invitationId: string;
  ownerUserId: string;
  userId: string;
  invitationDocument: InvitationDocument;
  onDocumentChange: (document: InvitationDocument) => void;
};

type Guest = { id: string; display_name: string };
type SeatingTable = { id: string; label: string; capacity: number; sort_order: number };
type SeatingAssignment = { guest_id: string; seating_table_id: string; seat_label: string | null };
type ImportReport = {
  source: string;
  format: string;
  status: "imported" | "preview_only" | "unsupported" | "rejected";
  editableObjects: number;
  flattenedElements: number;
  skippedElements: number;
  warnings: string[];
  fallback: string;
};

const capabilityLabel: Record<ImportCapability, string> = {
  supported: "Didukung",
  preview_only: "Pratinjau saja",
  unsupported: "Belum didukung",
  disabled: "Dinonaktifkan",
};

function findFirstNode(nodes: InvitationNode[], type: string): InvitationNode | undefined {
  for (const node of nodes) {
    if (node.type === type) return node;
    const nested = findFirstNode(node.children || [], type);
    if (nested) return nested;
  }
  return undefined;
}

function safeHttpsUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      Boolean(parsed.hostname) &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}

async function optimizeImportedImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width < 1 || bitmap.height < 1 || bitmap.width > 12000 || bitmap.height > 12000)
      throw new Error("Dimensi gambar tidak valid atau terlalu besar.");
    const scale = Math.min(1, 1920 / bitmap.width, 1920 / bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Pemrosesan gambar tidak tersedia pada peramban ini.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error("Gambar gagal dioptimalkan."))),
        "image/webp",
        0.82,
      ),
    );
    return new File([blob], file.name.replace(/\.[^.]+$/, ".webp"), { type: "image/webp" });
  } finally {
    bitmap.close();
  }
}

export default function PhaseEightPanel({
  client,
  invitationId,
  ownerUserId,
  userId,
  invitationDocument,
  onDocumentChange,
}: Props) {
  const [tab, setTab] = useState<"import" | "seating" | "livestream">("import");
  const [reports, setReports] = useState<ImportReport[]>([]);
  const [importing, setImporting] = useState(false);
  const [pdfPreview, setPdfPreview] = useState<{ name: string; url: string } | null>(null);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [tables, setTables] = useState<SeatingTable[]>([]);
  const [assignments, setAssignments] = useState<SeatingAssignment[]>([]);
  const [loadingSeating, setLoadingSeating] = useState(false);
  const [seatingError, setSeatingError] = useState("");
  const [tableLabel, setTableLabel] = useState("");
  const [tableCapacity, setTableCapacity] = useState("8");
  const [savingTable, setSavingTable] = useState(false);
  const [livestreamUrl, setLivestreamUrl] = useState("");
  const [livestreamLabel, setLivestreamLabel] = useState("Tonton siaran langsung");
  const [livestreamNotice, setLivestreamNotice] = useState("");

  const assignedGuestIds = useMemo(
    () => new Set(assignments.map((assignment) => assignment.guest_id)),
    [assignments],
  );

  useEffect(() => {
    const node = findFirstNode(getSections(invitationDocument), "LivestreamLink");
    setLivestreamUrl(typeof node?.props?.url === "string" ? node.props.url : "");
    setLivestreamLabel(
      typeof node?.props?.label === "string" ? node.props.label : "Tonton siaran langsung",
    );
  }, [invitationDocument]);

  useEffect(() => {
    return () => {
      if (pdfPreview) URL.revokeObjectURL(pdfPreview.url);
    };
  }, [pdfPreview]);

  async function loadSeating() {
    setLoadingSeating(true);
    setSeatingError("");
    const [guestResult, tableResult, assignmentResult] = await Promise.all([
      client
        .from("guests")
        .select("id,display_name")
        .eq("invitation_id", invitationId)
        .order("display_name"),
      client
        .from("seating_tables")
        .select("id,label,capacity,sort_order")
        .eq("invitation_id", invitationId)
        .order("sort_order")
        .order("created_at"),
      client
        .from("seating_assignments")
        .select("guest_id,seating_table_id,seat_label")
        .eq("invitation_id", invitationId),
    ]);
    const failure = guestResult.error || tableResult.error || assignmentResult.error;
    if (failure) {
      setSeatingError(failure.message);
    } else {
      setGuests((guestResult.data || []) as Guest[]);
      setTables((tableResult.data || []) as SeatingTable[]);
      setAssignments((assignmentResult.data || []) as SeatingAssignment[]);
    }
    setLoadingSeating(false);
  }

  useEffect(() => {
    if (tab === "seating" && ownerUserId === userId) void loadSeating();
    // Reload only when the owner opens the seating planner.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, invitationId, ownerUserId, userId]);

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImporting(true);
    setPdfPreview((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
    const compatibility = classifyImport(file.name);
    const report: ImportReport = {
      source: file.name,
      format: compatibility.label,
      status: "unsupported",
      editableObjects: 0,
      flattenedElements: 0,
      skippedElements: 0,
      warnings: [],
      fallback: compatibility.fallback,
    };

    try {
      if (file.size > 50 * 1024 * 1024) throw new Error("Ukuran berkas melebihi batas 50 MB.");
      if (compatibility.capability === "unsupported" || compatibility.capability === "disabled") {
        report.status = "unsupported";
        report.skippedElements = 1;
        report.warnings.push(compatibility.output);
        setReports((items) => [report, ...items].slice(0, 8));
        return;
      }

      if (compatibility.format === "pdf") {
        const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer());
        if (!validateImportSignature(signature, "pdf"))
          throw new Error("Isi berkas tidak sesuai dengan format PDF.");
        const url = URL.createObjectURL(file);
        setPdfPreview({ name: file.name, url });
        report.status = "preview_only";
        report.skippedElements = 1;
        report.warnings.push(
          "Pratinjau menggunakan penampil PDF bawaan peramban dan tidak mengunggah berkas.",
        );
        setReports((items) => [report, ...items].slice(0, 8));
        return;
      }

      let sourceFile = file;
      if (compatibility.format === "svg") {
        const sanitized = sanitizeSvg(await file.text());
        sourceFile = new File([sanitized.markup], file.name, { type: "image/svg+xml" });
        if (sanitized.removed)
          report.warnings.push(
            `${sanitized.removed} elemen/atribut SVG berisiko dihapus saat sanitasi.`,
          );
      } else {
        const format = compatibility.format;
        if (
          (format !== "png" && format !== "jpg") ||
          !validateImportSignature(new Uint8Array(await file.slice(0, 16).arrayBuffer()), format)
        ) {
          throw new Error("Isi berkas tidak sesuai dengan format gambar yang dinyatakan.");
        }
      }

      const optimized = await optimizeImportedImage(sourceFile);
      const bucket = "user-uploads-private";
      const objectPath =
        ownerUserId +
        "/" +
        invitationId +
        "/" +
        crypto.randomUUID() +
        "-" +
        optimized.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const { error: uploadError } = await client.storage
        .from(bucket)
        .upload(objectPath, optimized, {
          contentType: "image/webp",
          upsert: false,
          cacheControl: "3600",
        });
      if (uploadError) throw uploadError;

      const { data: asset, error: assetError } = await client
        .from("media_assets")
        .insert({
          owner_user_id: ownerUserId,
          storage_bucket: bucket,
          object_path: objectPath,
          media_type: "image",
          mime_type: "image/webp",
          byte_size: optimized.size,
          visibility: "private",
          processing_status: "ready",
        })
        .select("id")
        .single();
      if (assetError) {
        await client.storage.from(bucket).remove([objectPath]);
        throw assetError;
      }

      const withImage = addNode(invitationDocument, "Image");
      const imageNode = getSections(withImage).slice(-1)[0];
      const nextDocument = imageNode
        ? updateNode(withImage, imageNode.id, (node) => ({
            ...node,
            props: { ...(node.props || {}), assetId: asset.id, alt: file.name },
          }))
        : withImage;
      onDocumentChange(nextDocument);
      report.status = "imported";
      report.editableObjects = 1;
      report.flattenedElements = 1;
      report.warnings.push(
        "Konten grafis diimpor sebagai satu aset gambar, bukan layer vektor yang dapat diedit.",
      );
      setReports((items) => [report, ...items].slice(0, 8));
    } catch (error) {
      report.status = "rejected";
      report.skippedElements = 1;
      report.warnings.push(error instanceof Error ? error.message : "Berkas gagal diproses.");
      setReports((items) => [report, ...items].slice(0, 8));
    } finally {
      setImporting(false);
    }
  }

  async function createSeatingTable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const capacity = Number(tableCapacity);
    if (!tableLabel.trim() || !Number.isInteger(capacity) || capacity < 1 || capacity > 1000) {
      setSeatingError("Nama meja wajib diisi dan kapasitas harus 1–1000.");
      return;
    }
    setSavingTable(true);
    setSeatingError("");
    const { error } = await client.from("seating_tables").insert({
      invitation_id: invitationId,
      label: tableLabel.trim(),
      capacity,
      sort_order: tables.length,
    });
    if (error) setSeatingError(error.message);
    else {
      setTableLabel("");
      await loadSeating();
    }
    setSavingTable(false);
  }

  async function assignGuest(guestId: string, tableId: string) {
    setSeatingError("");
    const result = tableId
      ? await client
          .from("seating_assignments")
          .upsert(
            { invitation_id: invitationId, guest_id: guestId, seating_table_id: tableId },
            { onConflict: "invitation_id,guest_id" },
          )
      : await client
          .from("seating_assignments")
          .delete()
          .eq("invitation_id", invitationId)
          .eq("guest_id", guestId);
    if (result.error) setSeatingError(result.error.message);
    else await loadSeating();
  }

  async function removeTable(tableId: string) {
    setSeatingError("");
    const { error } = await client
      .from("seating_tables")
      .delete()
      .eq("invitation_id", invitationId)
      .eq("id", tableId);
    if (error) setSeatingError(error.message);
    else await loadSeating();
  }

  function saveLivestream(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!safeHttpsUrl(livestreamUrl.trim())) {
      setLivestreamNotice(
        "Gunakan URL HTTPS yang valid. Tautan dibuka di tab baru, bukan disematkan.",
      );
      return;
    }
    const existing = findFirstNode(getSections(invitationDocument), "LivestreamLink");
    let nextDocument = invitationDocument;
    if (existing) {
      nextDocument = updateNode(invitationDocument, existing.id, (node) => ({
        ...node,
        props: {
          ...(node.props || {}),
          url: livestreamUrl.trim(),
          label: livestreamLabel.trim() || "Tonton siaran langsung",
        },
      }));
    } else {
      nextDocument = addNode(invitationDocument, "LivestreamLink");
      const added = getSections(nextDocument).slice(-1)[0];
      if (added) {
        nextDocument = updateNode(nextDocument, added.id, (node) => ({
          ...node,
          props: {
            ...(node.props || {}),
            url: livestreamUrl.trim(),
            label: livestreamLabel.trim() || "Tonton siaran langsung",
          },
        }));
      }
    }
    onDocumentChange(nextDocument);
    setLivestreamNotice(
      "Tautan siaran langsung disimpan ke draft. Terbitkan ulang undangan untuk menampilkannya.",
    );
  }

  if (ownerUserId !== userId) return null;

  return (
    <section id="phase-eight" className="border-t border-[#eaded5] bg-[#fffaf6] px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4">
          <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#a36d55]">
            Fase 8 · Pengalaman lanjutan
          </p>
          <h2 className="mt-1 text-lg font-semibold">Impor, tempat duduk, dan siaran langsung</h2>
          <p className="mt-1 text-xs text-[#887970]">
            Konversi impor mengikuti kemampuan parser yang tersedia. Berkas sumber tidak dijalankan
            sebagai kode.
          </p>
        </div>

        <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Fitur lanjutan">
          {(
            [
              ["import", "Impor desain"],
              ["seating", "Perencana tempat duduk"],
              ["livestream", "Siaran langsung"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={`rounded-lg px-3 py-2 text-xs font-semibold ${tab === value ? "bg-[#754b3b] text-white" : "border border-[#ddcec3] bg-white"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "import" && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div className="rounded-2xl border border-[#eaded5] bg-white p-4">
              <h3 className="text-sm font-semibold">Impor berkas</h3>
              <label className="mt-3 block cursor-pointer rounded-xl border border-dashed border-[#bda99c] p-5 text-center text-xs font-semibold">
                {importing
                  ? "Memproses berkas..."
                  : "Pilih SVG, PDF, PNG, JPG, PSD, AI, Affinity, atau PPTX"}
                <input
                  className="sr-only"
                  type="file"
                  accept=".svg,.pdf,.png,.jpg,.jpeg,.psd,.ai,.afdesign,.afphoto,.afpub,.pptx"
                  disabled={importing}
                  onChange={(event) => void importFile(event)}
                />
              </label>
              <p className="mt-2 text-[11px] leading-5 text-[#887970]">
                Maksimal 50 MB. SVG disanitasi dan dirasterisasi. PDF hanya dipratinjau secara
                lokal. Format yang belum didukung tidak diunggah.
              </p>
              {pdfPreview && (
                <a
                  className="mt-3 inline-flex rounded-lg bg-[#754b3b] px-3 py-2 text-xs font-semibold text-white"
                  href={pdfPreview.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Buka pratinjau {pdfPreview.name}
                </a>
              )}
              {reports.length > 0 && (
                <div className="mt-4 space-y-3" aria-live="polite">
                  <h4 className="text-xs font-bold">Laporan impor</h4>
                  {reports.map((report, index) => (
                    <article
                      key={report.source + index}
                      className="rounded-xl bg-[#f7f2ee] p-3 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <strong className="break-all">{report.source}</strong>
                        <span className="rounded-full bg-white px-2 py-1">
                          {report.status.replace("_", " ")}
                        </span>
                      </div>
                      <p className="mt-1 text-[#76675f]">Format sumber: {report.format}</p>
                      <p className="mt-2">
                        Objek editable: {report.editableObjects} · Diratakan:{" "}
                        {report.flattenedElements} · Dilewati: {report.skippedElements}
                      </p>
                      {report.warnings.map((warning) => (
                        <p key={warning} className="mt-1 text-amber-800">
                          {warning}
                        </p>
                      ))}
                      <p className="mt-1 text-[#76675f]">Fallback: {report.fallback}</p>
                    </article>
                  ))}
                </div>
              )}
            </div>
            <div className="overflow-hidden rounded-2xl border border-[#eaded5] bg-white">
              <div className="border-b border-[#eee4de] px-4 py-3">
                <h3 className="text-sm font-semibold">Matriks kompatibilitas</h3>
                <p className="mt-1 text-[11px] text-[#887970]">
                  Dukungan nyata, bukan janji konversi lossless.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-xs">
                  <thead className="bg-[#f7f2ee] text-[#76675f]">
                    <tr>
                      <th className="p-3">Format</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Hasil dan fallback</th>
                    </tr>
                  </thead>
                  <tbody>
                    {IMPORT_COMPATIBILITY.map((item) => (
                      <tr key={item.format} className="border-t border-[#eee4de] align-top">
                        <td className="p-3 font-semibold">{item.label}</td>
                        <td className="p-3">{capabilityLabel[item.capability]}</td>
                        <td className="p-3">
                          <p>{item.output}</p>
                          <p className="mt-1 text-[#887970]">Fallback: {item.fallback}</p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === "seating" && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div className="rounded-2xl border border-[#eaded5] bg-white p-4">
              <h3 className="text-sm font-semibold">Tambah meja</h3>
              <form
                onSubmit={(event) => void createSeatingTable(event)}
                className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_110px_auto]"
              >
                <input
                  aria-label="Nama meja"
                  value={tableLabel}
                  onChange={(event) => setTableLabel(event.target.value)}
                  maxLength={80}
                  placeholder="Contoh: Meja keluarga"
                  className="rounded-lg border border-[#ddcec3] px-3 py-2 text-sm"
                />
                <input
                  aria-label="Kapasitas meja"
                  type="number"
                  min="1"
                  max="1000"
                  value={tableCapacity}
                  onChange={(event) => setTableCapacity(event.target.value)}
                  className="rounded-lg border border-[#ddcec3] px-3 py-2 text-sm"
                />
                <button
                  disabled={savingTable}
                  className="rounded-lg bg-[#754b3b] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {savingTable ? "Menyimpan..." : "Tambah meja"}
                </button>
              </form>
              <p className="mt-2 text-[11px] text-[#887970]">
                Kapasitas diperiksa kembali di basis data untuk mencegah penempatan melebihi jumlah
                kursi.
              </p>
              <div className="mt-4 space-y-2">
                {tables.map((table) => {
                  const count = assignments.filter(
                    (assignment) => assignment.seating_table_id === table.id,
                  ).length;
                  return (
                    <div
                      key={table.id}
                      className="flex items-center justify-between gap-3 rounded-xl bg-[#f7f2ee] p-3 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold">{table.label}</p>
                        <p className="text-[#887970]">
                          {count}/{table.capacity} kursi terisi
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void removeTable(table.id)}
                        className="shrink-0 text-red-700 underline"
                      >
                        Hapus
                      </button>
                    </div>
                  );
                })}
                {!loadingSeating && tables.length === 0 && (
                  <p className="text-xs text-[#887970]">
                    Belum ada meja. Tambahkan meja untuk mulai mengatur tempat duduk.
                  </p>
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-[#eaded5] bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Penempatan tamu</h3>
                <span className="text-xs text-[#887970]">
                  {assignedGuestIds.size}/{guests.length} tamu ditempatkan
                </span>
              </div>
              {loadingSeating ? (
                <p className="mt-3 text-xs text-[#887970]">Memuat daftar tamu...</p>
              ) : (
                <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto">
                  {guests.map((guest) => {
                    const assignment = assignments.find((item) => item.guest_id === guest.id);
                    return (
                      <label
                        key={guest.id}
                        className="grid items-center gap-2 rounded-xl bg-[#f7f2ee] p-3 text-xs sm:grid-cols-[minmax(0,1fr)_minmax(150px,220px)]"
                      >
                        <span className="min-w-0 truncate font-medium">{guest.display_name}</span>
                        <select
                          aria-label={`Meja untuk ${guest.display_name}`}
                          value={assignment?.seating_table_id || ""}
                          onChange={(event) => void assignGuest(guest.id, event.target.value)}
                          className="min-w-0 rounded-lg border border-[#ddcec3] bg-white px-2 py-2"
                        >
                          <option value="">Belum ditempatkan</option>
                          {tables.map((table) => {
                            const count = assignments.filter(
                              (item) =>
                                item.seating_table_id === table.id && item.guest_id !== guest.id,
                            ).length;
                            const selected = assignment?.seating_table_id === table.id;
                            return (
                              <option
                                key={table.id}
                                value={table.id}
                                disabled={!selected && count >= table.capacity}
                              >
                                {table.label} ({count}/{table.capacity})
                              </option>
                            );
                          })}
                        </select>
                      </label>
                    );
                  })}
                  {!guests.length && (
                    <p className="text-xs text-[#887970]">
                      Belum ada tamu. Tambahkan tamu melalui menu Tamu & RSVP.
                    </p>
                  )}
                </div>
              )}
            </div>
            {seatingError && (
              <p
                role="alert"
                className="rounded-lg bg-red-50 p-3 text-xs text-red-700 lg:col-span-2"
              >
                {seatingError}
              </p>
            )}
          </div>
        )}

        {tab === "livestream" && (
          <div className="grid gap-4 lg:grid-cols-2">
            <form
              onSubmit={saveLivestream}
              className="rounded-2xl border border-[#eaded5] bg-white p-4"
            >
              <h3 className="text-sm font-semibold">Tautan siaran langsung</h3>
              <label className="mt-3 block text-xs font-medium">
                URL HTTPS
                <input
                  value={livestreamUrl}
                  onChange={(event) => setLivestreamUrl(event.target.value)}
                  type="url"
                  placeholder="https://..."
                  className="mt-1 w-full rounded-lg border border-[#ddcec3] px-3 py-2 text-sm"
                />
              </label>
              <label className="mt-3 block text-xs font-medium">
                Label tombol
                <input
                  value={livestreamLabel}
                  onChange={(event) => setLivestreamLabel(event.target.value)}
                  maxLength={80}
                  className="mt-1 w-full rounded-lg border border-[#ddcec3] px-3 py-2 text-sm"
                />
              </label>
              <button className="mt-3 rounded-lg bg-[#754b3b] px-3 py-2 text-xs font-semibold text-white">
                Simpan ke draft
              </button>
              {livestreamNotice && (
                <p role="status" className="mt-2 text-xs text-[#76675f]">
                  {livestreamNotice}
                </p>
              )}
            </form>
            <div className="rounded-2xl border border-[#eaded5] bg-white p-4 text-xs leading-6">
              <h3 className="text-sm font-semibold">Integrasi dan animasi</h3>
              <p className="mt-2 text-[#76675f]">
                Fase ini memakai tautan HTTPS eksternal. Penyematan provider, autentikasi platform,
                dan sinkronisasi siaran tidak diaktifkan karena integrasi resmi belum mendapat
                persetujuan.
              </p>
              <p className="mt-2 text-[#76675f]">
                Untuk animasi, pilih elemen pada kanvas lalu buka Properti → Gerak. Hanya preset
                animasi yang diizinkan yang dapat digunakan dan preferensi reduced-motion perangkat
                selalu dihormati.
              </p>
              <button
                type="button"
                onClick={() => {
                  const existing = findFirstNode(getSections(invitationDocument), "SeatingInfo");
                  if (existing) return;
                  const next = addNode(invitationDocument, "SeatingInfo");
                  onDocumentChange(next);
                }}
                className="mt-3 rounded-lg border border-[#ddcec3] px-3 py-2 font-semibold"
              >
                Tambahkan komponen informasi tempat duduk
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
