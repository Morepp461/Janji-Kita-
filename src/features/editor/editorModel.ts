import type { InvitationDocument, InvitationNode } from "../invitations/document";

export type ComponentDefinition = {
  type: string;
  label: string;
  group: string;
  defaults: Record<string, unknown>;
};

export const COMPONENT_REGISTRY: ComponentDefinition[] = [
  {
    type: "Section",
    label: "Bagian",
    group: "Tata letak",
    defaults: { background: "#fffaf6", padding: 32 },
  },
  { type: "Container", label: "Kontainer", group: "Tata letak", defaults: {} },
  { type: "Columns", label: "Kolom", group: "Tata letak", defaults: { columns: 2, gap: 16 } },
  { type: "Spacer", label: "Jarak", group: "Tata letak", defaults: { height: 32 } },
  { type: "Divider", label: "Garis pemisah", group: "Tata letak", defaults: {} },
  { type: "Heading", label: "Judul", group: "Teks", defaults: { text: "Judul acara", level: 2 } },
  {
    type: "Paragraph",
    label: "Paragraf",
    group: "Teks",
    defaults: { text: "Tulis informasi acara di sini." },
  },
  { type: "RichText", label: "Teks kaya", group: "Teks", defaults: { text: "Informasi tambahan" } },
  { type: "Image", label: "Gambar", group: "Media", defaults: { alt: "Foto undangan" } },
  { type: "Gallery", label: "Galeri", group: "Media", defaults: { assetIds: [] } },
  { type: "Video", label: "Video", group: "Media", defaults: { assetId: "" } },
  { type: "Audio", label: "Audio", group: "Media", defaults: { assetId: "" } },
  { type: "Countdown", label: "Hitung mundur", group: "Acara", defaults: { date: "" } },
  {
    type: "EventSchedule",
    label: "Jadwal acara",
    group: "Acara",
    defaults: { title: "Rangkaian acara", items: [] },
  },
  {
    type: "Venue",
    label: "Lokasi",
    group: "Acara",
    defaults: { name: "Nama lokasi", address: "" },
  },
  {
    type: "MapLink",
    label: "Tautan peta",
    group: "Acara",
    defaults: { label: "Lihat lokasi", url: "" },
  },
  { type: "RSVP", label: "RSVP", group: "Acara", defaults: { title: "Konfirmasi kehadiran" } },
  { type: "Guestbook", label: "Buku tamu", group: "Acara", defaults: { title: "Ucapan dan doa" } },
  {
    type: "GiftInfo",
    label: "Informasi hadiah",
    group: "Acara",
    defaults: { title: "Tanda kasih", description: "" },
  },
  {
    type: "PersonalizedGreeting",
    label: "Salam personal",
    group: "Tamu",
    defaults: { text: "Kepada tamu undangan" },
  },
  { type: "QRTicket", label: "Tiket QR", group: "Tamu", defaults: { title: "Tiket undangan" } },
  {
    type: "SeatingInfo",
    label: "Informasi tempat duduk",
    group: "Tamu",
    defaults: { text: "Informasi tempat duduk" },
  },
  {
    type: "ShareButtons",
    label: "Tombol berbagi",
    group: "Sosial",
    defaults: { label: "Bagikan undangan" },
  },
  {
    type: "LivestreamLink",
    label: "Tautan siaran langsung",
    group: "Sosial",
    defaults: { label: "Tonton siaran langsung", url: "" },
  },
  {
    type: "Shape",
    label: "Bentuk",
    group: "Dekorasi",
    defaults: { shape: "circle", color: "#eaded5" },
  },
  { type: "Icon", label: "Ikon", group: "Dekorasi", defaults: { name: "heart" } },
  { type: "Pattern", label: "Pola", group: "Dekorasi", defaults: { name: "dots" } },
  { type: "Background", label: "Latar", group: "Dekorasi", defaults: { color: "#fffaf6" } },
];

export function createNode(type: string): InvitationNode {
  const definition = COMPONENT_REGISTRY.find((item) => item.type === type);
  if (!definition) throw new Error("Komponen tidak terdaftar.");
  return {
    id: crypto.randomUUID(),
    type,
    props: structuredClone(definition.defaults),
    style: {},
    children: type === "Section" || type === "Container" || type === "Columns" ? [] : undefined,
  };
}

export function getSections(document: InvitationDocument): InvitationNode[] {
  return document.pages?.[0]?.sections || document.sections || [];
}

export function updateNode(
  document: InvitationDocument,
  nodeId: string,
  update: (node: InvitationNode) => InvitationNode,
): InvitationDocument {
  const visit = (nodes: InvitationNode[]): InvitationNode[] =>
    nodes.map((node) => ({
      ...node,
      ...(node.id === nodeId ? update(node) : {}),
      ...(node.children ? { children: visit(node.children) } : {}),
    }));
  if (document.pages?.length) {
    return {
      ...document,
      pages: document.pages.map((page, index) =>
        index === 0 ? { ...page, sections: visit(page.sections || []) } : page,
      ),
    };
  }
  return { ...document, sections: visit(document.sections || []) };
}

export function addNode(
  document: InvitationDocument,
  type: string,
  parentId?: string,
): InvitationDocument {
  const node = createNode(type);
  if (!parentId) {
    const sections = [...getSections(document), node];
    return document.pages?.length
      ? {
          ...document,
          pages: document.pages.map((page, i) => (i === 0 ? { ...page, sections } : page)),
        }
      : { ...document, sections };
  }
  return updateNode(document, parentId, (parent) => ({
    ...parent,
    children: [...(parent.children || []), node],
  }));
}

export function removeNode(document: InvitationDocument, nodeId: string): InvitationDocument {
  const remove = (nodes: InvitationNode[]): InvitationNode[] =>
    nodes
      .filter((node) => node.id !== nodeId)
      .map((node) => ({
        ...node,
        ...(node.children ? { children: remove(node.children) } : {}),
      }));
  return document.pages?.length
    ? {
        ...document,
        pages: document.pages.map((page) => ({ ...page, sections: remove(page.sections || []) })),
      }
    : { ...document, sections: remove(document.sections || []) };
}

export function moveNode(
  document: InvitationDocument,
  nodeId: string,
  direction: -1 | 1,
): InvitationDocument {
  const move = (nodes: InvitationNode[]): InvitationNode[] => {
    const index = nodes.findIndex((node) => node.id === nodeId);
    if (index >= 0) {
      const target = index + direction;
      if (target < 0 || target >= nodes.length) return nodes;
      const next = [...nodes];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    }
    return nodes.map((node) => (node.children ? { ...node, children: move(node.children) } : node));
  };
  return document.pages?.length
    ? {
        ...document,
        pages: document.pages.map((page) => ({ ...page, sections: move(page.sections || []) })),
      }
    : { ...document, sections: move(document.sections || []) };
}

export function findNode(nodes: InvitationNode[], id: string): InvitationNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const nested = node.children ? findNode(node.children, id) : undefined;
    if (nested) return nested;
  }
  return undefined;
}

export function validateDocument(document: InvitationDocument, title: string): string[] {
  const errors: string[] = [];
  if (!title.trim()) errors.push("Judul undangan wajib diisi.");
  if (document.schemaVersion !== 1) errors.push("Versi dokumen tidak didukung.");
  const sections = getSections(document);
  if (!sections.length) errors.push("Tambahkan minimal satu bagian.");
  const visit = (nodes: InvitationNode[]) =>
    nodes.forEach((node) => {
      if (!COMPONENT_REGISTRY.some((item) => item.type === node.type))
        errors.push(`Komponen ${node.type} tidak didukung.`);
      if (node.type === "Heading" || node.type === "Paragraph" || node.type === "RichText") {
        if (typeof node.props?.text !== "string" || !node.props.text.trim())
          errors.push(`Teks pada ${node.type} belum diisi.`);
      }
      if (node.type === "Image" && !node.props?.assetId) errors.push("Gambar belum dipilih.");
      if (node.type === "MapLink" || node.type === "LivestreamLink") {
        const url = node.props?.url;
        if (typeof url === "string" && url && !/^https:\/\//i.test(url))
          errors.push("Tautan harus menggunakan HTTPS.");
      }
      if (node.children) visit(node.children);
    });
  visit(sections);
  return [...new Set(errors)];
}

export function duplicateNode(document: InvitationDocument, nodeId: string): InvitationDocument {
  const cloneWithNewIds = (node: InvitationNode): InvitationNode => ({
    ...structuredClone(node),
    id: crypto.randomUUID(),
    children: node.children?.map(cloneWithNewIds),
  });
  const duplicate = (nodes: InvitationNode[]): InvitationNode[] => {
    const index = nodes.findIndex((node) => node.id === nodeId);
    if (index >= 0) {
      const next = [...nodes];
      next.splice(index + 1, 0, cloneWithNewIds(nodes[index]!));
      return next;
    }
    return nodes.map((node) =>
      node.children ? { ...node, children: duplicate(node.children) } : node,
    );
  };
  return document.pages?.length
    ? {
        ...document,
        pages: document.pages.map((page) => ({
          ...page,
          sections: duplicate(page.sections || []),
        })),
      }
    : { ...document, sections: duplicate(document.sections || []) };
}
