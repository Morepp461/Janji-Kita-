import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

type ResellerProfile = {
  id: string;
  user_id: string;
  status: string;
  business_name: string;
  contact_email: string;
  pricing_tier: string;
  referral_code: string;
};
type PriceRule = {
  id: string;
  reseller_tier: string;
  template_id: string | null;
  add_on_id: string | null;
  wholesale_price: number;
  currency: string;
  valid_from: string;
  valid_until: string | null;
};
type CatalogOption = {
  id: string;
  title?: string;
  code?: string;
  name_i18n?: Record<string, string>;
};
type ClientRow = { id: string; name: string; email: string; phone: string | null; status: string };
type OrderRow = {
  id: string;
  order_number: string;
  status: string;
  grand_total: number;
  currency: string;
};
type SaleRow = {
  id: string;
  order_id: string;
  wholesale_amount: number;
  resale_amount: number | null;
  currency: string;
  created_at: string;
};
type Application = ResellerProfile & { created_at: string };

const money = (value: number, currency = "IDR") =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency, maximumFractionDigits: 0 }).format(
    value,
  );

export default function ResellerWorkspace({
  client,
  userId,
  isAdmin,
}: {
  client: SupabaseClient;
  userId: string;
  isAdmin: boolean;
}) {
  const [profile, setProfile] = useState<ResellerProfile | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [priceRules, setPriceRules] = useState<PriceRule[]>([]);
  const [templates, setTemplates] = useState<CatalogOption[]>([]);
  const [addOns, setAddOns] = useState<CatalogOption[]>([]);
  const [ruleType, setRuleType] = useState<"template" | "add_on">("template");
  const [ruleReference, setRuleReference] = useState("");
  const [ruleTier, setRuleTier] = useState("standard");
  const [rulePrice, setRulePrice] = useState("0");
  const [businessName, setBusinessName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [selectedOrder, setSelectedOrder] = useState("");
  const [selectedClient, setSelectedClient] = useState("");
  const [wholesale, setWholesale] = useState("0");
  const [resale, setResale] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    const [profileResult, applicationsResult] = await Promise.all([
      client.from("reseller_profiles").select("*").eq("user_id", userId).maybeSingle(),
      isAdmin
        ? client.from("reseller_profiles").select("*").eq("status", "applied").order("created_at")
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (profileResult.error || applicationsResult.error)
      setError(profileResult.error?.message || applicationsResult.error?.message || "");
    const nextProfile = profileResult.data as ResellerProfile | null;
    setProfile(nextProfile);
    setApplications((applicationsResult.data || []) as Application[]);
    if (isAdmin || nextProfile?.status === "approved") {
      const [ruleResult, templateResult, addOnResult] = await Promise.all([
        client.from("reseller_price_rules").select("*").order("valid_from", { ascending: false }),
        client.from("templates").select("id,title").eq("status", "published").order("title"),
        client.from("add_ons").select("id,code,name_i18n").eq("is_active", true).order("code"),
      ]);
      const catalogError = ruleResult.error || templateResult.error || addOnResult.error;
      if (catalogError) setError(catalogError.message);
      setPriceRules((ruleResult.data || []) as PriceRule[]);
      setTemplates((templateResult.data || []) as CatalogOption[]);
      setAddOns((addOnResult.data || []) as CatalogOption[]);
    }
    if (nextProfile?.status === "approved") {
      const [clientResult, orderResult, saleResult] = await Promise.all([
        client
          .from("reseller_clients")
          .select("*")
          .eq("reseller_user_id", userId)
          .order("created_at", { ascending: false }),
        client
          .from("orders")
          .select("id,order_number,status,grand_total,currency")
          .eq("reseller_user_id", userId)
          .order("created_at", { ascending: false })
          .limit(50),
        client
          .from("reseller_sales")
          .select("*")
          .eq("reseller_user_id", userId)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);
      const firstError = clientResult.error || orderResult.error || saleResult.error;
      if (firstError) setError(firstError.message);
      setClients((clientResult.data || []) as ClientRow[]);
      setOrders((orderResult.data || []) as OrderRow[]);
      setSales((saleResult.data || []) as SaleRow[]);
    }
    setLoading(false);
  }, [client, userId, isAdmin]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    const { error: rpcError } = await client.rpc("apply_reseller", {
      p_business_name: businessName.trim(),
      p_contact_email: contactEmail.trim(),
      p_terms_version: "2026-11-23-v1",
    });
    if (rpcError) setError(rpcError.message);
    else {
      setNotice("Pendaftaran reseller berhasil dikirim untuk ditinjau.");
      await refresh();
    }
    setSaving(false);
  }

  async function addClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    const { error: insertError } = await client.from("reseller_clients").insert({
      reseller_user_id: userId,
      name: clientName.trim(),
      email: clientEmail.trim().toLowerCase(),
      phone: clientPhone.trim() || null,
    });
    if (insertError) setError(insertError.message);
    else {
      setClientName("");
      setClientEmail("");
      setClientPhone("");
      setNotice("Data klien berhasil disimpan.");
      await refresh();
    }
    setSaving(false);
  }

  async function recordSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    const order = orders.find((item) => item.id === selectedOrder);
    if (!order) {
      setError("Pilih pesanan yang tercatat atas nama reseller ini.");
      setSaving(false);
      return;
    }
    const { error: insertError } = await client.from("reseller_sales").insert({
      order_id: order.id,
      reseller_user_id: userId,
      client_id: selectedClient || null,
      wholesale_amount: Number(wholesale),
      resale_amount: resale === "" ? null : Number(resale),
      currency: order.currency,
      recorded_by: userId,
    });
    if (insertError) setError(insertError.message);
    else {
      setSelectedOrder("");
      setSelectedClient("");
      setResale("");
      setNotice("Catatan penjualan reseller berhasil disimpan.");
      await refresh();
    }
    setSaving(false);
  }

  async function archiveClient(clientId: string) {
    setSaving(true);
    setError("");
    setNotice("");
    const { error: updateError } = await client
      .from("reseller_clients")
      .update({ status: "archived", updated_at: new Date().toISOString() })
      .eq("id", clientId);
    if (updateError) setError(updateError.message);
    else {
      setNotice("Klien diarsipkan.");
      await refresh();
    }
    setSaving(false);
  }

  async function deactivateRule(ruleId: string) {
    setSaving(true);
    setError("");
    setNotice("");
    const { error: updateError } = await client
      .from("reseller_price_rules")
      .update({ valid_until: new Date().toISOString() })
      .eq("id", ruleId);
    if (updateError) setError(updateError.message);
    else {
      setNotice("Aturan harga dinonaktifkan.");
      await refresh();
    }
    setSaving(false);
  }

  async function savePriceRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ruleReference) {
      setError("Pilih template atau add-on.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    const { error: insertError } = await client.from("reseller_price_rules").insert({
      reseller_tier: ruleTier,
      template_id: ruleType === "template" ? ruleReference : null,
      add_on_id: ruleType === "add_on" ? ruleReference : null,
      wholesale_price: Number(rulePrice),
      currency: "IDR",
      valid_from: new Date().toISOString(),
    });
    if (insertError) setError(insertError.message);
    else {
      setNotice("Aturan harga wholesale berhasil ditambahkan.");
      setRuleReference("");
      setRulePrice("0");
      await refresh();
    }
    setSaving(false);
  }

  async function review(user: string, nextStatus: "approved" | "rejected") {
    setSaving(true);
    setError("");
    setNotice("");
    const { error: rpcError } = await client.rpc("review_reseller_application", {
      p_user_id: user,
      p_status: nextStatus,
      p_pricing_tier: "standard",
    });
    if (rpcError) setError(rpcError.message);
    else {
      setNotice("Status pendaftaran reseller diperbarui.");
      await refresh();
    }
    setSaving(false);
  }

  const recordedMargin = sales.reduce(
    (sum, item) =>
      sum + (item.resale_amount === null ? 0 : item.resale_amount - item.wholesale_amount),
    0,
  );
  const totalWholesale = sales.reduce((sum, item) => sum + item.wholesale_amount, 0);

  return (
    <main className="min-h-screen bg-[#fffaf6] px-4 py-8 text-[#30251f] sm:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#a36d55]">
              Janji Kita · Reseller
            </p>
            <h1 className="mt-2 text-2xl font-semibold">Ruang kerja reseller</h1>
            <p className="mt-1 text-sm text-[#76675f]">
              Harga wholesale, data klien, atribusi pesanan, dan catatan margin.
            </p>
          </div>
          <a
            href="/"
            className="rounded-xl border border-[#ddcec3] bg-white px-4 py-2 text-sm font-semibold"
          >
            Ruang kerja
          </a>
        </header>
        {(error || notice) && (
          <p
            role={error ? "alert" : "status"}
            className={`rounded-xl px-4 py-3 text-sm ${error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-800"}`}
          >
            {error || notice}
          </p>
        )}
        {loading ? (
          <p className="py-10 text-center text-sm text-[#76675f]">Memuat data reseller...</p>
        ) : (
          <>
            {isAdmin && (
              <section className="rounded-2xl border border-[#eaded5] bg-white p-5">
                <h2 className="text-lg font-semibold">Aturan harga wholesale</h2>
                <p className="mt-1 text-sm text-[#76675f]">
                  Harga berlaku untuk checkout yang dibayar reseller. Checkout klien langsung tetap
                  memakai harga retail.
                </p>
                <form
                  onSubmit={savePriceRule}
                  className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
                >
                  <label className="text-sm font-medium">
                    Tingkat reseller
                    <input
                      value={ruleTier}
                      onChange={(e) => setRuleTier(e.target.value)}
                      required
                      maxLength={40}
                      className="mt-1.5 w-full rounded-xl border border-[#ddcec3] px-3 py-2.5"
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Jenis item
                    <select
                      value={ruleType}
                      onChange={(e) => {
                        setRuleType(e.target.value as "template" | "add_on");
                        setRuleReference("");
                      }}
                      className="mt-1.5 w-full rounded-xl border border-[#ddcec3] px-3 py-2.5"
                    >
                      <option value="template">Template</option>
                      <option value="add_on">Add-on</option>
                    </select>
                  </label>
                  <label className="text-sm font-medium sm:col-span-2 lg:col-span-1">
                    Item
                    <select
                      required
                      value={ruleReference}
                      onChange={(e) => setRuleReference(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-[#ddcec3] px-3 py-2.5"
                    >
                      <option value="">Pilih item</option>
                      {(ruleType === "template" ? templates : addOns).map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title || item.name_i18n?.["id-ID"] || item.code || item.id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-medium">
                    Harga wholesale
                    <input
                      type="number"
                      min="0"
                      required
                      value={rulePrice}
                      onChange={(e) => setRulePrice(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-[#ddcec3] px-3 py-2.5"
                    />
                  </label>
                  <button
                    disabled={saving}
                    className="self-end rounded-xl bg-[#754b3b] px-4 py-2.5 text-sm font-semibold text-white"
                  >
                    Tambah aturan
                  </button>
                </form>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-[#f0e7e0] text-[#887970]">
                        <th className="py-2 pr-3">Tingkat</th>
                        <th className="py-2 pr-3">Item</th>
                        <th className="py-2 pr-3">Harga</th>
                        <th className="py-2">Berlaku</th>
                      </tr>
                    </thead>
                    <tbody>
                      {priceRules.map((rule) => (
                        <tr key={rule.id} className="border-b border-[#f7f0eb]">
                          <td className="py-2 pr-3">{rule.reseller_tier}</td>
                          <td className="py-2 pr-3">
                            {rule.template_id ? "Template" : "Add-on"} ·{" "}
                            {(rule.template_id || rule.add_on_id || "").slice(0, 8)}
                          </td>
                          <td className="py-2 pr-3">
                            {money(rule.wholesale_price, rule.currency)}
                          </td>
                          <td className="py-2">
                            {new Date(rule.valid_from).toLocaleDateString("id-ID")}
                            {rule.valid_until
                              ? " – " + new Date(rule.valid_until).toLocaleDateString("id-ID")
                              : " – seterusnya"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
            {isAdmin && applications.length > 0 && (
              <section className="rounded-2xl border border-[#eaded5] bg-white p-5">
                <h2 className="text-lg font-semibold">Pendaftaran menunggu persetujuan</h2>
                <div className="mt-3 divide-y divide-[#f0e7e0]">
                  {applications.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <div>
                        <p className="font-semibold">{item.business_name}</p>
                        <p className="text-xs text-[#887970]">
                          {item.contact_email} · {item.user_id}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          disabled={saving}
                          onClick={() => void review(item.user_id, "approved")}
                          className="rounded-lg bg-[#754b3b] px-3 py-2 text-xs font-semibold text-white"
                        >
                          Setujui
                        </button>
                        <button
                          disabled={saving}
                          onClick={() => void review(item.user_id, "rejected")}
                          className="rounded-lg border border-[#ddcec3] px-3 py-2 text-xs font-semibold"
                        >
                          Tolak
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {!profile || profile.status === "rejected" ? (
              <form
                onSubmit={apply}
                className="rounded-2xl border border-[#eaded5] bg-white p-5 sm:p-6"
              >
                <h2 className="text-lg font-semibold">Daftar sebagai reseller</h2>
                <p className="mt-1 text-sm text-[#76675f]">
                  Akses komersial diberikan setelah peninjauan admin.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-medium">
                    Nama usaha
                    <input
                      required
                      maxLength={120}
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      className="mt-2 w-full rounded-xl border border-[#ddcec3] px-3 py-2.5"
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Email kontak
                    <input
                      type="email"
                      required
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      className="mt-2 w-full rounded-xl border border-[#ddcec3] px-3 py-2.5"
                    />
                  </label>
                </div>
                <label className="mt-4 flex items-start gap-2 text-sm">
                  <input type="checkbox" required className="mt-1" />
                  <span>Saya menyetujui ketentuan reseller versi 2026-11-23-v1.</span>
                </label>
                <button
                  disabled={saving}
                  className="mt-4 rounded-xl bg-[#754b3b] px-5 py-3 text-sm font-semibold text-white"
                >
                  Kirim pendaftaran
                </button>
              </form>
            ) : profile.status !== "approved" ? (
              <section className="rounded-2xl border border-[#eaded5] bg-white p-6">
                <h2 className="font-semibold">
                  Pendaftaran {profile.status === "applied" ? "sedang ditinjau" : profile.status}
                </h2>
                <p className="mt-1 text-sm text-[#76675f]">
                  Fitur klien dan laporan akan tersedia setelah status reseller disetujui.
                </p>
              </section>
            ) : (
              <>
                <section className="rounded-2xl border border-[#eaded5] bg-white p-5">
                  <p className="text-sm text-[#76675f]">Kode referral reseller</p>
                  <p className="mt-2 font-mono text-2xl font-semibold tracking-wider">
                    {profile.referral_code}
                  </p>
                  <p className="mt-1 text-xs text-[#887970]">
                    Klien dapat memasukkan kode ini saat checkout untuk mencatat atribusi reseller.
                  </p>
                </section>
                <section className="grid gap-3 sm:grid-cols-3">
                  <article className="rounded-2xl border border-[#eaded5] bg-white p-5">
                    <p className="text-sm text-[#76675f]">Klien aktif</p>
                    <p className="mt-2 text-2xl font-semibold">
                      {clients.filter((item) => item.status === "active").length}
                    </p>
                  </article>
                  <article className="rounded-2xl border border-[#eaded5] bg-white p-5">
                    <p className="text-sm text-[#76675f]">Biaya wholesale tercatat</p>
                    <p className="mt-2 text-xl font-semibold">{money(totalWholesale)}</p>
                  </article>
                  <article className="rounded-2xl border border-[#eaded5] bg-white p-5">
                    <p className="text-sm text-[#76675f]">Margin yang dicatat</p>
                    <p className="mt-2 text-xl font-semibold">{money(recordedMargin)}</p>
                    <p className="mt-1 text-xs text-[#887970]">
                      Bukan dana payout atau saldo yang ditransfer
                    </p>
                  </article>
                </section>
                <section className="grid gap-4 lg:grid-cols-2">
                  <form
                    onSubmit={addClient}
                    className="rounded-2xl border border-[#eaded5] bg-white p-5"
                  >
                    <h2 className="font-semibold">Tambah klien</h2>
                    <div className="mt-3 space-y-3">
                      <label className="block text-sm font-medium">
                        Nama
                        <input
                          required
                          value={clientName}
                          onChange={(e) => setClientName(e.target.value)}
                          className="mt-1.5 w-full rounded-xl border border-[#ddcec3] px-3 py-2.5"
                        />
                      </label>
                      <label className="block text-sm font-medium">
                        Email
                        <input
                          type="email"
                          required
                          value={clientEmail}
                          onChange={(e) => setClientEmail(e.target.value)}
                          className="mt-1.5 w-full rounded-xl border border-[#ddcec3] px-3 py-2.5"
                        />
                      </label>
                      <label className="block text-sm font-medium">
                        Telepon (opsional)
                        <input
                          value={clientPhone}
                          onChange={(e) => setClientPhone(e.target.value)}
                          className="mt-1.5 w-full rounded-xl border border-[#ddcec3] px-3 py-2.5"
                        />
                      </label>
                    </div>
                    <button
                      disabled={saving}
                      className="mt-4 rounded-xl bg-[#754b3b] px-4 py-2.5 text-sm font-semibold text-white"
                    >
                      Simpan klien
                    </button>
                  </form>
                  <form
                    onSubmit={recordSale}
                    className="rounded-2xl border border-[#eaded5] bg-white p-5"
                  >
                    <h2 className="font-semibold">Catat harga jual</h2>
                    <p className="mt-1 text-xs text-[#887970]">
                      Hanya pesanan yang sudah memiliki atribusi reseller dapat dicatat.
                    </p>
                    <div className="mt-3 space-y-3">
                      <label className="block text-sm font-medium">
                        Pesanan
                        <select
                          required
                          value={selectedOrder}
                          onChange={(e) => setSelectedOrder(e.target.value)}
                          className="mt-1.5 w-full rounded-xl border border-[#ddcec3] px-3 py-2.5"
                        >
                          <option value="">Pilih pesanan</option>
                          {orders.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.order_number} · {item.status} ·{" "}
                              {money(item.grand_total, item.currency)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-sm font-medium">
                        Klien
                        <select
                          value={selectedClient}
                          onChange={(e) => setSelectedClient(e.target.value)}
                          className="mt-1.5 w-full rounded-xl border border-[#ddcec3] px-3 py-2.5"
                        >
                          <option value="">Tanpa klien tertaut</option>
                          {clients.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-sm font-medium">
                        Harga wholesale (IDR)
                        <input
                          required
                          type="number"
                          min="0"
                          value={wholesale}
                          onChange={(e) => setWholesale(e.target.value)}
                          className="mt-1.5 w-full rounded-xl border border-[#ddcec3] px-3 py-2.5"
                        />
                      </label>
                      <label className="block text-sm font-medium">
                        Harga jual ke klien (opsional)
                        <input
                          type="number"
                          min="0"
                          value={resale}
                          onChange={(e) => setResale(e.target.value)}
                          className="mt-1.5 w-full rounded-xl border border-[#ddcec3] px-3 py-2.5"
                        />
                      </label>
                    </div>
                    <button
                      disabled={saving || orders.length === 0}
                      className="mt-4 rounded-xl bg-[#754b3b] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      Simpan catatan
                    </button>
                  </form>
                </section>
                <section className="rounded-2xl border border-[#eaded5] bg-white p-5">
                  <h2 className="font-semibold">Daftar klien</h2>
                  {clients.length === 0 ? (
                    <p className="mt-2 text-sm text-[#76675f]">Belum ada klien.</p>
                  ) : (
                    <div className="mt-3 divide-y divide-[#f0e7e0]">
                      {clients.map((item) => (
                        <div key={item.id} className="py-3">
                          <p className="font-medium">{item.name}</p>
                          <p className="text-xs text-[#887970]">
                            {item.email}
                            {item.phone ? " · " + item.phone : ""}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
                <section className="rounded-2xl border border-[#eaded5] bg-white p-5">
                  <h2 className="font-semibold">Riwayat catatan penjualan</h2>
                  {sales.length === 0 ? (
                    <p className="mt-2 text-sm text-[#76675f]">Belum ada catatan penjualan.</p>
                  ) : (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-[#f0e7e0] text-[#887970]">
                            <th className="py-2 pr-3">Tanggal</th>
                            <th className="py-2 pr-3">Wholesale</th>
                            <th className="py-2 pr-3">Harga jual</th>
                            <th className="py-2">Margin tercatat</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sales.map((item) => (
                            <tr key={item.id} className="border-b border-[#f7f0eb]">
                              <td className="py-2 pr-3">
                                {new Date(item.created_at).toLocaleDateString("id-ID")}
                              </td>
                              <td className="py-2 pr-3">
                                {money(item.wholesale_amount, item.currency)}
                              </td>
                              <td className="py-2 pr-3">
                                {item.resale_amount === null
                                  ? "Belum dicatat"
                                  : money(item.resale_amount, item.currency)}
                              </td>
                              <td className="py-2">
                                {item.resale_amount === null
                                  ? "—"
                                  : money(
                                      item.resale_amount - item.wholesale_amount,
                                      item.currency,
                                    )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
