export type ImportFormat =
  | "canva"
  | "figma"
  | "psd"
  | "ai"
  | "affinity"
  | "pptx"
  | "svg"
  | "pdf"
  | "png"
  | "jpg"
  | "unknown";

export type ImportCapability = "supported" | "preview_only" | "unsupported" | "disabled";

export type ImportCompatibility = {
  format: ImportFormat;
  label: string;
  capability: ImportCapability;
  output: string;
  fallback: string;
};

export const IMPORT_COMPATIBILITY: ImportCompatibility[] = [
  { format: "canva", label: "Canva", capability: "disabled", output: "Belum ada koneksi API resmi yang disetujui.", fallback: "Ekspor desain dari Canva sebagai SVG, PDF, PNG, atau JPG." },
  { format: "figma", label: "Figma", capability: "disabled", output: "Belum ada koneksi API resmi yang disetujui.", fallback: "Ekspor frame dari Figma sebagai SVG, PDF, PNG, atau JPG." },
  { format: "psd", label: "PSD", capability: "unsupported", output: "Layer PSD belum dapat dibaca.", fallback: "Ekspor layer yang dibutuhkan menjadi PNG atau JPG." },
  { format: "ai", label: "Adobe Illustrator", capability: "unsupported", output: "Layer AI belum dapat dibaca.", fallback: "Ekspor artboard menjadi SVG yang disanitasi atau PNG." },
  { format: "affinity", label: "Affinity", capability: "unsupported", output: "Layer Affinity belum dapat dibaca.", fallback: "Ekspor artboard menjadi SVG atau PNG." },
  { format: "pptx", label: "PowerPoint", capability: "unsupported", output: "Parser PPTX belum tersedia; objek slide tidak diimpor.", fallback: "Ekspor slide menjadi PDF atau PNG." },
  { format: "svg", label: "SVG", capability: "supported", output: "SVG disanitasi, dirasterisasi, lalu ditambahkan sebagai aset gambar.", fallback: "Jika elemen kompleks berubah, ekspor ulang sebagai PNG." },
  { format: "pdf", label: "PDF", capability: "preview_only", output: "PDF hanya dibuka sebagai pratinjau lokal; halaman tidak diubah menjadi layer.", fallback: "Ekspor halaman PDF menjadi PNG untuk memasukkannya ke kanvas." },
  { format: "png", label: "PNG", capability: "supported", output: "Gambar dioptimalkan menjadi WebP dan ditambahkan sebagai aset.", fallback: "Gunakan JPG jika file PNG terlalu besar." },
  { format: "jpg", label: "JPG/JPEG", capability: "supported", output: "Gambar dioptimalkan menjadi WebP dan ditambahkan sebagai aset.", fallback: "Ekspor ulang dengan kualitas gambar yang lebih rendah jika terlalu besar." },
];

const extensionFormat: Record<string, ImportFormat> = {
  ".afdesign": "affinity",
  ".afphoto": "affinity",
  ".afpub": "affinity",
  ".ai": "ai",
  ".jpeg": "jpg",
  ".jpg": "jpg",
  ".pdf": "pdf",
  ".png": "png",
  ".pptx": "pptx",
  ".psd": "psd",
  ".svg": "svg",
};

export function classifyImport(filename: string): ImportCompatibility {
  const extension = filename.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || "";
  const format = extensionFormat[extension] || "unknown";
  return (
    IMPORT_COMPATIBILITY.find((item) => item.format === format) || {
      format: "unknown",
      label: "Format tidak dikenal",
      capability: "unsupported",
      output: "Format ini tidak dapat diproses.",
      fallback: "Gunakan SVG, PNG, JPG, atau PDF.",
    }
  );
}

export function validateImportSignature(bytes: Uint8Array, format: ImportFormat): boolean {
  if (format === "png")
    return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value);
  if (format === "jpg")
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (format === "pdf")
    return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  return false;
}

const allowedSvgElements = new Set([
  "svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
  "text", "tspan", "defs", "linearGradient", "radialGradient", "stop", "clipPath",
  "mask", "pattern", "title", "desc",
]);
const allowedSvgAttributes = new Set([
  "xmlns", "viewBox", "width", "height", "x", "y", "x1", "x2", "y1", "y2",
  "cx", "cy", "r", "rx", "ry", "d", "points", "fill", "fill-opacity", "fill-rule",
  "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-opacity",
  "opacity", "transform", "offset", "stop-color", "stop-opacity", "gradientUnits",
  "gradientTransform", "clip-path", "mask", "id", "text-anchor", "font-size",
  "font-weight", "dominant-baseline",
]);

export function sanitizeSvg(source: string): { markup: string; removed: number } {
  if (source.length > 5 * 1024 * 1024) throw new Error("Ukuran SVG melebihi batas 5 MB.");
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error("Deklarasi XML eksternal tidak diizinkan.");
  const parsed = new DOMParser().parseFromString(source, "image/svg+xml");
  const root = parsed.documentElement;
  if (parsed.querySelector("parsererror") || root.localName.toLowerCase() !== "svg")
    throw new Error("Struktur SVG tidak valid.");

  let removed = 0;
  const elements = [root, ...Array.from(root.querySelectorAll("*"))];
  for (const element of elements) {
    if (!allowedSvgElements.has(element.localName)) {
      element.remove();
      removed += 1;
      continue;
    }
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name;
      const value = attribute.value.trim();
      if (name === "xmlns" && value === "http://www.w3.org/2000/svg") continue;
      const safeInternalReference = /^url\(\s*#[a-zA-Z0-9_-]+\s*\)$/.test(value);
      if (
        !allowedSvgAttributes.has(name) ||
        name.toLowerCase().startsWith("on") ||
        name.toLowerCase() === "href" ||
        /javascript:|data:|https?:|\/\//i.test(value) ||
        (value.toLowerCase().includes("url(") && !safeInternalReference)
      ) {
        element.removeAttribute(name);
        removed += 1;
      }
    }
  }

  if (!root.hasAttribute("xmlns"))
    root.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return { markup: new XMLSerializer().serializeToString(root), removed };
}
