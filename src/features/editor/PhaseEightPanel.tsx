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
    if (b...[truncated]ate("");

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
    cons...[truncated]  !validateImportSignature(new Uint8Array(await file.slice(0, 16).arrayBuffer()), format)
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
      setR...[truncated]eHttpsUrl(livestreamUrl.trim())) {
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

        <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Fitur lanjutan...[truncated]                Buka pratinjau {pdfPreview.name}
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
                <table...[truncated]bleCapacity}
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
                    Belum ada meja. Tambahkan meja un...[truncated]                         return (
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
