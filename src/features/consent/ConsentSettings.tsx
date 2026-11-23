import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

type Consent = {
  id: string;
  invitation_id: string;
  order_id: string | null;
  consent_type: string;
  granted: boolean;
  consent_text_version: string;
  granted_at: string | null;
  withdrawn_at: string | null;
};

export default function ConsentSettings({ client }: { client: SupabaseClient }) {
  const [items, setItems] = useState<Consent[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: queryError } = await client
      .from("consent_records")
      .select("id,invitation_id,order_id,consent_type,granted,consent_text_version,granted_at,withdrawn_at")
      .eq("consent_type", "marketplace_template")
      .order("created_at", { ascending: false });
    if (queryError) setError(queryError.message);
    setItems((data || []) as Consent[]);
    setLoading(false);
  }, [client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function withdraw(item: Consent) {
    if (!window.confirm("Cabut persetujuan penggunaan desain ini? Desain tidak dapat digunakan untuk materi marketplace baru.")) return;
    setSavingId(item.id);
    setError("");
    setNotice("");
    const { error: rpcError } = await client.rpc("withdraw_marketplace_consent", {
      p_consent_id: item.id,
    });
    if (rpcError) setError(rpcError.message);
    else {
      setNotice("Persetujuan berhasil dicabut. Penggunaan baru atas desain ini tidak diizinkan.");
      await refresh();
    }
    setSavingId("");
  }

  return (
    <main className="min-h-screen bg-[#fffaf6] px-4 py-8 text-[#30251f] sm:px-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#a36d55]">Janji Kita · Pengaturan</p>
            <h1 className="mt-2 text-2xl font-semibold">Persetujuan marketplace</h1>
            <p className="mt-1 text-sm text-[#76675f]">Persetujuan ini opsional dan terpisah dari persetujuan pembelian. Anda dapat mencabutnya kapan saja.</p>
          </div>
          <a href="/" className="rounded-xl border border-[#ddcec3] bg-white px-4 py-2 text-sm font-semibold">Ruang kerja</a>
        </header>
        {notice && <p role="status" className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</p>}
        {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        <section className="rounded-2xl border border-[#eaded5] bg-white p-5 sm:p-7">
          <h2 className="font-semibold">Riwayat persetujuan desain</h2>
          <p className="mt-1 text-sm text-[#76675f]">Persetujuan hanya mengizinkan peninjauan penggunaan desain undangan sebagai template marketplace. Persetujuan tidak mencakup aset pihak ketiga yang hak penggunaannya belum jelas.</p>
          {loading ? (
            <p className="py-8 text-sm text-[#887970]">Memuat riwayat...</p>
          ) : (
            <div className="mt-4 divide-y divide-[#f0e7e0]">
              {items.map((item) => {
                const active = item.granted && !item.withdrawn_at;
                return (
                  <article key={item.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold">{active ? "Persetujuan aktif" : "Persetujuan dicabut"}</p>
                      <p className="mt-1 break-all text-xs text-[#887970]">Undangan: {item.invitation_id}</p>
                      <p className="break-all text-xs text-[#887970]">Pesanan: {item.order_id || "—"} · versi persetujuan: {item.consent_text_version}</p>
                      <p className="mt-1 text-xs text-[#887970]">Diberikan: {item.granted_at ? new Date(item.granted_at).toLocaleString("id-ID") : "—"} · Dicabut: {item.withdrawn_at ? new Date(item.withdrawn_at).toLocaleString("id-ID") : "—"}</p>
                    </div>
                    {active && (
                      <button
                        type="button"
                        disabled={Boolean(savingId)}
                        onClick={() => void withdraw(item)}
                        className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"
                      >
                        {savingId === item.id ? "Memproses..." : "Cabut persetujuan"}
                      </button>
                    )}
                  </article>
                );
              })}
              {!items.length && <p className="py-8 text-sm text-[#887970]">Belum ada persetujuan yang diberikan.</p>}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
