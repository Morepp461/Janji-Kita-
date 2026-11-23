import { useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

async function hashToken(token: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))))
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export default function GuestPublicForms({ client, guestToken }: { client: SupabaseClient; guestToken: string }) {
  const [response, setResponse] = useState("yes");
  const [attendees, setAttendees] = useState("1");
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const tokenHash = () => hashToken(guestToken);

  async function submitRsvp(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const { error: rpcError } = await client.rpc("submit_guest_rsvp", {
      p_token_hash: await tokenHash(), p_response: response,
      p_attendee_count: response === "yes" ? Number(attendees) : 0, p_answers: {},
    });
    if (rpcError) setError(rpcError.message); else setNotice("Konfirmasi kehadiran berhasil disimpan.");
    setBusy(false);
  }

  async function submitGuestbook(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const { error: rpcError } = await client.rpc("submit_guestbook_entry", {
      p_token_hash: await tokenHash(), p_message: message,
    });
    if (rpcError) setError(rpcError.message); else { setNotice("Ucapan terkirim dan menunggu moderasi penyelenggara."); setMessage(""); }
    setBusy(false);
  }

  return <section className="mt-8 grid gap-5 md:grid-cols-2">
    <form onSubmit={submitRsvp} className="rounded-2xl border border-[#eaded5] bg-white p-5">
      <h2 className="text-xl font-semibold">Konfirmasi kehadiran</h2>
      <label className="mt-4 block text-sm font-medium">Kehadiran<select value={response} onChange={(e) => setResponse(e.target.value)} className="mt-2 w-full rounded-xl border border-[#ddcec3] p-3"><option value="yes">Saya hadir</option><option value="no">Saya tidak hadir</option><option value="maybe">Belum dapat memastikan</option></select></label>
      {response === "yes" && <label className="mt-3 block text-sm font-medium">Jumlah orang<select value={attendees} onChange={(e) => setAttendees(e.target.value)} className="mt-2 w-full rounded-xl border border-[#ddcec3] p-3"><option value="1">1 orang</option><option value="2">2 orang (jika diizinkan)</option></select></label>}
      <button disabled={busy} className="mt-4 rounded-xl bg-[#754b3b] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">Kirim RSVP</button>
    </form>
    <form onSubmit={submitGuestbook} className="rounded-2xl border border-[#eaded5] bg-white p-5">
      <h2 className="text-xl font-semibold">Kirim ucapan</h2>
      <label className="mt-4 block text-sm font-medium">Pesan<textarea required minLength={1} maxLength={500} rows={4} value={message} onChange={(e) => setMessage(e.target.value)} className="mt-2 w-full rounded-xl border border-[#ddcec3] p-3"/></label>
      <button disabled={busy} className="mt-4 rounded-xl bg-[#754b3b] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">Kirim ucapan</button>
    </form>
    {(notice || error) && <p role="status" className={`rounded-xl p-3 text-sm md:col-span-2 ${error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-800"}`}>{error || notice}</p>}
  </section>;
}
