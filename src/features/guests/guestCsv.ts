export type GuestCsvRow = {
  display_name: string;
  email: string | null;
  phone: string | null;
  guest_group: string | null;
  plus_one_allowed: boolean;
};
export type GuestCsvIssue = { row: number; message: string };
function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && quoted && line[i + 1] === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      cells.push(value.trim());
      value = "";
    } else value += char;
  }
  cells.push(value.trim());
  return cells;
}
export function parseGuestCsv(content: string): { rows: GuestCsvRow[]; issues: GuestCsvIssue[] } {
  const lines = content
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "");
  if (lines.length < 2)
    return { rows: [], issues: [{ row: 1, message: "CSV belum memiliki baris data." }] };
  const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase().replace(/\s+/g, "_"));
  const nameIndex = headers.findIndex((header) =>
    ["display_name", "nama", "nama_tamu"].includes(header),
  );
  if (nameIndex < 0)
    return {
      rows: [],
      issues: [{ row: 1, message: "Kolom wajib 'nama' atau 'display_name' tidak ditemukan." }],
    };
  const index = (names: string[]) => headers.findIndex((header) => names.includes(header));
  const emailIndex = index(["email"]),
    phoneIndex = index(["phone", "telepon", "no_hp"]);
  const groupIndex = index(["guest_group", "group", "kelompok"]);
  const plusIndex = index(["plus_one_allowed", "plus_one", "boleh_tambah_tamu"]);
  const rows: GuestCsvRow[] = [],
    issues: GuestCsvIssue[] = [];
  lines.slice(1).forEach((line, rowIndex) => {
    const cells = parseCsvLine(line),
      name = cells[nameIndex]?.trim() || "";
    if (!name || name.length > 120) {
      issues.push({
        row: rowIndex + 2,
        message: "Nama tamu wajib diisi dan maksimal 120 karakter.",
      });
      return;
    }
    const email = emailIndex >= 0 ? cells[emailIndex]?.trim() || "" : "";
    const phone = phoneIndex >= 0 ? cells[phoneIndex]?.trim() || "" : "";
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      issues.push({ row: rowIndex + 2, message: "Format email tidak valid." });
      return;
    }
    rows.push({
      display_name: name,
      email: email || null,
      phone: phone || null,
      guest_group: groupIndex >= 0 ? cells[groupIndex]?.trim() || null : null,
      plus_one_allowed:
        plusIndex >= 0 &&
        ["1", "true", "yes", "ya"].includes((cells[plusIndex] || "").toLowerCase()),
    });
  });
  return { rows, issues };
}
export function exportGuestsCsv(rows: Array<Record<string, unknown>>): string {
  const headers = [
    "nama",
    "email",
    "telepon",
    "kelompok",
    "boleh_plus_one",
    "status",
    "rsvp",
    "jumlah_hadir",
    "check_in",
  ];
  const quote = (value: unknown) => {
    let text = String(value ?? "");
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  const lines = rows.map((row) =>
    [
      row.display_name,
      row.email,
      row.phone,
      row.guest_group,
      row.plus_one_allowed ? "Ya" : "Tidak",
      row.status,
      row.rsvp_response,
      row.attendee_count,
      row.checked_in_at,
    ]
      .map(quote)
      .join(","),
  );
  return [headers.map(quote).join(","), ...lines].join("\r\n");
}
