import { describe, expect, it } from "vitest";
import { parseGuestCsv, exportGuestsCsv } from "./guestCsv";

describe("guest CSV", () => {
  it("membaca kolom Indonesia dan menangani koma di dalam tanda kutip", () => {
    const result = parseGuestCsv(
      'nama,email,kelompok,plus_one\n"Dina, Putri",dina@example.com,"Keluarga, inti",ya',
    );
    expect(result.issues).toEqual([]);
    expect(result.rows).toEqual([
      {
        display_name: "Dina, Putri",
        email: "dina@example.com",
        phone: null,
        guest_group: "Keluarga, inti",
        plus_one_allowed: true,
      },
    ]);
  });

  it("melaporkan nama kosong dan email tidak valid per baris", () => {
    const result = parseGuestCsv("nama,email\n,valid@example.com\nBudi,bukan-email");
    expect(result.rows).toHaveLength(0);
    expect(result.issues.map((issue) => issue.row)).toEqual([2, 3]);
  });

  it("menolak header tanpa kolom nama", () => {
    expect(parseGuestCsv("email,telepon\na@b.co,0812").issues[0].message).toContain("kolom wajib");
  });

  it("mengutip nilai ekspor untuk CSV yang valid", () => {
    expect(exportGuestsCsv([{ display_name: 'A "B"', email: null }])).toContain('"A ""B"""');
  });
});
