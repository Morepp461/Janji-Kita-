import { describe, expect, it } from "vitest";
import { createQrSvg } from "../../lib/qr";

describe("QR tiket", () => {
  it("membuat SVG QR versi ringkas untuk token acak 16 karakter", () => {
    const svg = createQrSvg("0123456789abcdef");
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('viewBox="0 0 29 29"');
    expect(svg.match(/<rect /g)?.length).toBeGreaterThan(50);
  });

  it("menolak token yang melebihi kapasitas QR yang didukung", () => {
    expect(() => createQrSvg("token-terlalu-panjang-untuk-qr-versi-satu")).toThrow("terlalu panjang");
  });
});
