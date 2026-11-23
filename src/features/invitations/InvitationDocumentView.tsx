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
    result.animationTimingFunction = "ease-out";
    result.animationFillMode = "both";
  }
  return result as CSSProperties;
}

function renderNode(
  node: InvitationNode,
  assetUrls: Record<string, string>,
  locale: string,
  timezone: string,
): ReactNode {
  const props = node.props || {};
  const style = safeStyle(node.style);
  const children = (node.children || []).map((child) => (
    <div
      key={child.id}
      className={
        child.hidden
          ? "hidden"
          : child.responsive?.mobile?.hidden
            ? "hidden sm:block"
            : child.responsive?.desktop?.hidden
              ? "sm:hidden"
              : ""
      }
    >
      {renderNode(child, assetUrls, locale, timezone)}
    </div>
  ));
  const text = typeof props.text === "string" ? props.text : "";
  const assetId = typeof props.assetId === "string" ? props.assetId : "";
  const src = assetUrls[assetId] || "";
  const heading = (level: number) => {
    const className =
      level === 1
        ? "my-3 text-3xl font-semibold tracking-tight"
        : level === 2
          ? "my-3 text-2xl font-semibold"
          : "my-3 text-xl font-semibold";
    if (level === 1)
      return (
        <h1 className={className} style={style}>
          {text}
        </h1>
      );
    if (level === 2)
      return (
        <h2 className={className} style={style}>
          {text}
        </h2>
      );
    return (
      <h3 className={className} style={style}>
        {text}
      </h3>
    );
  };
  switch (node.type) {
    case "Section":
      return (
        <section
          className="mx-auto my-4 w-full max-w-3xl rounded-2xl px-4 py-8 sm:px-8"
          style={{
            backgroundColor: typeof props.background === "string" ? props.background : "#ffffff",
            padding:
              typeof props.padding === "number" ? Math.min(120, Math.max(0, props.padding)) : 24,
            ...style,
          }}
        >
          {children}
        </section>
      );
    case "Container":
      return (
        <div className="mx-auto w-full max-w-2xl" style={style}>
          {children}
        </div>
      );
    case "Columns":
      return (
        <div
          className="grid grid-cols-1 sm:grid-cols-2"
          style={{
            gap: typeof props.gap === "number" ? Math.min(64, Math.max(0, props.gap)) : 16,
            ...style,
          }}
        >
          {children}
        </div>
      );
    case "Spacer":
      return (
        <div
          aria-hidden="true"
          style={{
            height:
              typeof props.height === "number" ? Math.min(500, Math.max(0, props.height)) : 32,
          }}
        />
      );
    case "Divider":
      return <hr className="my-6 border-[#eaded5]" style={style} />;
    case "Heading":
      return heading(props.level === 2 ? 2 : props.level === 3 ? 3 : 1);
    case "Paragraph":
    case "RichText":
      return (
        <p className="my-3 whitespace-pre-wrap leading-7 text-[#5f514a]" style={style}>
          {text}
        </p>
      );
    case "Image":
      return src ? (
        <img
          className="my-4 h-auto max-w-full rounded-xl"
          src={src}
          alt={typeof props.alt === "string" ? props.alt : ""}
          loading="lazy"
          style={style}
        />
      ) : (
        <div className="my-3 rounded-xl border border-dashed border-[#ddcec3] p-5 text-center text-xs text-[#887970]">
          Pilih gambar dari pustaka aset
        </div>
      );
    case "Gallery": {
      const ids = Array.isArray(props.assetIds)
        ? props.assetIds.filter((id): id is string => typeof id === "string")
        : [];
      return (
        <div className="my-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ids.map((id) =>
            assetUrls[id] ? (
              <img
                key={id}
                src={assetUrls[id]}
                alt=""
                className="h-36 w-full rounded-xl object-cover"
                loading="lazy"
              />
            ) : null,
          )}
        </div>
      );
    }
    case "Video":
      return src ? (
        <video className="my-4 w-full rounded-xl" controls preload="metadata" src={src} />
      ) : (
        <p className="rounded-xl bg-[#f7f2ee] p-4 text-sm">Video belum dipilih.</p>
      );
    case "Audio":
      return src ? (
        <audio className="my-4 w-full" controls preload="metadata" src={src} />
      ) : (
        <p className="rounded-xl bg-[#f7f2ee] p-4 text-sm">Audio belum dipilih.</p>
      );
    case "Countdown":
      return (
        <div className="my-4 rounded-xl bg-[#f7f2ee] p-5 text-center">
          <p className="text-xs uppercase tracking-widest text-[#887970]">Menuju hari bahagia</p>
          <p className="mt-2 text-xl font-semibold">
            {typeof props.date === "string" && props.date
              ? new Date(props.date).toLocaleString(locale, { timeZone: timezone })
              : "Atur tanggal acara di editor"}
          </p>
        </div>
      );
    case "EventSchedule":
      return (
        <section className="my-4 rounded-xl bg-[#f7f2ee] p-5">
          <h3 className="font-semibold">
            {typeof props.title === "string" ? props.title : "Rangkaian acara"}
          </h3>
          <p className="mt-2 text-sm text-[#887970]">
            Tambahkan rincian jadwal acara melalui properti.
          </p>
        </section>
      );
    case "Venue":
      return (
        <section className="my-4 rounded-xl bg-[#f7f2ee] p-5">
          <h3 className="font-semibold">
            {typeof props.name === "string" ? props.name : "Lokasi acara"}
          </h3>
          <p className="mt-1 whitespace-pre-wrap text-sm text-[#5f514a]">
            {typeof props.address === "string" ? props.address : ""}
          </p>
        </section>
      );
    case "MapLink":
    case "LivestreamLink": {
      const url = typeof props.url === "string" && /^https:\/\//i.test(props.url) ? props.url : "";
      return url ? (
        <a
          className="my-3 inline-flex rounded-xl bg-[#754b3b] px-5 py-3 text-sm font-semibold text-white"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={style}
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
        <div
          className="mx-auto my-4"
          style={{
            width: 64,
            height: 64,
            borderRadius: props.shape === "circle" ? "9999px" : 12,
            backgroundColor: typeof props.color === "string" ? props.color : "#eaded5",
          }}
        />
      );
    case "Icon":
      return (
        <span className="my-3 block text-center text-2xl" aria-label="Dekorasi">
          ♥
        </span>
      );
    case "Pattern":
      return (
        <div
          className="my-3 h-8 rounded-lg"
          style={{
            backgroundImage: "radial-gradient(#bda99c 1px, transparent 1px)",
            backgroundSize: "12px 12px",
          }}
        />
      );
    case "Background":
      return (
        <div
          className="my-3 rounded-xl p-4"
          style={{ backgroundColor: typeof props.color === "string" ? props.color : "#fffaf6" }}
        >
          {children}
        </div>
      );
    default:
      return null;
  }
}

export default function InvitationDocumentView({
  document,
  client,
  locale,
  timezone,
}: {
  document: InvitationDocument;
  client: SupabaseClient | null;
  locale?: string;
  timezone?: string;
}) {
  const displayLocale = locale || document.locale || "id-ID";
  const displayTimezone = timezone || document.timezone || "Asia/Jakarta";
  const sections = useMemo(
    () => document.pages?.flatMap((page) => page.sections || []) || document.sections || [],
    [document],
  );
  const assetIds = useMemo(() => collectAssetIds(sections), [sections]);
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    async function loadAssets() {
      if (!client || assetIds.length === 0) {
        setAssetUrls({});
        return;
      }
      const { data, error } = await client
        .from("media_assets")
        .select("id,storage_bucket,object_path,visibility")
        .in("id", assetIds);
      if (error || !data) {
        setAssetUrls({});
        return;
      }
      const entries = await Promise.all(
        data.map(async (asset) => {
          const storage = client.storage.from(asset.storage_bucket);
          if (asset.storage_bucket === "template-assets" && asset.visibility === "template")
            return [asset.id, storage.getPublicUrl(asset.object_path).data.publicUrl] as const;
          if (asset.visibility === "public")
            return [asset.id, storage.getPublicUrl(asset.object_path).data.publicUrl] as const;
          const result = await storage.createSignedUrl(asset.object_path, 3600);
          return [asset.id, result.error ? "" : result.data.signedUrl] as const;
        }),
      );
      if (active) setAssetUrls(Object.fromEntries(entries));
    }
    void loadAssets();
    return () => {
      active = false;
    };
  }, [client, assetIds]);

  return (
    <div className="mx-auto w-full space-y-4">
      {sections.map((node) => (
        <div
          key={node.id}
          className={
            node.hidden
              ? "hidden"
              : node.responsive?.mobile?.hidden
                ? "hidden sm:block"
                : node.responsive?.desktop?.hidden
                  ? "sm:hidden"
                  : ""
          }
        >
          {renderNode(node, assetUrls, displayLocale, displayTimezone)}
        </div>
      ))}
    </div>
  );
}
