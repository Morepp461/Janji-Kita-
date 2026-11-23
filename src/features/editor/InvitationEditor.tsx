import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import InvitationDocumentView from "../invitations/InvitationDocumentView";
import PhaseEightPanel from "./PhaseEightPanel";
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
  const blob = await new Pro...[truncated]  const { data: resellerProfile } = await client
          .from("reseller_profiles")
          .select("status")
          .eq("user_id", userId)
          .eq("status", "approved")
          .maybeSingle();
        if (resellerProfile) {
          canEditCurrent = true;
          canManageCurrent = true;
          setReadOnly(false);
        }
      }
      if (!canEditCurrent) {
        const { data: membership, error: membershipError } = await client
          .from("invitation_collaborators")
          .select("role,status")
          .eq("invitation_id", invitationId)
          .eq("user_id", userId)
          .eq("status", "accepted")
          .maybeSingle();
        if (membershipError || !membership) {
          setMessage(membershipError?.message || "Akses kolaborator tidak ditemukan.");
          setLoading(false);
          return;
        }
        readOnlyCurrent = membership.role === "viewer";
        canEditCurrent = membership.role === "editor";
        setReadOnly(readOnlyCurrent);
      }
      setCanManage(canManageCurrent);
      if (!["draft", "active", "expired"].includes(invitation.status)) {
        setMessage("Status undangan ini tidak dapat disunting.");
        setLoading(false);
        return;
      }
      let nextDraftVersionId = invitation.draft_version_id as string | null;
      let invitationUpdatedAt = invitation.updated_at as string;
      if (!nextDraftVersionId && invitation.status !== "draft" && canEditCurrent) {
        const { data: revisionId, error: revisionError } = await client.rpc(
          "create_invitation_revision",
          { p_invitation_id: invitationId },
        );
        if (!active) return;
        if (revisionError || !revisionId) {
          setMessage(revisionError?.message || "Revisi undangan belum dapat dibuat.");
          setLoading(false);
          return;
        }
        nextDraftVersionId = String(revisionId);
        const { data: refreshedInvitation } = await client
          .from("invitat...[truncated]    setPublishedUrl(`/i/${result.slug}`);
    const { data: refreshedInvitation } = await client
      .from("invitations")
      .select("updated_at")
      .eq("id", invitationId)
      .maybeSingle();
    if (refreshedInvitation?.updated_at) {
      setBaseUpdatedAt(refreshedInvitation.updated_at);
      updatedAtRef.current = refreshedInvitation.updated_at;
    }
    setMessage(
      `Undangan berhasil diterbitkan. Masa aktif sampai ${new Date(result.active_until).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}.`,
    );
    setPublishing(false);
  }

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
    if (!file || !document) return;...[truncated]assName="min-h-screen bg-[#f7f2ee] text-[#30251f]">
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
          {ownerUserId === userId && (
            <a
              href="#phase-eight"
              className="rounded-lg border border-[#ddcec3] px-3 py-2 text-xs font-semibold"
            >
              Fitur lanjutan
            </a>
          )}
          <a
            href={`/invitations/${invitationId}/collaborators`}
            className="rounded-lg border border-[#ddcec3] px-3 py-2 text-xs font-semibold"
          >
            Kolaborasi
          </a>
          {canManage && (
            <>
              {ownerUserId === userId && (
                <a
                  href={`/invitations/${invitationId}/guests`}
                  className="rounded-l...[truncated]        <aside className="order-3 border-t border-[#eaded5] bg-white p-3 lg:border-l lg:border-t-0">
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
                {(["content", "style", "layout", "responsive", "motion"] as const).map((tab) => (
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
                          : tab === "responsive"
                            ? "Responsif"
                            : "Gerak"}
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
                        className="mt-1 w-full rounded-lg border border-[#d...[truncated]