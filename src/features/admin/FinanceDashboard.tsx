import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

type OrderRow = {
  id: string;
  order_number: string;
  status: string;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  refund_total: number;
  grand_total: number;
  currency: string;
  paid_at: string | null;
  created_at: string;
  payer_user_id: string;
  owner_user_id: string;
};

type AttemptRow = {
  id: string;
  order_id: string;
  provider_order_id: string;
  status: string;
  payment_method: string | null;
  verified_at: string | null;
};

type EventRow = {
  id: string;
  payment_attempt_id: string;
  event_type: string;
  payload_redacted: Record<string, unknown>;
  signature_valid: boolean;
  processed_at: string | null;
  created_at: string;
};

const labels: Record<string, string> = {
  draft: "Draft",
  pending: "Menunggu",
  paid: "Lunas",
  failed: "Gagal",
  cancelled: "Dibatalkan",
  expired: "Kedaluwarsa",
  refunded: "Dikembalikan",
  partially_refunded: "Refund sebagian",
};

const money = (amount: number) => new Intl.NumberFormat("id-ID", {
  style: "currency", currency: "IDR", maximumFractionDigits: 0,
}).format(amount);

export default function FinanceDashboard({ client }: { client: SupabaseClient }) {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reconciling, setReconciling] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    const [orderResult, attemptResult, eventResult] = await Promise.all([
      client.from("orders").select("id,order_number,status,subtotal,discount_total,tax_total,refund_total,grand_total,currency,paid_at,created_at,payer_user_id,owner_user_id").order("created_at", { ascending: false }).limit(100),
      client.from("payment_attempts").select("id,order_id,provider_order_id,status,payment_method,verified_at").order("created_at", { ascending: false }).limit(200),
      client.from("payment_events").select("id,payment_attempt_id,event_type,payload_redacted,signature_valid,processed_at,created_at").order("created_at", { ascending: false }).limit(100),
    ]);
    const firstError = orderResult.error || attemptResult.error || eventResult.error;
    if (firstError) setError(firstError.message);
    setOrders((orderResult.data || []) as OrderRow[]);
    setAttempts((attemptResult.data || []) as AttemptRow[]);
    setEvents((eventResult.data || []) as EventRow[]);
    setLoading(false);
  }, [client]);

  useEffect(() => { void refresh(); }, [refresh]);

  const totals = useMemo(() => {
    const settled = orders.filter((item) => ["paid", "partially_refunded", "refunded"].includes(item.status));
    return {
      gross: settled.reduce((sum, item) => sum + Number(item.grand_total), 0),
      refunded: orders.reduce((sum, item) => sum + Number(item.refund_total || 0), 0),
      pending: orders.filter((item) => item.status === "pending").reduce((sum, item) => sum + Number(item.grand_total), 0),
      discounts: settled.reduce((sum, item) => sum + Number(item.discount_total), 0),
    };
  }, [orders]);

  const attemptByOrder = useMemo(
    () => new Map(attempts.map((item) => [item.order_id, item])),
    [attempts],
  );

  async function reconcile() {
    setReconciling(true);
    setError("");
    setNotice("");
    const { data, error: invokeError } = await client.functions.invoke("reconcile-midtrans-pending", {
      body: {},
    });
    if (invokeError || data?.error) {
      setError(data?.error || invokeError?.message || "Rekonsiliasi belum berhasil.");
    } else {
      setNotice(`Rekonsiliasi selesai: ${data.checked} diperiksa, ${data.processed} diproses, ${data.skipped} dilewati.`);
      await refresh();
    }
    setReconciling(false);
  }

  return (
    <main className="min-h-screen bg-[#fffaf6] px-4 py-8 text-[#30251f] sm:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#a36d55]">Janji Kita · Finance</p>
            <h1 className="mt-2 text-2xl font-semibold">Audit pembayaran</h1>
            <p className="mt-1 text-sm text-[#76675f]">Nilai pesanan, dana terverifikasi, refund, dan riwayat webhook teredaksi.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void refresh()} className="rounded-xl border border-[#ddcec3] bg-white px-4 py-2 text-sm font-semibold">Muat ulang</button>
            <button type="button" disabled={reconciling} onClick={() => void reconcile()} className="rounded-xl bg-[#754b3b] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {reconciling ? "Memeriksa..." : "Rekonsiliasi pending"}
            </button>
            <a href="/" className="rounded-xl border border-[#ddcec3] bg-white px-4 py-2 text-sm font-semibold">Ruang kerja</a>
          </div>
        </header>

        {notice && <p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Nilai order terverifikasi", money(totals.gross)],
            ["Refund tercatat", money(totals.refunded)],
            ["Net setelah refund", money(totals.gross - totals.refunded)],
            ["Nilai pending", money(totals.pending)],
          ].map(([label, value]) => (
            <section key={label} className="rounded-2xl border border-[#eaded5] bg-white p-4">
              <p className="text-xs text-[#887970]">{label}</p>
              <p className="mt-2 text-xl font-semibold">{value}</p>
            </section>
          ))}
        </div>

        <section className="rounded-2xl border border-[#eaded5] bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Pesanan</h2>
            <p className="text-xs text-[#887970]">Diskon tercatat: {money(totals.discounts)}</p>
          </div>
          {loading ? <p className="py-8 text-center text-sm text-[#76675f]">Memuat laporan...</p> : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="border-b border-[#eaded5] text-xs text-[#887970]">
                  <tr><th className="py-3 pr-3">Nomor</th><th className="py-3 pr-3">Status</th><th className="py-3 pr-3">Gross</th><th className="py-3 pr-3">Diskon</th><th className="py-3 pr-3">Refund</th><th className="py-3 pr-3">Pembayaran</th><th className="py-3">Tanggal</th></tr>
                </thead>
                <tbody className="divide-y divide-[#f0e7e0]">
                  {orders.map((order) => {
                    const attempt = attemptByOrder.get(order.id);
                    return (
                      <tr key={order.id}>
                        <td className="py-3 pr-3 font-medium">{order.order_number}</td>
                        <td className="py-3 pr-3">{labels[order.status] || order.status}</td>
                        <td className="py-3 pr-3">{money(order.grand_total)}</td>
                        <td className="py-3 pr-3">{money(order.discount_total)}</td>
                        <td className="py-3 pr-3">{money(order.refund_total || 0)}</td>
                        <td className="py-3 pr-3">{attempt ? `${attempt.status} · ${attempt.payment_method || "belum dipilih"}` : "Belum ada attempt"}</td>
                        <td className="py-3 text-xs text-[#887970]">{new Date(order.created_at).toLocaleString("id-ID")}</td>
                      </tr>
                    );
                  })}
                  {!orders.length && <tr><td colSpan={7} className="py-8 text-center text-[#887970]">Belum ada pesanan.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-[#eaded5] bg-white p-5">
          <h2 className="font-semibold">Event pembayaran teredaksi</h2>
          <p className="mt-1 text-xs text-[#887970]">Tidak menampilkan signature, kredensial, atau data kartu.</p>
          <div className="mt-4 divide-y divide-[#f0e7e0]">
            {events.map((event) => {
              const attempt = attempts.find((item) => item.id === event.payment_attempt_id);
              return (
                <div key={event.id} className="py-3">
                  <div className="flex flex-wrap justify-between gap-2 text-sm">
                    <strong>{event.event_type}</strong>
                    <span className={event.signature_valid ? "text-green-700" : "text-red-700"}>{event.signature_valid ? "Terverifikasi" : "Tidak valid"}</span>
                  </div>
                  <p className="mt-1 text-xs text-[#887970]">{attempt?.provider_order_id || event.payment_attempt_id} · {new Date(event.created_at).toLocaleString("id-ID")}</p>
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-[#faf6f2] p-3 text-[11px] leading-5 text-[#67574d]">{JSON.stringify(event.payload_redacted, null, 2)}</pre>
                </div>
              );
            })}
            {!events.length && <p className="py-6 text-sm text-[#887970]">Belum ada event pembayaran.</p>}
          </div>
        </section>
        <p className="text-xs leading-5 text-[#887970]">
          Nilai order terverifikasi adalah nilai transaksi yang telah dikonfirmasi gateway, bukan bukti dana telah dicairkan ke rekening. Refund hanya ditampilkan berdasarkan event gateway yang telah diverifikasi.
        </p>
      </div>
    </main>
  );
}
