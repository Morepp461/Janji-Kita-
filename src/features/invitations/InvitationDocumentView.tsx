import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { InvitationDocument, InvitationNode } from "./document";

function collectAssetIds(nodes: InvitationNode[]): string[] {
  const ids = new Set<string>();
  const visit = (node: InvitationNode) => {
    const assetId = node.props?.assetId;
    if (typeof assetId === "string") ids.add(assetId);
    (node.children || []).forEach(visit);
  };
  nodes.forEach(visit);
  return [...ids];
}

function safeStyle(style: Record<string, unknown> = {}): CSSProperties {
  const result: Record<string, unknown> = {};
  const allowed = ["textAlign", "color", "backgroundColor", "fontSize", "fontWeight", "fontFamily", "padding", "margin", "borderRadius", "maxWidth", "width"];
  for (const key of allowed) {
    const value = style[key];
    if (typeof value === "string" || typeof value === "number") result[key] = value;
  }
  return result as CSSProperties;
}

function renderNode(node: InvitationNode, assetUrls: Record<string, string>): ReactNode {
  const props = node.props || {};
  const style = safeStyle(node.style);
  const children = (node.children || []).map((child) => <div key={child.id}>{renderNode(child, assetUrls)}</div>);
  const text = typeof props.text === "string" ? props.text : "";
  switch (node.type) {
    case "Section":
      return <section className="mx-auto my-4 w-full max-w-3xl rounded-2xl px-4 py-8 sm:px-8" style={{ backgroundColor: typeof props.background === "string" ? props.background : "#ffffff", padding: typeof props.padding === "number" ? props.padding : 24, ...style }}>{children}</section>;
    case "Container":
      return <div className="mx-auto w-full max-w-2xl" style={style}>{children}</div>;
    case "Heading": {
      const level = props.level === 2 ? 2 : props.level === 3 ? 3 : 1;
      if (level === 2) return <h2 className="my-3 text-2xl font-semibold" style={style}>{text}</h2>;
      if (level === 3) return <h3 className="my-3 text-xl font-semibold" style={style}>{text}</h3>;
      return <h1 className="my-3 text-3xl font-semibold tracking-tight" style={style}>{text}</h1>;
    }
    case "Paragraph":
      return <p className="my-3 whitespace-pre-wrap leading-7 text-[#5f514a]" style={style}>{text}</p>;
    case "Divider":
      return <hr className="my-6 border-[#eaded5]" />;
    case "Image": {
      const assetId = typeof props.assetId === "string" ? props.assetId : "";
      const src = assetUrls[assetId];
      return src ? <img className="my-4 h-auto max-w-full rounded-xl" src={src} alt={typeof props.alt === "string" ? props.alt : ""} loading="lazy" /> : null;
    }
    default:
      return null;
  }
}

export default function InvitationDocumentView({ document, client }: { document: InvitationDocument; client: SupabaseClient | null }) {
  const sections = useMemo(() => document.pages?.flatMap((page) => page.sections || []) || document.sections || [], [document]);
  const assetIds = useMemo(() => collectAssetIds(sections), [sections]);
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    async function loadAssets() {
      if (!client || assetIds.length === 0) { setAssetUrls({}); return; }
      const { data, error } = await client.from("media_assets").select("id,storage_bucket,object_path,visibility").in("id", assetIds);
      if (error || !data) { setAssetUrls({}); return; }
      const entries = await Promise.all(data.map(async (asset) => {
        if (asset.visibility !== "template" && asset.visibility !== "public") return [asset.id, ""] as const;
        const storage = client.storage.from(asset.storage_bucket);
        const result = asset.storage_bucket === "template-assets"
          ? { data: { signedUrl: storage.getPublicUrl(asset.object_path).data.publicUrl }, error: null }
          : await storage.createSignedUrl(asset.object_path, 3600);
        return [asset.id, result.error ? "" : result.data.signedUrl] as const;
      }));
      if (active) setAssetUrls(Object.fromEntries(entries));
    }
    void loadAssets();
    return () => { active = false; };
  }, [client, assetIds]);

  return <div className="mx-auto w-full space-y-4">{sections.map((node) => <div key={node.id}>{renderNode(node, assetUrls)}</div>)}</div>;
}
