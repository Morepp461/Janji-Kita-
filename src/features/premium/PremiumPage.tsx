import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

type Plan = {
  code: string;
  name: string;
  monthly_price: number | null;
  currency: string;
  collaborator_limit: number;
  billing_provider: string | null;
  trial_days: number;
  grace_period_days: number;
  is_active: boolean;
};
type Subscription = {
  id: string;
  plan_code: string;
  provider: string;
  status: string;
  period_start: string;
  period_end: string;
  cancel_at_period_end: boolean;
};

const money = (value: number | null, currency = "IDR") =>
  value === null
    ? "Belum diatur"
    : new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(value);

export default function PremiumPage({
  client,
  userId,
  isAdmin,
}: {
  client: SupabaseClient;
  userId: string;
  isAdmin: boolean;
}) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [limit, setLimit] = useState(2);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedPlan, setSelectedPlan] = useState("premium_monthly");
  const [userToManage, setUserToManage] = useState("");
  const [provider, setProvider] = useState("");
  const [status, setStatus] = useState("active");
  const [periodEnd, setPeriodEnd] = useState(() =>
    new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 16),
  );
  const [planDraft, setPlanDraft] = useState<Plan | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    const [planResult, subscriptionResult, entitlementResult] = await Promise.all([
      client.from("subscription_plans").select("*").order("code"),
      client
        .from("subscriptions")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1),
      client
        .from("entitlements")
        .select("value")
        .eq("user_id", userId)
        .eq("entitlement_key", "collaborator_limit")
        .eq("status", "active")
        .order("valid_from", { ascending: false })
        .limit(1),
    ]);
    const firstError = planResult.error || subscriptionResult.error || entitlementResult.error;
    if (firstError) setError(firstError.message);
    const nextPlans = (planResult.data || []) as Plan[];
    setPlans(nextPlans);
    setSubscription(((subscriptionResult.data || [])[0] || null) as Subscription | null);
    const value = entitlementResult.data?.[0]?.value as { collaborator_limit?: number } | undefined;
    setLimit(Math.max(2, Number(value?.collaborator_limit || 2)));
    setLoading(false);
  }, [client, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function editPlan(plan: Plan) {
    setPlanDraft({ ...plan });
  }

  async function savePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!planDraft) return;
    setSaving(true);
    setError("");
    setNotice("");
    const { error: saveError } = await client.from("subscription_plans").upsert(
      {
        code: planDraft.code,
        name: planDraft.name,
        monthly_price: planDraft.monthly_price,
        currency: planDraft.currency,
        collaborator_limit: planDraft.collaborator_limit,
        billing_provider: planDraft.billing_provider || null,
        trial_days: planDraft.trial_days,
        grace_period_days: planDraft.grace_period_days,
        is_active: planDraft.is_active,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "code" },
    );
    if (saveError) setError(saveError.message);
    else {
      setNotice("Konfigurasi paket berhasil disimpan.");
      setPlanDraft(null);
      await refresh();
    }
    setSaving(false);
  }

  async function setUserSubscription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    const start = new Date().toISOString();
    const { error: rpcError } = await client.rpc("admin_set_subscription", {
      p_user_id: userToManage.trim(),
      p_plan_code: selectedPlan,
      p_provider: provider.trim(),
      p_status: status,
      p_period_start: start,
      p_period_end: new Date(periodEnd).toISOString(),
      p_provider_subscription_id: null,
      p_cancel_at_period_end: false,
    });
    if (rpcError) setError(rpcError.message);
    else {
      setNotice("Status langganan dan entitlement berhasil disinkronkan.");
      setUserToManage("");
      await refresh();
    }
    setSaving(false);
  }

  return (
    <main className="min-h-screen bg-[#fffaf6] px-4 py-8 text-[#30251f] sm:px-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#a36d55]">
              Janji Kita · Premium
            </p>
            <h1 className="mt-2 text-2xl font-semibold">Langganan Premium</h1>
            <p className="mt-1 text-sm text-[#76675f]">
              Premium menambah kapasitas editor, bukan biaya publikasi undangan.
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
          <p className="py-10 text-center text-sm text-[#76675f]">Memuat paket...</p>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-3">
              <article className="rounded-2xl border border-[#eaded5] bg-white p-5">
                <p className="text-sm text-[#76675f]">Batas editor akun</p>
                <p className="mt-2 text-2xl font-semibold">{limit} orang</p>
                <p className="mt-1 text-xs text-[#887970]">Pemilik termasuk dalam batas</p>
              </article>
              <article className="rounded-2xl border border-[#eaded5] bg-white p-5">
                <p className="text-sm text-[#76675f]">Status langganan</p>
                <p className="mt-2 text-2xl font-semibold">{subscription?.status || "Gratis"}</p>
                <p className="mt-1 text-xs text-[#887970]">
                  {subscription
                    ? `Berakhir ${new Date(subscription.period_end).toLocaleDateString("id-ID")}`
                    : "Belum ada langganan aktif"}
                </p>
              </article>
              <article className="rounded-2xl border border-[#eaded5] bg-white p-5">
                <p className="text-sm text-[#76675f]">Paket</p>
                <p className="mt-2 text-2xl font-semibold">{subscription?.plan_code || "Free"}</p>
                <p className="mt-1 text-xs text-[#887970]">
                  Publikasi undangan tetap dibayar terpisah
                </p>
              </article>
            </section>
            <section className="rounded-2xl border border-[#eaded5] bg-white p-5 sm:p-6">
              <h2 className="text-lg font-semibold">Paket yang tersedia</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {plans
                  .filter((plan) => plan.is_active || isAdmin)
                  .map((plan) => (
                    <article key={plan.code} className="rounded-xl border border-[#f0e7e0] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold">{plan.name}</h3>
                          <p className="mt-1 text-sm text-[#76675f]">
                            {money(plan.monthly_price, plan.currency)} / bulan
                          </p>
                        </div>
                        {isAdmin && (
                          <button
                            onClick={() => editPlan(plan)}
                            className="rounded-lg border border-[#ddcec3] px-3 py-1.5 text-xs font-semibold"
                          >
                            Atur
                          </button>
                        )}
                      </div>
                      <ul className="mt-3 space-y-1 text-sm text-[#76675f]">
                        <li>• Maksimal {plan.collaborator_limit} editor termasuk pemilik</li>
                        <li>• Masa tenggang {plan.grace_period_days} hari</li>
                        <li>• Uji coba {plan.trial_days} hari</li>
                        <li>• Provider: {plan.billing_provider || "Belum dikonfigurasi"}</li>
                      </ul>
                    </article>
                  ))}
                {plans.filter((plan) => plan.is_active).length === 0 && (
                  <p className="text-sm text-[#76675f]">
                    Belum ada paket yang diaktifkan. Konfigurasi harga dan provider terlebih dahulu.
                  </p>
                )}
              </div>
            </section>
            {planDraft && isAdmin && (
              <form
                onSubmit={savePlan}
                className="space-y-4 rounded-2xl border border-[#eaded5] bg-white p-5 sm:p-6"
              >
                <h2 className="text-lg font-semibold">Konfigurasi {planDraft.name}</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-medium">
                    Nama paket
                    <input
                      required
                      value={planDraft.name}
                      onChange={(e) => setPlanDraft({ ...planDraft, name: e.target.value })}
                      className="mt-2 w-full rounded-xl border border-[#ddcec3] px-3 py-2.5"
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Harga per bulan (IDR)
                    <input
                      type="number"
                      min="0"
                      value={planDraft.monthly_price ?? ""}
                      onChange={(e) =>
                        setPlanDraft({
                          ...planDraft,
                          monthly_price: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                      className="mt-2 w-full rounded-xl border border-[#ddcec3] px-3 py-2.5"
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Batas editor termasuk pemilik
                    <input
                      type="number"
                      min="3"
                      max="100"
                      value={planDraft.collaborator_limit}
                      onChange={(e) =>
                        setPlanDraft({ ...planDraft, collaborator_limit: Number(e.target.value) })
                      }
                      className="mt-2 w-full rounded-xl border border-[#ddcec3] px-3 py-2.5"
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Provider penagihan
                    <input
                      value={planDraft.billing_provider || ""}
                      onChange={(e) =>
                        setPlanDraft({ ...planDraft, billing_provider: e.target.value })
                      }
                      className="mt-2 w-full rounded-xl border border-[#ddcec3] px-3 py-2.5"
                      placeholder="Isi setelah provider disetujui"
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Hari uji coba
                    <input
                      type="number"
                      min="0"
                      max="90"
                      value={planDraft.trial_days}
                      onChange={(e) =>
                        setPlanDraft({ ...planDraft, trial_days: Number(e.target.value) })
                      }
                      className="mt-2 w-full rounded-xl border border-[#ddcec3] px-3 py-2.5"
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Hari masa tenggang
                    <input
                      type="number"
                      min="0"
                      max="60"
                      value={planDraft.grace_period_days}
                      onChange={(e) =>
                        setPlanDraft({ ...planDraft, grace_period_days: Number(e.target.value) })
                      }
                      className="mt-2 w-full rounded-xl border border-[#ddcec3] px-3 py-2.5"
                    />
                  </label>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={planDraft.is_active}
                    onChange={(e) => setPlanDraft({ ...planDraft, is_active: e.target.checked })}
                  />{" "}
                  Aktifkan paket untuk pengguna
                </label>
                <div className="flex gap-2">
                  <button
                    disabled={saving}
                    className="rounded-xl bg-[#754b3b] px-4 py-2.5 text-sm font-semibold text-white"
                  >
                    Simpan paket
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlanDraft(null)}
                    className="rounded-xl border border-[#ddcec3] px-4 py-2.5 text-sm font-semibold"
                  >
                    Batal
                  </button>
                </div>
              </form>
            )}
            {isAdmin && (
              <form
                onSubmit={setUserSubscription}
                className="space-y-4 rounded-2xl border border-[#eaded5] bg-white p-5 sm:p-6"
              >
                <h2 className="text-lg font-semibold">Sinkronisasi langganan pengguna</h2>
                <p className="text-sm text-[#76675f]">
                  Panel administratif/adapter. Jangan aktifkan status berbayar sebelum pembayaran
                  diverifikasi oleh provider.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-medium">
                    ID pengguna
                    <input
                      required
                      value={userToManage}
                      onChange={(e) => setUserToManage(e.target.value)}
                      className="mt-2 w-full rounded-xl border border-[#ddcec3] px-3 py-2.5"
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Paket
                    <select
                      value={selectedPlan}
                      onChange={(e) => setSelectedPlan(e.target.value)}
                      className="mt-2 w-full rounded-xl border border-[#ddcec3] px-3 py-2.5"
                    >
                      {plans
                        .filter((plan) => plan.is_active)
                        .map((plan) => (
                          <option key={plan.code} value={plan.code}>
                            {plan.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="text-sm font-medium">
                    Provider
                    <input
                      required
                      value={provider}
                      onChange={(e) => setProvider(e.target.value)}
                      className="mt-2 w-full rounded-xl border border-[#ddcec3] px-3 py-2.5"
                      placeholder="Provider yang telah dikonfigurasi"
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Status
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      className="mt-2 w-full rounded-xl border border-[#ddcec3] px-3 py-2.5"
                    >
                      <option value="trialing">Trialing</option>
                      <option value="active">Active</option>
                      <option value="past_due">Past due</option>
                      <option value="cancelled">Cancelled</option>
                      <option value="expired">Expired</option>
                    </select>
                  </label>
                  <label className="text-sm font-medium">
                    Akhir periode
                    <input
                      required
                      type="datetime-local"
                      value={periodEnd}
                      onChange={(e) => setPeriodEnd(e.target.value)}
                      className="mt-2 w-full rounded-xl border border-[#ddcec3] px-3 py-2.5"
                    />
                  </label>
                </div>
                <button
                  disabled={
                    saving || !plans.some((plan) => plan.code === selectedPlan && plan.is_active)
                  }
                  className="rounded-xl bg-[#754b3b] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Simpan status dan entitlement
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </main>
  );
}
