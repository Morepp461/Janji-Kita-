import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

type Invitation = {
  id: string;
  title: string;
  status: string;
  template_id: string | null;
  owner_user_id: string;
  reseller_user_id: string | null;
};

type AddOn = {
  id: string;
  code: string;
  name_i18n: Record<string, string>;
  description_i18n: Record<string, string>;
  price: number;
  currency: string;
  billing_type: "one_time" | "recurring" | "quantity";
};

type Order = {
  order_id: string;
  order_number: string;
  status: string;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  grand_total: number;
  currency: string;
};

const money = (amount: number, currency = "IDR") =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);

export default function CheckoutPage({
  client,
  userId,
  invitationId,
}: {
  client: SupabaseClient;
  userId: string;
  invitationId: string;
}) {
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [addOns, setAddOns] = useState<AddOn[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [coupon, setCoupon] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [attributing, setAttributing] = useState(false);
  const [order, setOrder] = useState<Order | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    const [invitationResult, addOnResult, orderResult] = await Promise.all([
      client
        .from("invitations")
        .select("id,title,status,template_id,owner_user_id,reseller_user_id")
        .eq("id", invitationId)
        .eq("owner_user_id", userId)
        .maybeSingle(),
      client
        .from("add_ons")
        .select("id,code,name_i18n,description_i18n,price,currency,billing_type")
        .eq("is_active", true)
        .in("billing_type", ["one_time", "quantity"])
        .order("price"),
      client
        .from("orders")
        .select("id,order_number,status,subtotal,discount_total,tax_total,grand_total,currency")
        .eq("invitation_id", invitationId)
        .eq("owner_user_id", userId)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (invitationResult.error || !invitationResult.data) {
      setError(
        invitationResult.error?.message || "Undangan tidak ditemukan atau bukan milik akun ini.",
      );
    } else {
      setInvitation(invitationResult.data as Invitation);
    }
    if (addOnResult.error) setError(addOnResult.error.message);
    else setAddOns((addOnResult.data || []) as AddOn[]);
    if (orderResult.data) {
      const pendingOrder = orderResult.data;
      setOrder({
        order_id: pendingOrder.id,
        order_number: pendingOrder.order_number,
        status: pendingOrder.status,
        subtotal: pendingOrder.subtotal,
        discount_total: pendingOrder.discount_total,
        tax_total: pendingOrder.tax_total,
        grand_total: pendingOrder.grand_total,
        currency: pendingOrder.currency,
      });
      setNotice("Pesanan pending sebelumnya ditemukan. Lanjutkan pembayaran atau lihat statusnya.");
    }
    setLoading(false);
  }, [client, invitationId, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function applyReferralCode() {
    if (!invitation || order || !referralCode.trim()) return;
    setAttributing(true);
    setError("");
    setNotice("");
    const { error: attributionError } = await client.rpc("attribute_invitation_to_reseller", {
      p_invitation_id: invitation.id,
      p_referral_code: referralCode.trim(),
    });
    if (attributionError) setError(attributionError.message);
    else {
      setReferralCode("");
      setNotice("Atribusi reseller berhasil diterapkan pada undangan ini.");
      await refresh();
    }
    setAttributing(false);
  }

  async function createOrder() {
    if (!invitation || order) return;
    setCreating(true);
    setError("");
    setNotice("");
    const selected = Object.entries(quantities)
      .filter(([, quantity]) => quantity > 0)
      .map(([id, quantity]) => ({ id, quantity }));
    const { data, error: createError } = await client.rpc("create_order", {
      p_invitation_id: invitation.id,
      p_add_ons: selected,
      p_coupon_code: coupon.trim() || null,
      p_idempotency_key: idempotencyKey,
    });
    if (createError || !data) {
      setError(createError?.message || "Pesanan belum dapat dibuat.");
      setCreating(false);
      return;
    }
    setOrder(data as Order);
    setNotice("Ringkasan harga sudah dihitung oleh server. Pesanan menunggu pembayaran.");
    setCreating(false);
  }

  async function pay() {
    if (!order) return;
    setPaying(true);
    setError("");
    const { data, error: paymentError } = await client.functions.invoke("create-midtrans-payment", {
      body: { order_id: order.order_id, return_url: window.location.origin },
    });
    if (paymentError || !data?.redirect_url) {
      setError(data?.error || paymentError?.message || "Sesi pembayaran sandbox belum tersedia.");
      setPaying(false);
      return;
    }
    window.location.assign(data.redirect_url as string);
  }

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center text-sm text-[#76675f]">
        Memuat checkout...
      </main>
    );
  }

  if (!invitation) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
          {error}
        </p>
        <a href="/" className="mt-4 inline-block text-sm underline">
          Kembali ke ruang kerja
        </a>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#fffaf6] px-4 py-8 text-[#30251f] sm:px-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#a36d55]">
              Janji Kita · Checkout
            </p>
            <h1 className="mt-2 text-2xl font-semibold">Publikasi undangan</h1>
            <p className="mt-1 text-sm text-[#76675f]">{invitation.title}</p>
          </div>
          <a
            href={`/editor/${invitation.id}`}
            className="text-sm font-semibold text-[#754b3b] underline"
          >
            Kembali ke editor
          </a>
        </header>

        {(notice || error) && (
          <p
            role={error ? "alert" : "status"}
            className={`rounded-xl px-4 py-3 text-sm ${error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-800"}`}
          >
            {error || notice}
          </p>
        )}

        <section className="rounded-2xl border border-[#eaded5] bg-white p-5 sm:p-7">
          <h2 className="font-semibold">Add-on opsional</h2>
          <p className="mt-1 text-sm text-[#76675f]">
            Harga dan ketersediaan ditentukan admin. Add-on hanya aktif setelah pembayaran
            diverifikasi.
          </p>
          {addOns.length ? (
            <div className="mt-4 divide-y divide-[#f0e7e0]">
              {addOns.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{item.name_i18n?.["id-ID"] || item.code}</p>
                    <p className="text-xs text-[#887970]">
                      {item.description_i18n?.["id-ID"] || "Add-on undangan"}
                    </p>
                    <p className="mt-1 text-sm font-semibold">{money(item.price, item.currency)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="sr-only" htmlFor={`qty-${item.id}`}>
                      Jumlah {item.name_i18n?.["id-ID"] || item.code}
                    </label>
                    <select
                      id={`qty-${item.id}`}
                      value={quantities[item.id] || 0}
                      disabled={Boolean(order)}
                      onChange={(event) =>
                        setQuantities((current) => ({
                          ...current,
                          [item.id]: Number(event.target.value),
                        }))
                      }
                      className="rounded-lg border border-[#ddcec3] bg-white px-3 py-2 text-sm"
                    >
                      {[0, 1, 2, 3, 4, 5].map((value) => (
                        <option key={value} value={value}>
                          {value === 0 ? "Tidak dipilih" : value}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-[#887970]">Belum ada add-on aktif.</p>
          )}

          <div className="mt-5 rounded-xl border border-[#f0e7e0] p-4">
            <p className="text-sm font-semibold">Atribusi reseller (opsional)</p>
            {invitation.reseller_user_id ? (
              <p className="mt-1 text-sm text-[#76675f]">Undangan ini sudah terhubung dengan reseller. Atribusi ikut tersimpan pada pesanan.</p>
            ) : (
              <>
                <label className="mt-2 block text-sm font-medium">
                  Kode referral reseller
                  <input value={referralCode} disabled={Boolean(order) || attributing} onChange={(event) => setReferralCode(event.target.value.toUpperCase())} maxLength={20} autoComplete="off" className="mt-2 w-full rounded-xl border border-[#ddcec3] px-4 py-3" placeholder="KODE RESELLER" />
                </label>
                <button type="button" disabled={attributing || Boolean(order) || !referralCode.trim()} onClick={() => void applyReferralCode()} className="mt-2 rounded-lg border border-[#ddcec3] px-4 py-2 text-sm font-semibold disabled:opacity-50">{attributing ? "Memeriksa..." : "Terapkan kode reseller"}</button>
              </>
            )}
          </div>
          <label className="mt-5 block text-sm font-medium">
            Kode kupon (opsional)
            <input
              value={coupon}
              disabled={Boolean(order)}
              onChange={(event) => setCoupon(event.target.value.toUpperCase())}
              maxLength={40}
              autoComplete="off"
              className="mt-2 w-full rounded-xl border border-[#ddcec3] px-4 py-3"
              placeholder="MASUKKAN KODE KUPON"
            />
          </label>
          <p className="mt-3 text-xs leading-5 text-[#887970]">
            Total final dihitung dan disimpan di server. Draft tetap gratis untuk dibuat dan diedit,
            tetapi undangan publik memerlukan pembayaran yang sudah diverifikasi.
          </p>
          <button
            type="button"
            disabled={creating || Boolean(order)}
            onClick={() => void createOrder()}
            className="mt-5 w-full rounded-xl bg-[#754b3b] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {creating
              ? "Membuat pesanan..."
              : order
                ? "Pesanan sudah dibuat"
                : "Hitung total dan buat pesanan"}
          </button>
        </section>

        {order && (
          <section className="rounded-2xl border border-[#eaded5] bg-white p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-[#a36d55]">
                  Ringkasan server
                </p>
                <h2 className="mt-1 text-lg font-semibold">{order.order_number}</h2>
              </div>
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                Menunggu pembayaran
              </span>
            </div>
            <dl className="mt-5 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-[#76675f]">Subtotal</dt>
                <dd>{money(order.subtotal, order.currency)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[#76675f]">Diskon</dt>
                <dd>−{money(order.discount_total, order.currency)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[#76675f]">Pajak/biaya</dt>
                <dd>{money(order.tax_total, order.currency)}</dd>
              </div>
              <div className="mt-3 flex justify-between border-t border-[#eaded5] pt-3 text-base font-bold">
                <dt>Total</dt>
                <dd>{money(order.grand_total, order.currency)}</dd>
              </div>
            </dl>
            <button
              type="button"
              disabled={paying}
              onClick={() => void pay()}
              className="mt-5 w-full rounded-xl bg-[#754b3b] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {paying ? "Menyiapkan pembayaran..." : "Lanjutkan ke Midtrans Sandbox"}
            </button>
            <a
              href={`/orders?order_id=${order.order_id}`}
              className="mt-4 block text-center text-sm font-semibold text-[#754b3b] underline"
            >
              Lihat status pesanan
            </a>
          </section>
        )}
      </div>
    </main>
  );
}
