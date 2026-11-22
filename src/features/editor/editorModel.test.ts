import { describe, expect, it } from "vitest";
import { addNode, createNode, duplicateNode, getSections, moveNode, removeNode, updateNode, validateDocument } from "./editorModel";
import { createBlankInvitationDocument } from "../invitations/document";

describe("model editor visual", () => {
  it("menyediakan registry komponen yang stabil", () => {
    expect(createNode("Heading").type).toBe("Heading");
    expect(() => createNode("Unknown")).toThrow();
  });

  it("menambah, mengubah, memindahkan, dan menghapus komponen", () => {
    let doc = createBlankInvitationDocument("Undangan");
    doc = addNode(doc, "Divider");
    const divider = getSections(doc)[1]!;
    doc = updateNode(doc, divider.id, (node) => ({ ...node, props: { ...node.props, test: true } }));
    expect(getSections(doc)[1]?.props?.test).toBe(true);
    doc = moveNode(doc, divider.id, -1);
    expect(getSections(doc)[0]?.id).toBe(divider.id);
    doc = removeNode(doc, divider.id);
    expect(getSections(doc)).toHaveLength(1);
  });

  it("menduplikasi lapisan dengan ID baru", () => {
    const doc = createBlankInvitationDocument("Undangan");
    const original = getSections(doc)[0]!;
    const duplicated = duplicateNode(doc, original.id);
    expect(getSections(duplicated)).toHaveLength(2);
    expect(getSections(duplicated)[0]?.id).not.toBe(getSections(duplicated)[1]?.id);
  });

  it("menambahkan komponen sebagai anak container", () => {
    let doc = createBlankInvitationDocument("Undangan");
    const section = getSections(doc)[0]!;
    doc = addNode(doc, "Paragraph", section.id);
    expect(getSections(doc)[0]?.children).toHaveLength(3);
  });

  it("memvalidasi judul, konten, komponen, dan tautan", () => {
    const doc = createBlankInvitationDocument("");
    expect(validateDocument(doc, "")).toContain("Judul undangan wajib diisi.");
    expect(validateDocument(doc, "Undangan")).toHaveLength(0);
    const invalid = updateNode(doc, "paragraph-1", (node) => ({ ...node, props: { text: "" } }));
    expect(validateDocument(invalid, "Undangan").length).toBeGreaterThan(0);
  });
});
