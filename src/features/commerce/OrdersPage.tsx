import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

type OrderRow = {
  id: string;
  order_number: string;
  invitation_id: string;
  status: string;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  grand_total: number;
  currency: string;
  paid_at: string | null;
  created_at: string;
};

const labels: Record<string, string> = {
  draft: "Draft",
  pending: "Menunggu pembayaran",
  paid: "Lunas",
  failed: "Gagal",
  cancelled: "Dibatalkan",
  expired: "Kedaluwarsa",
  refunded: "Dikembalikan",
  partially_refunded: "Pengembalian sebagian",
};

const money = (amount: number, currency = "IDR") =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);

export default function OrdersPage({ client }: { client: SupabaseClient }) {
  const orderId = new URLSearchParams(window.location.search).get("order_id");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    let query = client
      .from("orders")
      .select("id,order_number,invitation_id,status,subtotal,discount_total,tax_total,grand_total,currency,paid_at,created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    if (orderId) query = query.eq("id", orderId);
    const { data, error: queryError } = await query;
    if (queryError) setError(queryError.message);
    setOrders((data || []) as OrderRow[]);
    setLoading(false);
  }, [client, orderId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <main className="min-h-screen bg-[#fffaf6] px-4 py-8 text-[#30251f] sm:px-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#a36d55]">Janji Kita · Commerce</p>
            <h1 className="mt-2 text-2xl font-semibold">Pesanan saya</h1>
            <p className="mt-1 text-sm text-[#76675f]">Status berubah setelah notifikasi pembayaran diverifikasi oleh server.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => void refresh()} type="button" className="rounded-xl border border-[#ddcec3] bg-white px-4 py-2 text-sm font-semibold">Muat ulang</button>
            <a href="/" className="rounded-xl border border-[#ddcec3] bg-white px-4 py-2 text-sm font-semibold">Ruang kerja</a>
          </div>
        </header>

        {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
        {loading ? <p className="py-8 text-center text-sm text-[#76675f]">Memuat pesanan...</p> : orders.length ? (
          <div className="space-y-3">
            {orders.map((order) => (
              <article key={order.id} className="rounded-2xl border border-[#eaded5] bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">{order.order_number}</h2>
                    <p className="mt-1 text-xs text-[#887970]">{new Date(order.created_at).toLocaleString("id-ID")}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${order.status === "paid" ? "bg-green-50 text-green-800" : order.status === "pending" ? "bg-amber-50 text-amber-800" : "bg-[#f5eee8] text-[#765e52]"}`}>
                    {labels[order.status] || order.status}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#f0e7e0] pt-4">
                  <strong>{money(order.grand_total, order.currency)}</strong>
                  <div className="flex flex-wrap gap-3 text-sm font-semibold">
                    {order.status === "pending" && <a href={`/checkout/${order.invitation_id}`} className="text-[#754b3b] underline">Lanjutkan pembayaran</a>}
                    {order.status === "paid" && <a href={`/editor/${order.invitation_id}`} className="text-[#754b3b] underline">Buka editor / terbitkan</a>}
                  </div>
                </div>
                {order.status === "pending" && (
                  <p className="mt-3 text-xs leading-5 text-[#887970]">Jangan menganggap halaman pengalihan sebagai bukti pembayaran. Status Lunas hanya muncul setelah webhook diverifikasi.</p>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[#ddcec3] bg-white p-8 text-center">
            <h2 className="font-semibold">Pesanan belum ditemukan</h2>
            <p className="mt-2 text-sm text-[#76675f]">Setelah checkout dibuat, ringkasan pesanan akan muncul di sini.</p>
          </div>
        )}
      </div>
    </main>
  );
}
