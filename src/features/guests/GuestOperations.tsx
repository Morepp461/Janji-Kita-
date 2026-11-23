import { useCallback, useEffect, useMemo, useState, useRef, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createQrSvg } from "../../lib/qr";
import { exportGuestsCsv, parseGuestCsv, type GuestCsvIssue, type GuestCsvRow } from "./guestCsv";

type Guest = {
  id: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  guest_group: string | null;
  plus_one_allowed: boolean;
  status: string;
  rsvps?:
    | { response: string; attendee_count: number }
    | { response: string; attendee_count: number }[]
    | null;
  tickets?:
    | {
        ticket_code: string;
        status: string;
        checkins?:
          | { checked_in_at: string; method: string }
          | { checked_in_at: string; method: string }[]
          | null;
      }
    | {
        ticket_code: string;
        status: string;
        checkins?:
          | { checked_in_at: string; method: string }
          | { checked_in_at: string; method: string }[]
          | null;
      }[]
    | null;
};

type GuestbookEntry = {
  id: string;
  display_name: string;
  message: string;
  moderation_status: string;
  created_at: string;
};

type TicketPreview = { guestName: string; ticketCode: string; token: string };
type GuestStats = {
  total: number;
  confirmed: number;
  declined: number;
  pending: number;
  checkedIn: number;
};
type BarcodeDetectorLike = {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
};
type BarcodeDetectorConstructor = new (options: { formats: string[] }) => BarcodeDetectorLike;

function firstRelation<T>(relation: T | T[] | null | undefined): T | undefined {
  return Array.isArray(relation) ? relation[0] : (relation ?? undefined);
}

const token = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};
const hash = async (value: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
const moneylessStatus: Record<string, string> = {
  invited: "Diundang",
  viewed: "Dibuka",
  responded: "Sudah RSVP",
  checked_in: "Hadir",
};
const responseLabel: Record<string, string> = {
  yes: "Hadir",
  no: "Tidak hadir",
  maybe: "Belum pasti",
};

export default function GuestOperations({
  client,
  invitationId,
}: {
  client: SupabaseClient;
  invitationId: string;
}) {
  const [invitation, setInvitation] = useState<{
    title: string;
    slug: string;
    status: string;
  } | null>(null);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [entries, setEntries] = useState<GuestbookEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeTab, setActiveTab] = useState<"guests" | "checkin" | "guestbook">("guests");
  const [form, setForm] = useState({
    display_name: "",
    email: "",
    phone: "",
    guest_group: "",
    plus_one_allowed: false,
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [importIssues, setImportIssues] = useState<GuestCsvIssue[]>([]);
  const [importSummary, setImportSummary] = useState("");
  const [ticket, setTicket] = useState<TicketPreview | null>(null);
  const [personalLink, setPersonalLink] = useState("");
  const [checkinToken, setCheckinToken] = useState("");
  const [checkinResult, setCheckinResult] = useState<{
    status: string;
    guest_name?: string;
  } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scannerMessage, setScannerMessage] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    const [invitationResult, guestResult, entryResult] = await Promise.all([
      client.from("invitations").select("title,slug,status").eq("id", invitationId).maybeSingle(),
      client
        .from("guests")
        .select(
          "id,display_name,email,phone,guest_group,plus_one_allowed,status,rsvps(response,attendee_count),tickets(ticket_code,status,checkins(checked_in_at,method))",
        )
        .eq("invitation_id", invitationId)
        .order("display_name"),
      client
        .from("guestbook_entries")
        .select("id,display_name,message,moderation_status,created_at")
        .eq("invitation_id", invitationId)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    if (invitationResult.error) setError(invitationResult.error.message);
    else setInvitation(invitationResult.data);
    if (guestResult.error) setError(guestResult.error.message);
    else setGuests((guestResult.data || []) as Guest[]);
    if (entryResult.error) setError(entryResult.error.message);
    else setEntries((entryResult.data || []) as GuestbookEntry[]);
    setLoading(false);
  }, [client, invitationId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(
    () =>
      guests.filter((guest) => {
        const matches = [
          guest.display_name,
          guest.email || "",
          guest.phone || "",
          guest.guest_group || "",
        ].some((value) => value.toLowerCase().includes(search.toLowerCase()));
        return matches && (statusFilter === "all" || guest.status === statusFilter);
      }),
    [guests, search, statusFilter],
  );

  const stats: GuestStats = useMemo(
    () => ({
      total: guests.length,
      confirmed: guests.filter((guest) => firstRelation(guest.rsvps)?.response === "yes").length,
      declined: guests.filter((guest) => firstRelation(guest.rsvps)?.response === "no").length,
      pending: guests.filter((guest) => !firstRelation(guest.rsvps)).length,
      checkedIn: guests.filter(
        (guest) =>
          guest.status === "checked_in" ||
          Boolean(firstRelation(firstRelation(guest.tickets)?.checkins)),
      ).length,
    }),
    [guests],
  );

  async function saveGuest(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    const payload = {
      display_name: form.display_name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      guest_group: form.guest_group.trim() || null,
      plus_one_allowed: form.plus_one_allowed,
    };
    const result = editingId
      ? await client
          .from("guests")
          .update(payload)
          .eq("id", editingId)
          .eq("invitation_id", invitationId)
      : await client.from("guests").insert({ ...payload, invitation_id: invitationId });
    if (result.error) setError(result.error.message);
    else {
      setNotice(editingId ? "Data tamu diperbarui." : "Tamu berhasil ditambahkan.");
      setForm({ display_name: "", email: "", phone: "", guest_group: "", plus_one_allowed: false });
      setEditingId(null);
      await refresh();
    }
    setSaving(false);
  }

  function startEdit(guest: Guest) {
    setEditingId(guest.id);
    setForm({
      display_name: guest.display_name,
      email: guest.email || "",
      phone: guest.phone || "",
      guest_group: guest.guest_group || "",
      plus_one_allowed: guest.plus_one_allowed,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteGuest(guest: Guest) {
    if (!window.confirm(`Hapus tamu "${guest.display_name}" beserta RSVP dan tiketnya?`)) return;
    const { error: deleteError } = await client
      .from("guests")
      .delete()
      .eq("id", guest.id)
      .eq("invitation_id", invitationId);
    if (deleteError) setError(deleteError.message);
    else {
      setNotice("Tamu dihapus.");
      await refresh();
    }
  }

  async function createPersonalLink(guest: Guest) {
    if (!invitation?.slug) return;
    setError("");
    setNotice("");
    const raw = token();
    const { error: updateError } = await client
      .from("guests")
      .update({ personalized_token_hash: await hash(raw) })
      .eq("id", guest.id);
    if (updateError) setError(updateError.message);
    else {
      const url = `${window.location.origin}/i/${encodeURIComponent(invitation.slug)}?guest=${encodeURIComponent(raw)}`;
      setPersonalLink(url);
      await navigator.clipboard?.writeText(url).catch(() => undefined);
      setNotice("Tautan personal dibuat. Salin dan simpan, karena token tidak ditampilkan ulang.");
    }
  }

  async function issueTicket(guest: Guest) {
    const raw = token();
    const { data, error: rpcError } = await client.rpc("issue_guest_ticket", {
      p_guest_id: guest.id,
      p_token_hash: await hash(raw),
    });
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    const result = data as { ticket_code: string };
    setTicket({ guestName: guest.display_name, ticketCode: result.ticket_code, token: raw });
    setNotice("Tiket QR diterbitkan. Token hanya ditampilkan sekali; simpan atau cetak tiket ini.");
    await refresh();
  }

  async function checkIn(rawToken: string) {
    setError("");
    setNotice("");
    setCheckinResult(null);
    if (!rawToken.trim()) return;
    const { data, error: rpcError } = await client.rpc("check_in_ticket", {
      p_token_hash: await hash(rawToken.trim()),
      p_device_label: navigator.userAgent.slice(0, 80),
    });
    if (rpcError) setError(rpcError.message);
    else {
      const result = data as { status: string; guest_name?: string };
      setCheckinResult(result);
      if (result.status === "checked_in")
        setNotice(`${result.guest_name || "Tamu"} berhasil check-in.`);
      else if (result.status === "duplicate")
        setError(`Tiket ${result.guest_name || ""} sudah pernah digunakan.`);
      else setError("Tiket tidak valid atau tidak berlaku untuk undangan ini.");
      await refresh();
    }
  }

  async function startScanner() {
    const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor })
      .BarcodeDetector;
    if (!Detector) {
      setScannerMessage(
        "Pemindaian kamera QR belum didukung browser ini. Gunakan kolom token atau check-in manual.",
      );
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerMessage("Akses kamera tidak tersedia. Gunakan kolom token atau check-in manual.");
      return;
    }
    let stream: MediaStream | null = null;
    try {
      setScannerMessage("");
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
      });
      streamRef.current = stream;
      setScanning(true);
      const video = videoRef.current;
      if (!video) throw new Error("Tampilan kamera belum siap.");
      video.srcObject = stream;
      await video.play();
      const detector = new Detector({ formats: ["qr_code"] });
      while (stream.active && streamRef.current === stream) {
        const results = await detector.detect(video);
        const scanned = results.find((result) => result.rawValue)?.rawValue;
        if (scanned) {
          setCheckinToken(scanned);
          await checkIn(scanned);
          break;
        }
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      }
    } catch (scanError) {
      setScannerMessage(
        scanError instanceof Error ? scanError.message : "Kamera tidak dapat digunakan.",
      );
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
      if (streamRef.current === stream) streamRef.current = null;
      setScanning(false);
    }
  }

  function stopScanner() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanning(false);
  }

  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  async function manualCheckIn(guest: Guest) {
    const { data, error: rpcError } = await client.rpc("check_in_guest_manually", {
      p_guest_id: guest.id,
      p_device_label: navigator.userAgent.slice(0, 80),
    });
    if (rpcError) setError(rpcError.message);
    else {
      const result = data as { status: string; guest_name?: string };
      if (result.status === "checked_in")
        setNotice(`${result.guest_name} berhasil ditandai hadir.`);
      else
        setError(
          result.status === "duplicate" ? "Tamu sudah check-in." : "Tamu tidak dapat check-in.",
        );
      await refresh();
    }
  }

  async function importFile(file?: File) {
    if (!file) return;
    setError("");
    setImportIssues([]);
    setImportSummary("");
    const parsed = parseGuestCsv(await file.text());
    const issues = [...parsed.issues];
    let imported = 0;
    for (let index = 0; index < parsed.rows.length; index += 1) {
      const row: GuestCsvRow = parsed.rows[index];
      const { error: insertError } = await client
        .from("guests")
        .insert({ ...row, invitation_id: invitationId });
      if (insertError) issues.push({ row: index + 2, message: insertError.message });
      else imported += 1;
    }
    setImportIssues(issues);
    setImportSummary(`${imported} tamu berhasil diimpor; ${issues.length} baris perlu diperiksa.`);
    await refresh();
  }

  async function exportCsv() {
    const rows = guests.map((guest) => ({
      ...guest,
      rsvp_response: firstRelation(guest.rsvps)?.response || "",
      attendee_count: firstRelation(guest.rsvps)?.attendee_count ?? "",
      checked_in_at: firstRelation(firstRelation(guest.tickets)?.checkins)?.checked_in_at || "",
    }));
    const blob = new Blob(["\\uFEFF", exportGuestsCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `tamu-${invitation?.slug || invitationId}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function exportGuestbookCsv() {
    const quote = (value: unknown) => {
      let text = String(value ?? "");
      if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
      return '"' + text.replace(/"/g, '""') + '"';
    };
    const rows = entries.map((entry) =>
      [entry.display_name, entry.message, entry.moderation_status, entry.created_at]
        .map(quote)
        .join(","),
    );
    const csv = [["nama", "ucapan", "status", "tanggal"].map(quote).join(","), ...rows].join(
      "\r\n",
    );
    const blob = new Blob(["\\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `ucapan-${invitation?.slug || invitationId}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function moderate(entry: GuestbookEntry, status: "approved" | "rejected") {
    const { error: updateError } = await client
      .from("guestbook_entries")
      .update({ moderation_status: status, moderated_at: new Date().toISOString() })
      .eq("id", entry.id);
    if (updateError) setError(updateError.message);
    else {
      setNotice("Moderasi ucapan diperbarui.");
      await refresh();
    }
  }

  if (loading)
    return (
      <main className="min-h-screen bg-[#fffaf6] p-8 text-center text-[#76675f]">
        Memuat data tamu...
      </main>
    );
  if (error && !invitation)
    return <main className="min-h-screen bg-[#fffaf6] p-8 text-center text-red-700">{error}</main>;

  return (
    <main className="min-h-screen bg-[#fffaf6] px-4 py-7 text-[#30251f] sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <a href="/" className="text-sm font-semibold text-[#9a6953]">
              ← Ruang kerja
            </a>
            <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Tamu & RSVP</h1>
            <p className="mt-1 text-sm text-[#76675f]">
              {invitation?.title || "Undangan"} · status {invitation?.status}
            </p>
          </div>
          <button
            onClick={() => void refresh()}
            className="rounded-xl border border-[#ddcec3] bg-white px-4 py-2 text-sm font-semibold"
          >
            Muat ulang
          </button>
        </header>

        {(error || notice) && (
          <p
            role="status"
            className={`rounded-xl px-4 py-3 text-sm ${error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-800"}`}
          >
            {error || notice}
          </p>
        )}

        <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            ["Total tamu", stats.total],
            ["Konfirmasi hadir", stats.confirmed],
            ["Tidak hadir", stats.declined],
            ["Belum RSVP", stats.pending],
            ["Sudah check-in", stats.checkedIn],
          ].map(([label, value]) => (
            <article key={label} className="rounded-2xl border border-[#eaded5] bg-white p-4">
              <p className="text-xs text-[#887970]">{label}</p>
              <p className="mt-2 text-2xl font-semibold">{value}</p>
            </article>
          ))}
        </section>

        <nav className="flex flex-wrap gap-2" aria-label="Menu operasi tamu">
          {(
            [
              ["guests", "Daftar tamu"],
              ["checkin", "Check-in"],
              ["guestbook", "Buku tamu"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${activeTab === key ? "bg-[#754b3b] text-white" : "border border-[#ddcec3] bg-white"}`}
            >
              {label}
            </button>
          ))}
        </nav>

        {activeTab === "guests" && (
          <>
            <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
              <form
                onSubmit={saveGuest}
                className="rounded-2xl border border-[#eaded5] bg-white p-5"
              >
                <h2 className="text-lg font-semibold">
                  {editingId ? "Ubah data tamu" : "Tambah tamu"}
                </h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="text-sm sm:col-span-2">
                    Nama tamu
                    <input
                      required
                      maxLength={120}
                      value={form.display_name}
                      onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-[#ddcec3] px-3 py-2.5"
                    />
                  </label>
                  <label className="text-sm">
                    Email
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-[#ddcec3] px-3 py-2.5"
                    />
                  </label>
                  <label className="text-sm">
                    Nomor telepon
                    <input
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-[#ddcec3] px-3 py-2.5"
                    />
                  </label>
                  <label className="text-sm sm:col-span-2">
                    Kelompok tamu
                    <input
                      value={form.guest_group}
                      onChange={(e) => setForm({ ...form, guest_group: e.target.value })}
                      placeholder="Keluarga, teman, rekan kerja..."
                      className="mt-1 w-full rounded-xl border border-[#ddcec3] px-3 py-2.5"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={form.plus_one_allowed}
                      onChange={(e) => setForm({ ...form, plus_one_allowed: e.target.checked })}
                    />{" "}
                    Mengizinkan satu tamu tambahan
                  </label>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    disabled={saving}
                    className="rounded-xl bg-[#754b3b] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {saving ? "Menyimpan..." : editingId ? "Simpan perubahan" : "Tambah tamu"}
                  </button>
                  {editingId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        setForm({
                          display_name: "",
                          email: "",
                          phone: "",
                          guest_group: "",
                          plus_one_allowed: false,
                        });
                      }}
                      className="rounded-xl border border-[#ddcec3] px-4 py-2.5 text-sm"
                    >
                      Batal
                    </button>
                  )}
                </div>
              </form>
              <div className="rounded-2xl border border-[#eaded5] bg-white p-5">
                <h2 className="text-lg font-semibold">Impor & ekspor CSV</h2>
                <p className="mt-1 text-sm leading-5 text-[#76675f]">
                  Kolom wajib: nama atau display_name. Kolom opsional: email, telepon, kelompok,
                  plus_one_allowed.
                </p>
                <label className="mt-4 block text-sm font-semibold">
                  Impor file CSV
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="mt-2 block w-full text-sm"
                    onChange={(e) => void importFile(e.target.files?.[0])}
                  />
                </label>
                <button
                  onClick={() => void exportCsv()}
                  className="mt-4 rounded-xl border border-[#ddcec3] px-4 py-2.5 text-sm font-semibold"
                >
                  Ekspor seluruh tamu
                </button>
                {importSummary && <p className="mt-3 text-sm font-medium">{importSummary}</p>}
                {importIssues.length > 0 && (
                  <ul className="mt-2 max-h-36 space-y-1 overflow-auto text-xs text-red-700">
                    {importIssues.map((issue, i) => (
                      <li key={i}>
                        Baris {issue.row}: {issue.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-[#eaded5] bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Daftar tamu ({filtered.length})</h2>
                <div className="flex flex-wrap gap-2">
                  <input
                    aria-label="Cari tamu"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari nama, email, telepon..."
                    className="rounded-xl border border-[#ddcec3] px-3 py-2 text-sm"
                  />
                  <select
                    aria-label="Filter status tamu"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="rounded-xl border border-[#ddcec3] px-3 py-2 text-sm"
                  >
                    <option value="all">Semua status</option>
                    <option value="invited">Diundang</option>
                    <option value="viewed">Dibuka</option>
                    <option value="responded">Sudah RSVP</option>
                    <option value="checked_in">Hadir</option>
                  </select>
                </div>
              </div>
              <div className="mt-4 divide-y divide-[#f0e8e2]">
                {filtered.map((guest) => (
                  <article
                    key={guest.id}
                    className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                  >
                    <div>
                      <p className="font-semibold">{guest.display_name}</p>
                      <p className="text-xs text-[#887970]">
                        {[guest.email, guest.phone, guest.guest_group]
                          .filter(Boolean)
                          .join(" · ") || "Tidak ada detail kontak"}
                      </p>
                      <p className="mt-1 text-xs text-[#76675f]">
                        {moneylessStatus[guest.status] || guest.status} · RSVP:{" "}
                        {responseLabel[firstRelation(guest.rsvps)?.response || ""] || "Belum ada"} ·
                        Tiket: {firstRelation(guest.tickets)?.status || "Belum dibuat"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => void createPersonalLink(guest)}
                        className="rounded-lg border border-[#ddcec3] px-3 py-2 text-xs font-semibold"
                      >
                        Tautan personal
                      </button>
                      <button
                        onClick={() => void issueTicket(guest)}
                        className="rounded-lg border border-[#ddcec3] px-3 py-2 text-xs font-semibold"
                      >
                        Buat tiket QR
                      </button>
                      <button
                        onClick={() => startEdit(guest)}
                        className="rounded-lg border border-[#ddcec3] px-3 py-2 text-xs font-semibold"
                      >
                        Ubah
                      </button>
                      <button
                        onClick={() => void deleteGuest(guest)}
                        className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700"
                      >
                        Hapus
                      </button>
                    </div>
                  </article>
                ))}
                {filtered.length === 0 && (
                  <p className="py-8 text-center text-sm text-[#887970]">
                    Tidak ada tamu yang cocok.
                  </p>
                )}
              </div>
            </section>
            {personalLink && (
              <section className="rounded-2xl border border-[#eaded5] bg-white p-5">
                <h2 className="font-semibold">Tautan personal</h2>
                <input
                  readOnly
                  value={personalLink}
                  className="mt-2 w-full rounded-xl border border-[#ddcec3] p-3 text-sm"
                />
                <button
                  onClick={() => void navigator.clipboard?.writeText(personalLink)}
                  className="mt-2 rounded-lg bg-[#754b3b] px-3 py-2 text-xs font-semibold text-white"
                >
                  Salin tautan
                </button>
              </section>
            )}
            {ticket && (
              <section className="rounded-2xl border border-[#eaded5] bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">Tiket QR · {ticket.guestName}</h2>
                    <p className="mt-1 text-sm text-[#76675f]">Kode tiket: {ticket.ticketCode}</p>
                  </div>
                  <button onClick={() => setTicket(null)} className="text-sm text-[#76675f]">
                    Tutup
                  </button>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-5">
                  <div
                    className="h-44 w-44"
                    dangerouslySetInnerHTML={{ __html: createQrSvg(ticket.token) }}
                  />
                  <div className="max-w-md text-sm">
                    <p>
                      QR berisi token acak, bukan data pribadi tamu. Simpan atau cetak tampilan ini
                      untuk dibawa saat acara.
                    </p>
                    <button
                      onClick={() => window.print()}
                      className="mt-3 rounded-xl bg-[#754b3b] px-4 py-2 text-white"
                    >
                      Cetak tiket
                    </button>
                  </div>
                </div>
              </section>
            )}
          </>
        )}

        {activeTab === "checkin" && (
          <section className="rounded-2xl border border-[#eaded5] bg-white p-5">
            <h2 className="text-lg font-semibold">Validasi tiket & check-in</h2>
            <p className="mt-1 text-sm text-[#76675f]">
              Pindai QR dengan kamera/perangkat pemindai, lalu masukkan token yang terbaca. Check-in
              manual tersedia dari daftar tamu.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void checkIn(checkinToken);
              }}
              className="mt-4 flex flex-col gap-2 sm:flex-row"
            >
              <input
                value={checkinToken}
                onChange={(e) => setCheckinToken(e.target.value)}
                placeholder="Token dari QR tiket"
                className="min-w-0 flex-1 rounded-xl border border-[#ddcec3] px-3 py-3"
              />
              <button className="rounded-xl bg-[#754b3b] px-5 py-3 text-sm font-semibold text-white">
                Validasi & check-in
              </button>
            </form>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void startScanner()}
                disabled={scanning}
                className="rounded-xl border border-[#ddcec3] px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                {scanning ? "Memindai QR..." : "Buka kamera pemindai QR"}
              </button>
              {scanning && (
                <button
                  type="button"
                  onClick={stopScanner}
                  className="rounded-xl border border-red-200 px-4 py-2 text-sm text-red-700"
                >
                  Hentikan kamera
                </button>
              )}
            </div>
            <video
              ref={videoRef}
              muted
              playsInline
              className={
                scanning
                  ? "mt-3 aspect-video w-full max-w-lg rounded-xl bg-black object-cover"
                  : "hidden"
              }
            />
            {scannerMessage && <p className="mt-2 text-sm text-[#76675f]">{scannerMessage}</p>}
            {checkinResult && (
              <p className="mt-3 text-sm">
                {checkinResult.status === "checked_in"
                  ? "Check-in berhasil"
                  : checkinResult.status === "duplicate"
                    ? "Tiket sudah digunakan"
                    : "Tiket tidak valid"}
              </p>
            )}
            <h3 className="mt-6 font-semibold">Check-in manual</h3>
            <div className="mt-2 divide-y divide-[#f0e8e2]">
              {guests
                .filter((guest) => guest.status !== "checked_in")
                .map((guest) => (
                  <div key={guest.id} className="flex items-center justify-between gap-3 py-3">
                    <span className="text-sm">{guest.display_name}</span>
                    <button
                      onClick={() => void manualCheckIn(guest)}
                      className="rounded-lg border border-[#ddcec3] px-3 py-2 text-xs font-semibold"
                    >
                      Tandai hadir
                    </button>
                  </div>
                ))}
            </div>
          </section>
        )}

        {activeTab === "guestbook" && (
          <section className="rounded-2xl border border-[#eaded5] bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Moderasi buku tamu</h2>
              <button
                onClick={() => void exportGuestbookCsv()}
                className="rounded-xl border border-[#ddcec3] px-3 py-2 text-xs font-semibold"
              >
                Ekspor ucapan CSV
              </button>
            </div>
            <p className="mt-1 text-sm text-[#76675f]">
              Ucapan baru masuk sebagai menunggu persetujuan dan tidak tampil di halaman publik
              sebelum disetujui.
            </p>
            <div className="mt-4 divide-y divide-[#f0e8e2]">
              {entries.map((entry) => (
                <article key={entry.id} className="py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{entry.display_name}</p>
                    <span className="text-xs text-[#887970]">
                      {entry.moderation_status} ·{" "}
                      {new Date(entry.created_at).toLocaleString("id-ID")}
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm">{entry.message}</p>
                  {entry.moderation_status === "pending" && (
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => void moderate(entry, "approved")}
                        className="rounded-lg bg-[#754b3b] px-3 py-2 text-xs font-semibold text-white"
                      >
                        Setujui
                      </button>
                      <button
                        onClick={() => void moderate(entry, "rejected")}
                        className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700"
                      >
                        Tolak
                      </button>
                    </div>
                  )}
                </article>
              ))}
              {entries.length === 0 && (
                <p className="py-8 text-center text-sm text-[#887970]">Belum ada ucapan.</p>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
