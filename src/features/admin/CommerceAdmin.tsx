import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

type Template = { id: string; title: string; base_price: number; currency: string };
type AddOn = { id: string; code: string; name_i18n: Record<string, string>; price: number; billing_type: string; is_active: boolean };
type Coupon = { id: string; code: string; discount_type: string; discount_value: number; starts_at: string; ends_at: string; is_active: boolean };

const money = (amount: number) => new Intl.NumberFormat("id-ID", {
  style: "currency", currency: "IDR", maximumFractionDigits: 0,
}).format(amount);

export default function CommerceAdmin({ client }: { client: SupabaseClient }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [addOns, setAddOns] = useState<AddOn[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [blankPrice, setBlankPrice] = useState("0");
  const [templatePrices, setTemplatePrices] = useState<Record<string, string>>({});
  const [addonCode, setAddonCode] = useState("");
  const [addonName, setAddonName] = useState("");
  const [addonDescription, setAddonDescription] = useState("");
  const [addonPrice, setAddonPrice] = useState("0");
  const [addonBilling, setAddonBilling] = useState<"one_time" | "quantity">("one_time");
  const [couponCode, setCouponCode] = useState("");
  const [couponType, setCouponType] = useState<"percent" | "fixed">("percent");
  const [couponValue, setCouponValue] = useState("10");
  const [couponStart, setCouponStart] = useState(() => new Date().toISOString().slice(0, 16));
  const [couponEnd, setCouponEnd] = useState(() => new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 16));
  const [couponLimit, setCouponLimit] = useState("");
  const [perUserLimit, setPerUserLimit] = useState("1");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    const [templateResult, addonResult, couponResult, settingsResult] = await Promise.all([
      client.from("templates").select("id,title,base_price,currency").order("title"),
      client.from("add_ons").select("id,code,name_i18n,price,billing_type,is_active").order("created_at", { ascending: false }),
      client.from("coupons").select("id,code,discount_type,discount_value,starts_at,ends_at,is_active").order("created_at", { ascending: false }),
      client.from("commerce_settings").select("value").eq("key", "blank_canvas_price").maybeSingle(),
    ]);
    const firstError = templateResult.error || addonResult.error || couponResult.error || settingsResult.error;
    if (firstError) setError(firstError.message);
    const nextTemplates = (templateResult.data || []) as Template[];
    setTemplates(nextTemplates);
    setTemplatePrices(Object.fromEntries(nextTemplates.map((item) => [item.id, String(item.base_price)])));
    setAddOns((addonResult.data || []) as AddOn[]);
    setCoupons((couponResult.data || []) as Coupon[]);
    const value = settingsResult.data?.value as { amount?: number } | undefined;
    setBlankPrice(String(value?.amount ?? 0));
    setLoading(false);
  }, [client]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function saveBlankPrice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const { error: saveError } = await client.rpc("admin_set_blank_canvas_price", {
      p_price: Number(blankPrice),
    });
    if (saveError) setError(saveError.message);
    else setNotice("Harga kanvas kosong berhasil diperbarui.");
    setSaving(false);
    await refresh();
  }

  async function saveTemplatePrice(templateId: string) {
    setSaving(true);
    setError("");
    const { error: saveError } = await client.rpc("admin_set_template_price", {
      p_template_id: templateId,
      p_price: Number(templatePrices[templateId]),
    });
    if (saveError) setError(saveError.message);
    else setNotice("Harga template berhasil diperbarui.");
    setSaving(false);
    await refresh();
  }

  async function createAddon(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const { error: saveError } = await client.rpc("admin_upsert_add_on", {
      p_id: null,
      p_code: addonCode.trim().toLowerCase(),
      p_name_i18n: { "id-ID": addonName.trim() },
      p_description_i18n: { "id-ID": addonDescription.trim() },
      p_price: Number(addonPrice),
      p_currency: "IDR",
      p_billing_type: addonBilling,
      p_is_active: true,
      p_config: {},
    });
    if (saveError) setError(saveError.message);
    else {
      setNotice("Add-on berhasil ditambahkan.");
      setAddonCode("");
      setAddonName("");
      setAddonDescription("");
      setAddonPrice("0");
    }
    setSaving(false);
    await refresh();
  }

  async function createCoupon(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const start = new Date(couponStart);
    const end = new Date(couponEnd);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
      setError("Rentang waktu kupon tidak valid.");
      setSaving(false);
      return;
    }
    const { error: saveError } = await client.rpc("admin_upsert_coupon", {
      p_id: null,
      p_code: couponCode.trim().toUpperCase(),
      p_discount_type: couponType,
      p_discount_value: Number(couponValue),
      p_starts_at: start.toISOString(),
      p_ends_at: end.toISOString(),
      p_max_redemptions: couponLimit.trim() ? Number(couponLimit) : null,
      p_per_user_limit: perUserLimit.trim() ? Number(perUserLimit) : null,
      p_is_active: true,
      p_rules: {},
    });
    if (saveError) setError(saveError.message);
    else {
      setNotice("Kupon berhasil dibuat.");
      setCouponCode("");
    }
    setSaving(false);
    await refresh();
  }

  return (
    <main className="min-h-screen bg-[#fffaf6] px-4 py-8 text-[#30251f] sm:px-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#a36d55]">Janji Kita · Admin</p>
            <h1 className="mt-2 text-2xl font-semibold">Harga, add-on, dan kupon</h1>
            <p className="mt-1 text-sm text-[#76675f]">Semua perubahan harga berlaku untuk pesanan baru. Snapshot pesanan lama tidak berubah.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void refresh()} className="rounded-xl border border-[#ddcec3] bg-white px-4 py-2 text-sm font-semibold">Muat ulang</button>
            <a href="/" className="rounded-xl border border-[#ddcec3] bg-white px-4 py-2 text-sm font-semibold">Ruang kerja</a>
          </div>
        </header>

        <div className="rounded-xl border border-[#eaded5] bg-white px-4 py-3 text-sm text-[#76675f]">
          <strong className="text-[#754b3b]">Mode sandbox.</strong> Pembayaran production dinonaktifkan. Harga awal kanvas kosong bernilai Rp0 dan checkout akan ditolak sampai admin menetapkan harga positif.
        </div>
        {notice && <p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {loading ? <p className="py-8 text-center text-sm text-[#76675f]">Memuat konfigurasi commerce...</p> : (
          <>
            <section className="rounded-2xl border border-[#eaded5] bg-white p-5 sm:p-6">
              <h2 className="text-lg font-semibold">Harga kanvas kosong</h2>
              <form onSubmit={(event) => void saveBlankPrice(event)} className="mt-4 flex flex-wrap items-end gap-3">
                <label className="min-w-[220px] flex-1 text-sm font-medium">
                  Harga dasar (IDR)
                  <input type="number" min="0" step="1" required value={blankPrice} onChange={(event) => setBlankPrice(event.target.value)} className="mt-2 w-full rounded-xl border border-[#ddcec3] px-4 py-3" />
                </label>
                <button disabled={saving} className="rounded-xl bg-[#754b3b] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">Simpan harga</button>
              </form>
            </section>

            <section className="rounded-2xl border border-[#eaded5] bg-white p-5 sm:p-6">
              <h2 className="text-lg font-semibold">Harga template</h2>
              <div className="mt-4 divide-y divide-[#f0e7e0]">
                {templates.map((item) => (
                  <div key={item.id} className="flex flex-wrap items-center gap-3 py-3">
                    <p className="min-w-[180px] flex-1 text-sm font-medium">{item.title}</p>
                    <label className="text-xs text-[#887970]">
                      Harga IDR
                      <input type="number" min="0" step="1" value={templatePrices[item.id] ?? item.base_price} onChange={(event) => setTemplatePrices((current) => ({ ...current, [item.id]: event.target.value }))} className="mt-1 w-36 rounded-lg border border-[#ddcec3] px-3 py-2 text-sm text-[#30251f]" />
                    </label>
                    <button disabled={saving} onClick={() => void saveTemplatePrice(item.id)} type="button" className="rounded-lg border border-[#ddcec3] px-3 py-2 text-xs font-semibold disabled:opacity-60">Simpan</button>
                    <span className="text-xs text-[#887970]">{money(item.base_price)}</span>
                  </div>
                ))}
                {!templates.length && <p className="py-3 text-sm text-[#887970]">Belum ada template.</p>}
              </div>
            </section>

            <section className="rounded-2xl border border-[#eaded5] bg-white p-5 sm:p-6">
              <h2 className="text-lg font-semibold">Add-on</h2>
              <form onSubmit={(event) => void createAddon(event)} className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium">Kode unik
                  <input required maxLength={64} pattern="[a-z0-9][a-z0-9_-]{1,63}" value={addonCode} onChange={(event) => setAddonCode(event.target.value.toLowerCase())} className="mt-2 w-full rounded-xl border border-[#ddcec3] px-4 py-3" placeholder="contoh: qr-ticket" />
                </label>
                <label className="text-sm font-medium">Nama
                  <input required maxLength={100} value={addonName} onChange={(event) => setAddonName(event.target.value)} className="mt-2 w-full rounded-xl border border-[#ddcec3] px-4 py-3" />
                </label>
                <label className="text-sm font-medium">Deskripsi
                  <input value={addonDescription} onChange={(event) => setAddonDescription(event.target.value)} className="mt-2 w-full rounded-xl border border-[#ddcec3] px-4 py-3" />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm font-medium">Harga IDR
                    <input type="number" min="0" step="1" required value={addonPrice} onChange={(event) => setAddonPrice(event.target.value)} className="mt-2 w-full rounded-xl border border-[#ddcec3] px-4 py-3" />
                  </label>
                  <label className="text-sm font-medium">Penagihan
                    <select value={addonBilling} onChange={(event) => setAddonBilling(event.target.value as "one_time" | "quantity")} className="mt-2 w-full rounded-xl border border-[#ddcec3] px-3 py-3">
                      <option value="one_time">Sekali bayar</option>
                      <option value="quantity">Berdasarkan jumlah</option>
                    </select>
                  </label>
                </div>
                <div className="sm:col-span-2">
                  <button disabled={saving} className="rounded-xl bg-[#754b3b] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">Tambah add-on</button>
                </div>
              </form>
              <div className="mt-5 divide-y divide-[#f0e7e0]">
                {addOns.map((item) => (
                  <div key={item.id} className="flex flex-wrap justify-between gap-3 py-3 text-sm">
                    <div><p className="font-medium">{item.name_i18n?.["id-ID"] || item.code}</p><p className="text-xs text-[#887970]">{item.code} · {item.billing_type} · {item.is_active ? "Aktif" : "Nonaktif"}</p></div>
                    <strong>{money(item.price)}</strong>
                  </div>
                ))}
                {!addOns.length && <p className="py-3 text-sm text-[#887970]">Belum ada add-on.</p>}
              </div>
            </section>

            <section className="rounded-2xl border border-[#eaded5] bg-white p-5 sm:p-6">
              <h2 className="text-lg font-semibold">Kupon</h2>
              <form onSubmit={(event) => void createCoupon(event)} className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium">Kode kupon
                  <input required minLength={3} maxLength={40} pattern="[A-Za-z0-9_-]{3,40}" value={couponCode} onChange={(event) => setCouponCode(event.target.value.toUpperCase())} className="mt-2 w-full rounded-xl border border-[#ddcec3] px-4 py-3" />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm font-medium">Jenis diskon
                    <select value={couponType} onChange={(event) => setCouponType(event.target.value as "percent" | "fixed")} className="mt-2 w-full rounded-xl border border-[#ddcec3] px-3 py-3">
                      <option value="percent">Persentase</option>
                      <option value="fixed">Nominal IDR</option>
                    </select>
                  </label>
                  <label className="text-sm font-medium">{couponType === "percent" ? "Diskon (%)" : "Diskon (IDR)"}
                    <input type="number" min="0" max={couponType === "percent" ? 100 : undefined} step="1" required value={couponValue} onChange={(event) => setCouponValue(event.target.value)} className="mt-2 w-full rounded-xl border border-[#ddcec3] px-4 py-3" />
                  </label>
                </div>
                <label className="text-sm font-medium">Mulai
                  <input type="datetime-local" required value={couponStart} onChange={(event) => setCouponStart(event.target.value)} className="mt-2 w-full rounded-xl border border-[#ddcec3] px-4 py-3" />
                </label>
                <label className="text-sm font-medium">Berakhir
                  <input type="datetime-local" required value={couponEnd} onChange={(event) => setCouponEnd(event.target.value)} className="mt-2 w-full rounded-xl border border-[#ddcec3] px-4 py-3" />
                </label>
                <label className="text-sm font-medium">Batas global (opsional)
                  <input type="number" min="1" step="1" value={couponLimit} onChange={(event) => setCouponLimit(event.target.value)} className="mt-2 w-full rounded-xl border border-[#ddcec3] px-4 py-3" />
                </label>
                <label className="text-sm font-medium">Batas per akun
                  <input type="number" min="1" step="1" value={perUserLimit} onChange={(event) => setPerUserLimit(event.target.value)} className="mt-2 w-full rounded-xl border border-[#ddcec3] px-4 py-3" />
                </label>
                <div className="sm:col-span-2">
                  <button disabled={saving} className="rounded-xl bg-[#754b3b] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">Buat kupon</button>
                </div>
              </form>
              <div className="mt-5 divide-y divide-[#f0e7e0]">
                {coupons.map((item) => (
                  <div key={item.id} className="flex flex-wrap justify-between gap-3 py-3 text-sm">
                    <div><p className="font-semibold">{item.code}</p><p className="text-xs text-[#887970]">{item.starts_at.slice(0, 10)} sampai {item.ends_at.slice(0, 10)} · {item.is_active ? "Aktif" : "Nonaktif"}</p></div>
                    <strong>{item.discount_type === "percent" ? `${item.discount_value}%` : money(item.discount_value)}</strong>
                  </div>
                ))}
                {!coupons.length && <p className="py-3 text-sm text-[#887970]">Belum ada kupon.</p>}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
