export type InvitationNode = {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  style?: Record<string, unknown>;
  responsive?: { mobile?: { hidden?: boolean }; desktop?: { hidden?: boolean } };
  children?: InvitationNode[];
};

export type InvitationDocument = {
  schemaVersion: number;
  documentId?: string;
  locale?: string;
  timezone?: string;
  themeTokens?: Record<string, unknown>;
  pages?: Array<{ id: string; sections?: InvitationNode[] }>;
  sections?: InvitationNode[];
  assets?: unknown[];
  metadata?: Record<string, unknown>;
};

export function createBlankInvitationDocument(title: string): InvitationDocument {
  return {
    schemaVersion: 1,
    documentId: crypto.randomUUID(),
    locale: "id-ID",
    timezone: "Asia/Jakarta",
    themeTokens: {},
    pages: [
      {
        id: "page-1",
        sections: [
          {
            id: "section-1",
            type: "Section",
            props: { background: "#fffaf6", padding: 32 },
            children: [
              {
                id: "heading-1",
                type: "Heading",
                props: { text: title, level: 1 },
                style: { textAlign: "center" },
              },
              {
                id: "paragraph-1",
                type: "Paragraph",
                props: { text: "Lengkapi detail acara Anda di editor pada fase berikutnya." },
                style: { textAlign: "center" },
              },
            ],
          },
        ],
      },
    ],
    assets: [],
    metadata: {},
  };
}

export function isInvitationDocument(value: unknown): value is InvitationDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.schemaVersion === 1 &&
    (Array.isArray(candidate.pages) || Array.isArray(candidate.sections))
  );
}
