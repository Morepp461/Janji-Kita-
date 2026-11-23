import { describe, expect, it } from "vitest";
import {
  IMPORT_COMPATIBILITY,
  classifyImport,
  sanitizeSvg,
  validateImportSignature,
} from "./importPipeline";

describe("phase 8 import compatibility", () => {
  it("documents every target format and keeps unapproved integrations disabled", () => {
    expect(IMPORT_COMPATIBILITY.map((item) => item.format)).toEqual([
      "canva", "figma", "psd", "ai", "affinity", "pptx", "svg", "pdf", "png", "jpg",
    ]);
    expect(classifyImport("design.svg").capability).toBe("supported");
    expect(classifyImport("deck.pptx").capability).toBe("unsupported");
    expect(IMPORT_COMPATIBILITY.find((item) => item.format === "canva")?.capability).toBe("disabled");
    expect(IMPORT_COMPATIBILITY.find((item) => item.format === "figma")?.capability).toBe("disabled");
  });

  it("checks PNG, JPEG, and PDF signatures instead of trusting file extensions", () => {
    expect(validateImportSignature(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), "png")).toBe(true);
    expect(validateImportSignature(new Uint8Array([255, 216, 255, 0]), "jpg")).toBe(true);
    expect(validateImportSignature(new TextEncoder().encode("%PDF-1.7"), "pdf")).toBe(true);
    expect(validateImportSignature(new TextEncoder().encode("not a pdf"), "pdf")).toBe(false);
  });

  it("removes scripts, event handlers, external links, and unsafe elements from SVG", () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)" viewBox="0 0 10 10"><script>alert(1)</script><foreignObject><div>unsafe</div></foreignObject><a href="https://example.com"><path d="M0 0" onclick="alert(1)" fill="red"/></a><rect width="5" height="5" fill="url(https://evil.test/a.svg#x)"/></svg>';
    const result = sanitizeSvg(source);
    expect(result.markup).toContain("<svg");
    expect(result.markup).toContain("<path");
    expect(result.markup).toContain("<rect");
    expect(result.markup).not.toMatch(/script|foreignObject|onload|onclick|https:\/\/evil/i);
    expect(result.removed).toBeGreaterThanOrEqual(5);
  });

  it("rejects malformed SVG and oversized source files", () => {
    expect(() => sanitizeSvg("<svg><path></svg>")).toThrow("Struktur SVG tidak valid.");
    expect(() => sanitizeSvg("x".repeat(5 * 1024 * 1024 + 1))).toThrow("Ukuran SVG melebihi batas 5 MB.");
  });
});
