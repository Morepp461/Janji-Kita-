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
  {
    format: "canva",
    label: "Canva",
    capability: "disabled",
    output: "Belum ada koneksi API resmi yang disetujui.",
    fallback: "Ekspor desain dari Canva sebagai SVG, PDF, PNG, atau JPG.",
  },
  {
    format: "figma",
    label: "Figma",
    capability: "disabled",
    output: "Belum ada koneksi API resmi yang disetujui.",
    fallback: "Ekspor frame dari Figma sebagai SVG, PDF, PNG, atau JPG.",
  },
  {
    format: "psd",
    label: "PSD",
    capability: "unsupported",
    output: "Layer PSD belum dapat dibaca.",
    fallback: "Ekspor layer yang dibutuhkan menjadi PNG atau JPG.",
  },
  {
    format: "ai",
    label: "Adobe Illustrator",
    capability: "unsupported",
    output: "Layer AI belum dapat dibaca.",
    fallback: "Ekspor artboard menjadi SVG yang disanitasi atau PNG.",
  },
  {
    format: "affinity",
    label: "Affinity",
    capability: "unsupported",
    output: "Layer Affinity belum dapat dibaca.",
    fallback: "Ekspor artboard menjadi SVG atau PNG.",
  },
  {
    format: "pptx",
    label: "PowerPoint",
    capability: "unsupported",
    output: "Parser PPTX belum tersedia; objek slide tidak diimpor.",
    fallback: "Ekspor slide menjadi PDF atau PNG.",
  },
  {
    format: "svg",
    label: "SVG",
    capability: "supported",
    output: "SVG disanitasi, dirasterisasi, lalu ditambahkan sebagai aset gambar.",
    fallback: "Jika elemen kompleks berubah, ekspor ulang sebagai PNG.",
  },
  {
    format: "pdf",
    label: "PDF",
    capability: "preview_only",
    output: "PDF hanya ...[truncated]