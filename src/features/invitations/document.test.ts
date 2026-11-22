import { describe, expect, it } from "vitest";
import { createBlankInvitationDocument, isInvitationDocument } from "./document";

describe("dokumen undangan fase 2", () => {
  it("membuat kanvas kosong dengan struktur versi 1", () => {
    const document = createBlankInvitationDocument("Pernikahan Dina & Raka");
    expect(document.schemaVersion).toBe(1);
    expect(document.pages?.[0]?.sections?.[0]?.children?.[0]?.props?.text).toBe("Pernikahan Dina & Raka");
  });

  it("menolak dokumen dengan skema yang tidak didukung", () => {
    expect(isInvitationDocument({ schemaVersion: 2, pages: [] })).toBe(false);
    expect(isInvitationDocument({ schemaVersion: 1, pages: [] })).toBe(true);
    expect(isInvitationDocument(null)).toBe(false);
  });
});
