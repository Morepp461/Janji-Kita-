import type { CSSProperties, ReactNode } from "react";
import type { InvitationDocument, InvitationNode } from "./document";

function safeStyle(style: Record<string, unknown> = {}): CSSProperties {
  const result: CSSProperties = {};
  const allowed = ["textAlign", "color", "backgroundColor", "fontSize", "fontWeight", "fontFamily", "padding", "margin", "borderRadius", "maxWidth", "width"];
  for (const key of allowed) {
    const value = style[key];
    if (typeof value === "string" || typeof value === "number") {
      (result as Record<string, unknown>)[key] = value;
    }
  }
  return result;
}

function renderNode(node: InvitationNode): ReactNode {
  const props = node.props || {};
  const style = safeStyle(node.style);
  const children = (node.children || []).map((child) => (
    <div key={child.id}>{renderNode(child)}</div>
  ));
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
    case "Image":
      return typeof props.src === "string" && props.src.startsWith("https://")
        ? <img className="my-4 h-auto max-w-full rounded-xl" src={props.src} alt={typeof props.alt === "string" ? props.alt : ""} loading="lazy" />
        : null;
    default:
      return null;
  }
}

export default function InvitationDocumentView({ document }: { document: InvitationDocument }) {
  const sections = document.pages?.flatMap((page) => page.sections || []) || document.sections || [];
  return <div className="mx-auto w-full space-y-4">{sections.map((node) => <div key={node.id}>{renderNode(node)}</div>)}</div>;
}
