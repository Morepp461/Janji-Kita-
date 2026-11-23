import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { InvitationDocument, InvitationNode } from "./document";

function collectAssetIds(nodes: InvitationNode[]): string[] {
  const ids = new Set<string>();
  const visit = (node: InvitationNode) => {
    const assetId = node.props?.assetId;
    if (typeof assetId === "string" && assetId) ids.add(assetId);
    const assetIds = node.props?.assetIds;
    if (Array.isArray(assetIds))
      assetIds.forEach((id) => {
        if (typeof id === "string") ids.add(id);
      });
    (node.children || []).forEach(visit);
  };
  nodes.forEach(visit);
  return [...ids];
}

function safeStyle(style: Record<string, unknown> = {}): CSSProperties {
  const result: Record<string, unknown> = {};
  const allowed = [
    "textAlign",
    "color",
    "backgroundColor",
    "fontSize",
    "fontWeight",
    "fontFamily",
    "padding",
    "margin",
    "borderRadius",
    "maxWidth",
    "width",
    "height",
    "gap",
    "alignItems",
    "justifyContent",
  ];
  for (const key of allowed) {
    const value = style[key];
    if (typeof value === "string" || (typeof value === "number" && Number.isFinite(value)))
      result[key] = value;
  }
  if (typeof result.fontSize === "number")
    result.fontSize = Math.min(96, Math.max(10, result.fontSize));
  if (typeof result.maxWidth === "number")
    result.maxWidth = Math.min(1200, Math.max(0, result.maxWidth));
  const animationNames: Record<string, string> = {
    "fade-in": "jkFadeIn",
    "rise-in": "jkRiseIn",
    "soft-zoom": "jkSoftZoom",
    float: "jkFloat",
  };
  const preset = style.animationPreset;
  if (typeof preset === "string" && animationNames[preset]) {
    result.animationName = animationNames[preset];
    result.animationDuration =
      String(Math.min(1800, Math.max(300, Number(style.animationDurationMs) || 650))) + "ms";
    result.animationTimingFunctio...[truncated]    style={style}
        >
          {typeof props.label === "string" ? props.label : "Buka tautan"}
        </a>
      ) : (
        <p className="my-3 text-sm text-[#887970]">Tambahkan tautan HTTPS.</p>
      );
    }
    case "RSVP":
    case "Guestbook":
    case "QRTicket":
    case "SeatingInfo":
      return (
        <section className="my-4 rounded-xl border border-[#eaded5] bg-white p-5">
          <h3 className="font-semibold">
            {typeof props.title === "string"
              ? props.title
              : node.type === "RSVP"
                ? "Konfirmasi kehadiran"
                : node.type === "Guestbook"
                  ? "Ucapan dan doa"
                  : node.type === "QRTicket"
                    ? "Tiket undangan"
                    : "Informasi tempat duduk"}
          </h3>
          <p className="mt-1 text-xs text-[#887970]">
            {node.type === "SeatingInfo"
              ? "Informasi meja dan tempat duduk dikelola oleh penyelenggara. Hubungi penyelenggara untuk detail penempatan."
              : "Komponen ini akan menampilkan data tamu sesuai pengaturan undangan."}
          </p>
        </section>
      );
    case "GiftInfo":
      return (
        <section className="my-4 rounded-xl bg-[#f7f2ee] p-5">
          <h3 className="font-semibold">
            {typeof props.title === "string" ? props.title : "Tanda kasih"}
          </h3>
          <p className="mt-2 whitespace-pre-wrap text-sm">
            {typeof props.description === "string" ? props.description : ""}
          </p>
        </section>
      );
    case "PersonalizedGreeting":
      return (
        <p className="my-3 text-sm" style={style}>
          {text || "Kepada tamu undangan"}
        </p>
      );
    case "ShareButtons":
      return (
        <p className="my-3 text-center text-sm text-[#887970]">
          {typeof props.label === "string" ? props.label : "Bagikan undangan"}
        </p>
      );
    case "Shape":
      return (
        <div...[truncated]