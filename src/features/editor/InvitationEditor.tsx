import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import InvitationDocumentView from "../invitations/InvitationDocumentView";
import {
  isInvitationDocument,
  type InvitationDocument,
  type InvitationNode,
} from "../invitations/document";
import {
  COMPONENT_REGISTRY,
  addNode,
  duplicateNode,
  findNode,
  getSections,
  moveNode,
  removeNode,
  updateNode,
  validateDocument,
} from "./editorModel";

type Props = { client: SupabaseClient; invitationId: string; userId: string };
type SaveState = "saved" | "dirty" | "saving" | "offline" | "conflict" | "error";
type Snapshot = { document: InvitationDocument; title: string };
type Asset = { id: string; name: string; url: string; type: "image" | "video" | "audio" };

const RECOVERY_PREFIX = "janji-kita-editor-recovery:";
const allowedMime = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "video/mp4",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
]);

function flattenNodes(
  nodes: InvitationNode[],
  depth = 0,
): Array<{ node: InvitationNode; depth: number }> {
  return nodes.flatMap((node) => [
    { node, depth },
    ...flattenNodes(node.children || [], depth + 1),
  ]);
}

async function optimizeImage(file: File): Promise<{ file: File; width: number; height: number }> {
  const image = await createImageBitmap(file);
  const scale = Math.min(1, 1920 / image.width, 1920 / image.height);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Pemrosesan gambar tidak tersedia pada peramban ini.");
  context.drawImage(image, 0, 0, width, height);
  image.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error("Gambar gagal dioptimalkan."))),
      "image/webp",
      0.82,
    ),
  );
  return {
    file: new File([blob], file.name.replace(/\.[^.]+$/, ".webp"), { type: "image/webp" }),
    width,
    height,
  };
}

function readDuration(file: File, kind: "audio" | "video"): Promise<number> {
  return new Promise((resolve, reject) => {
    const media: HTMLMediaElement =
      kind === "audio" ? document.createElement("audio") : document.createElement("video");
    const url = URL.createObjectURL(file);
    media.preload = "metadata";
    media.onloadedmetadata = () => {
      const duration = media.duration;
      URL.revokeObjectURL(url);
      if (!Number.isFinite(duration)) reject(new Error("Durasi media tidak dapat dibaca."));
      else resolve(Math.round(duration * 1000));
    };
    media.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Berkas media tidak dapat dibaca."));
    };
    media.src = url;
  });
}

function validateSignature(bytes: Uint8Array, mime: string): boolean {
  if (mime === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === "image/png") return bytes.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10";
  if (mime === "image/webp") return String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (mime === "image/avif") return String.fromCharCode(...bytes.slice(4, 12)).includes("ftyp");
  if (mime === "video/mp4" || mime === "audio/mp4")
    return String.fromCharCode(...bytes.slice(4, 8)) === "ftyp";
  if (mime === "audio/ogg") return String.fromCharCode(...bytes.slice(0, 4)) === "OggS";
  if (mime === "audio/mpeg")
    return (
      String.fromCharCode(...bytes.slice(0, 3)) === "ID3" ||
      (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
    );
  return false;
}

export default function InvitationEditor({ client, invitationId, userId }: Props) {
  const [title, setTitle] = useState("");
  const [document, setDocument] = useState<InvitationDocument | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [baseUpdatedAt, setBaseUpdatedAt] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [activeTab, setActiveTab] = useState<"content" | "style" | "layout" | "responsive">(
    "content",
  );
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [recovery, setRecovery] = useState<Snapshot | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const revision = useRef(0);
  const updatedAtRef = useRef("");
  const docRef = useRef<InvitationDocument | null>(null);
  const titleRef = useRef("");

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      setSaveState("dirty");
    };
    const onOffline = () => {
      setOnline(false);
      setSaveState("offline");
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const { data: invitation, error: invitationError } = await client
        .from("invitations")
        .select("id,title,status,draft_version_id,updated_at")
        .eq("id", invitationId)
        .eq("owner_user_id", userId)
        .maybeSingle();
      if (!active) return;
      if (invitationError || !invitation) {
        setMessage(invitationError?.message || "Draft tidak ditemukan atau bukan milik akun ini.");
        setLoading(false);
        return;
      }
      if (invitation.status !== "draft" || !invitation.draft_version_id) {
        setMessage("Hanya draft yang belum diterbitkan yang dapat dibuka di editor.");
        setLoading(false);
        return;
      }
      const { data: version, error: versionError } = await client
        .from("invitation_versions")
        .select("document")
        .eq("id", invitation.draft_version_id)
        .maybeSingle();
      if (!active) return;
      if (versionError || !version || !isInvitationDocument(version.document)) {
        setMessage(versionError?.message || "Dokumen draft tidak valid.");
        setLoading(false);
        return;
      }
      const snapshot = { document: version.document, title: invitation.title };
      setTitle(snapshot.title);
      titleRef.current = snapshot.title;
      setDocument(snapshot.document);
      docRef.current = snapshot.document;
      setBaseUpdatedAt(invitation.updated_at);
      updatedAtRef.current = invitation.updated_at;
      const rawRecovery = localStorage.getItem(RECOVERY_PREFIX + invitationId);
      if (rawRecovery) {
        try {
          const parsed = JSON.parse(rawRecovery) as { snapshot: Snapshot; updatedAt: string };
          if (isInvitationDocument(parsed.snapshot.document)) setRecovery(parsed.snapshot);
        } catch {
          localStorage.removeItem(RECOVERY_PREFIX + invitationId);
        }
      }
      setLoading(false);
    }
    void load();
    return () => {
      active = false;
    };
  }, [client, invitationId, userId]);

  const sections = useMemo(() => (document ? getSections(document) : []), [document]);
  const layers = useMemo(() => flattenNodes(sections), [sections]);
  const selected = useMemo(
    () => (selectedId ? findNode(sections, selectedId) : undefined),
    [sections, selectedId],
  );
  const validation = useMemo(
    () => (document ? validateDocument(document, title) : []),
    [document, title],
  );

  const commit = useCallback(
    (nextDocument: InvitationDocument, nextTitle = titleRef.current) => {
      if (!docRef.current) return;
      setHistory((items) => [
        ...items.slice(-49),
        { document: docRef.current!, title: titleRef.current },
      ]);
      setFuture([]);
      revision.current += 1;
      docRef.current = nextDocument;
      titleRef.current = nextTitle;
      setDocument(nextDocument);
      setTitle(nextTitle);
      setSaveState("dirty");
      localStorage.setItem(
        RECOVERY_PREFIX + invitationId,
        JSON.stringify({
          snapshot: { document: nextDocument, title: nextTitle },
          updatedAt: updatedAtRef.current,
          savedAt: new Date().toISOString(),
        }),
      );
    },
    [invitationId],
  );

  const updateSelected = (patch: Record<string, unknown>, target: "props" | "style" = "props") => {
    if (!document || !selected) return;
    if (selected.locked) {
      setMessage("Lapisan terkunci. Buka kunci sebelum mengubah properti.");
      return;
    }
    commit(
      updateNode(document, selected.id, (node) => ({
        ...node,
        [target]: { ...(node[target] || {}), ...patch },
      })),
    );
  };

  const undo = () => {
    if (!document || !history.length) return;
    const previous = history[history.length - 1]!;
    setFuture((items) => [...items, { document, title }]);
    setHistory((items) => items.slice(0, -1));
    revision.current += 1;
    docRef.current = previous.document;
    titleRef.current = previous.title;
    setDocument(previous.document);
    setTitle(previous.title);
    setSaveState("dirty");
    localStorage.setItem(
      RECOVERY_PREFIX + invitationId,
      JSON.stringify({
        snapshot: { document: previous.document, title: previous.title },
        updatedAt: updatedAtRef.current,
        savedAt: new Date().toISOString(),
      }),
    );
  };

  const redo = () => {
    if (!document || !future.length) return;
    const next = future[future.length - 1]!;
    setHistory((items) => [...items, { document, title }]);
    setFuture((items) => items.slice(0, -1));
    revision.current += 1;
    docRef.current = next.document;
    titleRef.current = next.title;
    setDocument(next.document);
    setTitle(next.title);
    setSaveState("dirty");
    localStorage.setItem(
      RECOVERY_PREFIX + invitationId,
      JSON.stringify({
        snapshot: { document: next.document, title: next.title },
        updatedAt: updatedAtRef.current,
        savedAt: new Date().toISOString(),
      }),
    );
  };

  useEffect(() => {
    if (!document || !baseUpdatedAt || !invitationId || !userId || saveState !== "dirty") return;
    if (!online) {
      setSaveState("offline");
      return;
    }
    const timer = window.setTimeout(async () => {
      const capturedRevision = revision.current;
      const capturedDocument = docRef.current;
      const capturedTitle = titleRef.current;
      if (!capturedDocument) return;
      setSaveState("saving");
      const { data, error } = await client.rpc("save_invitation_draft", {
        p_invitation_id: invitationId,
        p_expected_updated_at: updatedAtRef.current,
        p_title: capturedTitle,
        p_document: capturedDocument,
      });
      if (error) {
        if (error.code === "40001" || error.message.toLowerCase().includes("konflik"))
          setSaveState("conflict");
        else if (!navigator.onLine || error.message.toLowerCase().includes("fetch"))
          setSaveState("offline");
        else setSaveState("error");
        setMessage(error.message);
        return;
      }
      const result = data as { updated_at: string };
      updatedAtRef.current = result.updated_at;
      setBaseUpdatedAt(result.updated_at);
      if (capturedRevision === revision.current) {
        setSaveState("saved");
        localStorage.removeItem(RECOVERY_PREFIX + invitationId);
      } else {
        setSaveState("dirty");
      }
      setMessage("");
    }, 850);
    return () => window.clearTimeout(timer);
  }, [client, document, title, baseUpdatedAt, invitationId, userId, saveState, online]);

  const restoreRecovery = () => {
    if (!recovery) return;
    commit(recovery.document, recovery.title);
    setRecovery(null);
  };

  const addComponent = (type: string) => {
    if (!document) return;
    const parentId =
      selected && ["Section", "Container", "Columns"].includes(selected.type)
        ? selected.id
        : undefined;
    const next = addNode(document, type, parentId);
    const newNode = parentId
      ? findNode(getSections(next), parentId)?.children?.slice(-1)[0]
      : getSections(next).slice(-1)[0];
    commit(next);
    if (newNode) setSelectedId(newNode.id);
  };

  const insertAsset = (asset: Asset) => {
    const currentDocument = docRef.current;
    if (!currentDocument) return;
    const type = asset.type === "image" ? "Image" : asset.type === "video" ? "Video" : "Audio";
    const node: InvitationNode = {
      id: crypto.randomUUID(),
      type,
      props:
        asset.type === "image" ? { assetId: asset.id, alt: asset.name } : { assetId: asset.id },
      style: {},
    };
    const added = addNode(currentDocument, type);
    const last = getSections(added).slice(-1)[0];
    commit(last ? updateNode(added, last.id, () => node) : added);
    setSelectedId(node.id);
  };

  const uploadAsset = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !document) return;
    setUploading(true);
    setMessage("");
    try {
      if (!allowedMime.has(file.type))
        throw new Error(
          "Format tidak didukung. Gunakan JPG, PNG, WebP, AVIF, MP4, MP3, M4A, atau OGG.",
        );
      if (file.size > 50 * 1024 * 1024) throw new Error("Ukuran berkas melebihi batas 50 MB.");
      const signature = new Uint8Array(await file.slice(0, 16).arrayBuffer());
      if (!validateSignature(signature, file.type))
        throw new Error("Isi berkas tidak sesuai dengan tipe MIME yang dinyatakan.");
      let uploadFile = file;
      let width: number | null = null;
      let height: number | null = null;
      let durationMs: number | null = null;
      let mediaType: "image" | "video" | "audio";
      if (file.type.startsWith("image/")) {
        const optimized = await optimizeImage(file);
        uploadFile = optimized.file;
        width = optimized.width;
        height = optimized.height;
        mediaType = "image";
      } else {
        mediaType = file.type.startsWith("video/") ? "video" : "audio";
        durationMs = await readDuration(file, mediaType);
      }
      const bucket = "user-uploads-private";
      const objectPath =
        userId +
        "/" +
        invitationId +
        "/" +
        crypto.randomUUID() +
        "-" +
        uploadFile.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const { error: uploadError } = await client.storage
        .from(bucket)
        .upload(objectPath, uploadFile, {
          contentType: uploadFile.type,
          upsert: false,
          cacheControl: "3600",
        });
      if (uploadError) throw uploadError;
      const { data: asset, error: assetError } = await client
        .from("media_assets")
        .insert({
          owner_user_id: userId,
          storage_bucket: bucket,
          object_path: objectPath,
          media_type: mediaType,
          mime_type: uploadFile.type,
          byte_size: uploadFile.size,
          width,
          height,
          duration_ms: durationMs,
          visibility: "private",
          processing_status: "ready",
        })
        .select("id")
        .single();
      if (assetError) {
        await client.storage.from(bucket).remove([objectPath]);
        throw assetError;
      }
      const { data: signed, error: signedError } = await client.storage
        .from(bucket)
        .createSignedUrl(objectPath, 3600);
      if (signedError || !signed) throw signedError || new Error("Pratinjau aset gagal dibuat.");
      const nextAsset: Asset = {
        id: asset.id,
        name: uploadFile.name,
        url: signed.signedUrl,
        type: mediaType,
      };
      setAssets((items) => [nextAsset, ...items]);
      const component = mediaType === "image" ? "Image" : mediaType === "video" ? "Video" : "Audio";
      const node: InvitationNode = {
        id: crypto.randomUUID(),
        type: component,
        props:
          mediaType === "image" ? { assetId: asset.id, alt: file.name } : { assetId: asset.id },
        style: {},
      };
      const currentDocument = docRef.current || document;
      const added = addNode(currentDocument, component);
      const last = getSections(added).slice(-1)[0];
      const nextDocument = last ? updateNode(added, last.id, () => node) : added;
      commit(nextDocument);
      setSelectedId(node.id);
      setMessage("Aset berhasil diunggah dan dioptimalkan untuk penggunaan di undangan.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unggahan gagal.");
    } finally {
      setUploading(false);
    }
  };

  if (loading)
    return (
      <main className="grid min-h-screen place-items-center text-sm text-[#76675f]">
        Memuat editor...
      </main>
    );
  if (!document)
    return (
      <main className="mx-auto max-w-xl p-8">
        <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
          {message || "Editor tidak dapat dibuka."}
        </p>
        <a className="mt-4 inline-block text-sm underline" href="/">
          Kembali ke ruang kerja
        </a>
      </main>
    );

  const statusLabel: Record<SaveState, string> = {
    saved: "Tersimpan",
    dirty: "Perubahan belum tersimpan",
    saving: "Menyimpan...",
    offline: "Offline · perubahan disimpan lokal",
    conflict: "Konflik · perlu muat ulang",
    error: "Gagal menyimpan",
  };

  const renderLayer = (node: InvitationNode, depth = 0) => (
    <div key={node.id}>
      <button
        onClick={() => setSelectedId(node.id)}
        className={`w-full rounded-lg px-2 py-2 text-left text-sm ${selectedId === node.id ? "bg-[#754b3b] text-white" : "hover:bg-[#f7eee8]"}`}
        style={{ paddingLeft: 10 + depth * 14 }}
      >
        <span className="mr-2 text-xs opacity-70">{node.type === "Section" ? "▤" : "◦"}</span>
        {COMPONENT_REGISTRY.find((item) => item.type === node.type)?.label || node.type}
        {node.locked ? " · Terkunci" : ""}
        {node.hidden ? " · Tersembunyi" : ""}
      </button>
      {(node.children || []).map((child) => renderLayer(child, depth + 1))}
    </div>
  );

  return (
    <main className="min-h-screen bg-[#f7f2ee] text-[#30251f]">
      <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-[#eaded5] bg-white px-3 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <a
            href="/"
            aria-label="Kembali"
            className="rounded-lg border border-[#ddcec3] px-3 py-2 text-sm"
          >
            ←
          </a>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#a36d55]">
              Janji Kita · Editor
            </p>
            <input
              aria-label="Judul undangan"
              value={title}
              maxLength={160}
              onChange={(event) => commit(document, event.target.value)}
              className="w-full max-w-[260px] truncate border-0 p-0 text-sm font-semibold outline-none focus:ring-0 sm:max-w-sm"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            role="status"
            className={`text-xs ${saveState === "saved" ? "text-green-700" : saveState === "conflict" || saveState === "error" ? "text-red-700" : "text-amber-700"}`}
          >
            {statusLabel[saveState]}
          </span>
          <button
            disabled={!history.length}
            onClick={undo}
            className="rounded-lg border border-[#ddcec3] px-3 py-2 text-xs disabled:opacity-40"
            aria-label="Urungkan"
          >
            ↶
          </button>
          <button
            disabled={!future.length}
            onClick={redo}
            className="rounded-lg border border-[#ddcec3] px-3 py-2 text-xs disabled:opacity-40"
            aria-label="Ulangi"
          >
            ↷
          </button>
          <button
            onClick={() => setErrors(validateDocument(document, title))}
            className="rounded-lg bg-[#754b3b] px-3 py-2 text-xs font-semibold text-white"
          >
            Validasi
          </button>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-65px)] grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)_280px]">
        <aside className="order-2 border-t border-[#eaded5] bg-white p-3 lg:order-1 lg:border-r lg:border-t-0">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-[#887970]">
            Komponen
          </h2>
          <div className="space-y-4">
            {["Tata letak", "Teks", "Media", "Acara", "Tamu", "Sosial", "Dekorasi"].map((group) => (
              <section key={group}>
                <h3 className="mb-2 text-xs font-semibold">{group}</h3>
                <div className="grid grid-cols-2 gap-1 lg:grid-cols-1">
                  {COMPONENT_REGISTRY.filter((item) => item.group === group).map((item) => (
                    <button
                      key={item.type}
                      onClick={() => addComponent(item.type)}
                      className="rounded-lg border border-[#eee4de] px-2 py-2 text-left text-xs hover:border-[#b58c78] hover:bg-[#fffaf6]"
                    >
                      ＋ {item.label}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <div className="mt-4 border-t border-[#eee4de] pt-4">
            <label className="block cursor-pointer rounded-lg border border-dashed border-[#bda99c] p-3 text-center text-xs font-semibold">
              ＋ Unggah aset
              <input
                className="sr-only"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,audio/mpeg,audio/mp4,audio/ogg"
                onChange={(event) => void uploadAsset(event)}
                disabled={uploading}
              />
            </label>
            <p className="mt-2 text-[11px] text-[#887970]">
              {uploading
                ? "Memproses aset..."
                : "Maksimal 50 MB. Gambar dioptimalkan sebelum diunggah."}
            </p>
          </div>
        </aside>

        <section className="order-1 min-w-0 p-3 sm:p-5 lg:order-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">Kanvas</h2>
              <p className="text-xs text-[#887970]">Pilih komponen untuk mengubah properti.</p>
            </div>
            <div className="flex rounded-lg border border-[#ddcec3] bg-white p-1">
              <button
                onClick={() => setDevice("desktop")}
                className={`rounded-md px-3 py-1.5 text-xs ${device === "desktop" ? "bg-[#754b3b] text-white" : ""}`}
              >
                Desktop
              </button>
              <button
                onClick={() => setDevice("mobile")}
                className={`rounded-md px-3 py-1.5 text-xs ${device === "mobile" ? "bg-[#754b3b] text-white" : ""}`}
              >
                Ponsel
              </button>
            </div>
          </div>
          <div
            className="mx-auto overflow-hidden rounded-2xl border border-[#e3d8d0] bg-[#e9e2dc] p-2 sm:p-4"
            style={{ maxWidth: device === "mobile" ? 430 : 1100 }}
          >
            <div
              className="mx-auto min-h-[70vh] overflow-hidden rounded-xl bg-[#fffaf6] p-2 shadow-sm transition-all"
              style={{ maxWidth: device === "mobile" ? 390 : "100%" }}
            >
              <InvitationDocumentView document={document} client={client} />
            </div>
          </div>
          <div className="mt-3 rounded-xl border border-[#eaded5] bg-white p-3">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[#887970]">
              Lapisan
            </h3>
            <div className="max-h-52 space-y-1 overflow-y-auto">
              {layers.map(({ node, depth }) => renderLayer(node, depth))}
            </div>
          </div>
          {(message || saveState === "conflict" || saveState === "error") && (
            <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-xs text-red-700">
              {message ||
                "Draft berubah di perangkat lain. Muat ulang untuk mengambil versi terbaru sebelum melanjutkan."}{" "}
              {saveState === "conflict" && (
                <button
                  onClick={() => window.location.reload()}
                  className="ml-2 font-semibold underline"
                >
                  Muat ulang versi server
                </button>
              )}
            </p>
          )}
          {recovery && (
            <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
              <p className="font-semibold">Ada perubahan lokal yang belum tersimpan.</p>
              <p className="mt-1 text-xs">
                Pulihkan perubahan dari perangkat ini? Jika versi server juga berubah, tindakan ini
                akan mengganti isi draft server.
              </p>
              <button
                onClick={restoreRecovery}
                className="mt-2 rounded-lg bg-[#754b3b] px-3 py-2 text-xs font-semibold text-white"
              >
                Pulihkan perubahan lokal
              </button>
              <button
                onClick={() => {
                  localStorage.removeItem(RECOVERY_PREFIX + invitationId);
                  setRecovery(null);
                }}
                className="ml-2 text-xs underline"
              >
                Abaikan
              </button>
            </div>
          )}
        </section>

        <aside className="order-3 border-t border-[#eaded5] bg-white p-3 lg:border-l lg:border-t-0">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-[#887970]">
            Properti
          </h2>
          {!selected ? (
            <p className="text-xs text-[#887970]">Pilih komponen pada kanvas atau panel lapisan.</p>
          ) : (
            <>
              <p className="mb-3 rounded-lg bg-[#fffaf6] p-2 text-sm font-semibold">
                {COMPONENT_REGISTRY.find((item) => item.type === selected.type)?.label ||
                  selected.type}
              </p>
              <div className="mb-3 flex gap-1">
                {(["content", "style", "layout", "responsive"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 rounded-md px-2 py-2 text-xs capitalize ${activeTab === tab ? "bg-[#754b3b] text-white" : "bg-[#f7f2ee]"}`}
                  >
                    {tab === "content"
                      ? "Konten"
                      : tab === "style"
                        ? "Gaya"
                        : tab === "layout"
                          ? "Tata letak"
                          : "Responsif"}
                  </button>
                ))}
              </div>
              {activeTab === "content" && (
                <div className="space-y-3">
                  {typeof selected.props?.text === "string" && (
                    <label className="block text-xs font-medium">
                      Teks
                      <textarea
                        rows={4}
                        value={String(selected.props.text)}
                        onChange={(event) => updateSelected({ text: event.target.value })}
                        className="mt-1 w-full rounded-lg border border-[#ddcec3] p-2 text-sm"
                      />
                    </label>
                  )}
                  {selected.type === "Heading" && (
                    <label className="block text-xs font-medium">
                      Tingkat judul
                      <select
                        value={String(selected.props?.level || 1)}
                        onChange={(event) => updateSelected({ level: Number(event.target.value) })}
                        className="mt-1 w-full rounded-lg border border-[#ddcec3] p-2"
                      >
                        <option value="1">H1</option>
                        <option value="2">H2</option>
                        <option value="3">H3</option>
                      </select>
                    </label>
                  )}
                  {selected.type === "Image" && (
                    <label className="block text-xs font-medium">
                      Teks alternatif
                      <input
                        value={String(selected.props?.alt || "")}
                        onChange={(event) => updateSelected({ alt: event.target.value })}
                        className="mt-1 w-full rounded-lg border border-[#ddcec3] p-2"
                      />
                    </label>
                  )}
                  {["MapLink", "LivestreamLink"].includes(selected.type) && (
                    <label className="block text-xs font-medium">
                      URL HTTPS
                      <input
                        value={String(selected.props?.url || "")}
                        onChange={(event) => updateSelected({ url: event.target.value })}
                        className="mt-1 w-full rounded-lg border border-[#ddcec3] p-2"
                      />
                    </label>
                  )}
                </div>
              )}
              {activeTab === "style" && (
                <div className="space-y-3">
                  <label className="block text-xs font-medium">
                    Warna teks
                    <input
                      type="color"
                      value={String(selected.style?.color || "#30251f")}
                      onChange={(event) => updateSelected({ color: event.target.value }, "style")}
                      className="mt-1 h-10 w-full rounded-lg border border-[#ddcec3] p-1"
                    />
                  </label>
                  <label className="block text-xs font-medium">
                    Warna latar
                    <input
                      type="color"
                      value={String(
                        selected.style?.backgroundColor || selected.props?.background || "#fffaf6",
                      )}
                      onChange={(event) =>
                        updateSelected({ backgroundColor: event.target.value }, "style")
                      }
                      className="mt-1 h-10 w-full rounded-lg border border-[#ddcec3] p-1"
                    />
                  </label>
                  <label className="block text-xs font-medium">
                    Ukuran teks (px)
                    <input
                      type="number"
                      min="10"
                      max="96"
                      value={Number(selected.style?.fontSize || 16)}
                      onChange={(event) =>
                        updateSelected(
                          { fontSize: Math.min(96, Math.max(10, Number(event.target.value))) },
                          "style",
                        )
                      }
                      className="mt-1 w-full rounded-lg border border-[#ddcec3] p-2"
                    />
                  </label>
                  <label className="block text-xs font-medium">
                    Perataan
                    <select
                      value={String(selected.style?.textAlign || "left")}
                      onChange={(event) =>
                        updateSelected({ textAlign: event.target.value }, "style")
                      }
                      className="mt-1 w-full rounded-lg border border-[#ddcec3] p-2"
                    >
                      <option value="left">Kiri</option>
                      <option value="center">Tengah</option>
                      <option value="right">Kanan</option>
                    </select>
                  </label>
                </div>
              )}
              {activeTab === "responsive" && (
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={Boolean(selected.responsive?.mobile?.hidden)}
                      onChange={(event) => {
                        if (!document) return;
                        commit(
                          updateNode(document, selected.id, (node) => ({
                            ...node,
                            responsive: {
                              ...node.responsive,
                              mobile: { hidden: event.target.checked },
                            },
                          })),
                        );
                      }}
                    />{" "}
                    Sembunyikan di ponsel
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={Boolean(selected.responsive?.desktop?.hidden)}
                      onChange={(event) => {
                        if (!document) return;
                        commit(
                          updateNode(document, selected.id, (node) => ({
                            ...node,
                            responsive: {
                              ...node.responsive,
                              desktop: { hidden: event.target.checked },
                            },
                          })),
                        );
                      }}
                    />{" "}
                    Sembunyikan di desktop
                  </label>
                  <p className="text-[11px] text-[#887970]">
                    Pengaturan berlaku pada pratinjau dan halaman undangan.
                  </p>
                </div>
              )}
              {activeTab === "layout" && (
                <div className="space-y-3">
                  <label className="block text-xs font-medium">
                    Lebar maksimum (px)
                    <input
                      type="number"
                      min="120"
                      max="1200"
                      value={Number(selected.style?.maxWidth || 720)}
                      onChange={(event) =>
                        updateSelected(
                          { maxWidth: Math.min(1200, Math.max(120, Number(event.target.value))) },
                          "style",
                        )
                      }
                      className="mt-1 w-full rounded-lg border border-[#ddcec3] p-2"
                    />
                  </label>
                  {selected.type === "Section" && (
                    <label className="block text-xs font-medium">
                      Padding (px)
                      <input
                        type="number"
                        min="0"
                        max="120"
                        value={Number(selected.props?.padding || 24)}
                        onChange={(event) =>
                          updateSelected({
                            padding: Math.min(120, Math.max(0, Number(event.target.value))),
                          })
                        }
                        className="mt-1 w-full rounded-lg border border-[#ddcec3] p-2"
                      />
                    </label>
                  )}
                  {selected.type === "Spacer" && (
                    <label className="block text-xs font-medium">
                      Tinggi (px)
                      <input
                        type="number"
                        min="0"
                        max="500"
                        value={Number(selected.props?.height || 32)}
                        onChange={(event) =>
                          updateSelected({
                            height: Math.min(500, Math.max(0, Number(event.target.value))),
                          })
                        }
                        className="mt-1 w-full rounded-lg border border-[#ddcec3] p-2"
                      />
                    </label>
                  )}
                </div>
              )}
              <div className="mt-5 grid grid-cols-2 gap-2 border-t border-[#eee4de] pt-4">
                <button
                  disabled={Boolean(selected.locked)}
                  onClick={() => {
                    if (!document) return;
                    commit(moveNode(document, selected.id, -1));
                  }}
                  className="rounded-lg border border-[#ddcec3] px-2 py-2 text-xs disabled:opacity-40"
                >
                  Naikkan
                </button>
                <button
                  disabled={Boolean(selected.locked)}
                  onClick={() => {
                    if (!document) return;
                    commit(moveNode(document, selected.id, 1));
                  }}
                  className="rounded-lg border border-[#ddcec3] px-2 py-2 text-xs disabled:opacity-40"
                >
                  Turunkan
                </button>
                <button
                  disabled={Boolean(selected.locked)}
                  onClick={() => {
                    if (!document) return;
                    const nextDocument = duplicateNode(document, selected.id);
                    commit(nextDocument);
                  }}
                  className="rounded-lg border border-[#ddcec3] px-2 py-2 text-xs disabled:opacity-40"
                >
                  Duplikat
                </button>
                <button
                  onClick={() => {
                    if (!document) return;
                    commit(
                      updateNode(document, selected.id, (node) => ({
                        ...node,
                        locked: !node.locked,
                      })),
                    );
                  }}
                  className="rounded-lg border border-[#ddcec3] px-2 py-2 text-xs"
                >
                  {selected.locked ? "Buka kunci" : "Kunci"}
                </button>
                <button
                  disabled={Boolean(selected.locked)}
                  onClick={() => {
                    if (!document) return;
                    commit(
                      updateNode(document, selected.id, (node) => ({
                        ...node,
                        hidden: !node.hidden,
                      })),
                    );
                  }}
                  className="rounded-lg border border-[#ddcec3] px-2 py-2 text-xs disabled:opacity-40"
                >
                  {selected.hidden ? "Tampilkan" : "Sembunyikan"}
                </button>
                <button
                  disabled={Boolean(selected.locked)}
                  onClick={() => {
                    if (!document) return;
                    commit(removeNode(document, selected.id));
                    setSelectedId("");
                  }}
                  className="rounded-lg border border-red-200 px-2 py-2 text-xs text-red-700 disabled:opacity-40"
                >
                  Hapus
                </button>
              </div>
            </>
          )}
          <div className="mt-5 border-t border-[#eee4de] pt-4">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[#887970]">
              Validasi dokumen
            </h3>
            {validation.length ? (
              <ul className="list-disc space-y-1 pl-4 text-xs text-amber-800">
                {validation.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-green-700">Struktur dokumen valid.</p>
            )}
            {errors.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-red-700">
                {errors.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="mt-5 border-t border-[#eee4de] pt-4">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[#887970]">
              Aset sesi ini
            </h3>
            {assets.length ? (
              assets.map((asset) => (
                <div key={asset.id} className="mb-2 flex items-center gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate">{asset.name}</span>
                  <button onClick={() => insertAsset(asset)} className="underline">
                    Tambah
                  </button>
                </div>
              ))
            ) : (
              <p className="text-xs text-[#887970]">Belum ada aset baru.</p>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
