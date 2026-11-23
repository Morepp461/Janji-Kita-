import { createClient } from "npm:@supabase/supabase-js@2.119.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Metode tidak diizinkan." }, 405);

  try {
    const token = request.headers.get("Authorization")?.replace(/^Bearer\\s+/i, "");
    if (!token) return json({ error: "Sesi masuk diperlukan." }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}") as Record<string, string>;
    const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, string>;
    const publishableKey = Deno.env.get("SUPABASE_ANON_KEY")
      ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")
      ?? publishableKeys.default;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
      ?? Deno.env.get("SUPABASE_SECRET_KEY")
      ?? secretKeys.default;
    const serverKey = Deno.env.get("MIDTRANS_SERVER_KEY");
    if (!supabaseUrl || !publishableKey || !serviceRoleKey || !serverKey) {
      return json({ error: "Rekonsiliasi sandbox belum dikonfigurasi." }, 503);
    }
    if (Deno.env.get("MIDTRANS_IS_PRODUCTION") === "true") {
      return json({ error: "Rekonsiliasi production dinonaktifkan pada fase ini." }, 503);
    }

    const userClient = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !userData.user) return json({ error: "Sesi masuk tidak valid." }, 401);
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userRoles, error: roleError } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    if (roleError) return json({ error: "Izin finance belum dapat diverifikasi." }, 500);
    const roleNames = (userRoles ?? []).map((item) => item.role as string);
    const { data: permissions, error: permissionError } = await admin
      .from("role_permissions")
      .select("permission_key")
      .in("role", roleNames);
    if (permissionError) return json({ error: "Izin finance belum dapat diverifikasi." }, 500);
    const allowed = roleNames.includes("super_admin")
      || (permissions ?? []).some((item) => item.permission_key === "orders.read");
    if (!allowed) return json({ error: "Akses finance diperlukan." }, 403);
    const cutoff = new Date(Date.now() - 5 * 60_000).toISOString();
    const { data: attempts, error: queryError } = await admin
      .from("payment_attempts")
      .select("id,provider_order_id,amount,currency,orders!inner(id,status,expires_at,grand_total,currency)")
      .eq("provider", "midtrans")
      .eq("status", "pending")
      .eq("orders.status", "pending")
      .lt("created_at", cutoff)
      .limit(50);
    if (queryError) {
      console.error("Gagal mengambil transaksi pending:", queryError.message);
      return json({ error: "Daftar transaksi pending belum dapat dibaca." }, 500);
    }

    let processed = 0;
    let skipped = 0;
    const credentials = btoa(`${serverKey}:`);
    for (const attempt of attempts ?? []) {
      const order = Array.isArray(attempt.orders) ? attempt.orders[0] : attempt.orders;
      if (!order || new Date(order.expires_at).getTime() <= Date.now()) {
        skipped += 1;
        continue;
      }
      const response = await fetch(
        `https://api.sandbox.midtrans.com/v2/${encodeURIComponent(attempt.provider_order_id)}/status`,
        { headers: { Authorization: `Basic ${credentials}`, Accept: "application/json" } },
      );
      if (!response.ok) {
        skipped += 1;
        continue;
      }
      const verified = await response.json() as Record<string, unknown>;
      const amount = Math.round(Number.parseFloat(String(verified.gross_amount ?? "NaN")));
      if (
        String(verified.order_id ?? "") !== attempt.provider_order_id
        || amount !== Number(attempt.amount)
        || amount !== Number(order.grand_total)
        || String(verified.currency ?? "IDR") !== "IDR"
      ) {
        skipped += 1;
        continue;
      }

      const refundAmount = verified.refund_amount == null
        ? null
        : Math.round(Number.parseFloat(String(verified.refund_amount)));
      const transactionId = String(verified.transaction_id ?? attempt.provider_order_id);
      const statusCode = String(verified.status_code ?? "");
      const transactionStatus = String(verified.transaction_status ?? "pending");
      const transactionTime = String(verified.transaction_time ?? "");
      const eventKey = `reconcile:${transactionId}:${statusCode}:${transactionStatus}:${transactionTime}`.slice(0, 240);
      const { error: processError } = await admin.rpc("process_midtrans_notification", {
        p_provider_order_id: attempt.provider_order_id,
        p_provider_transaction_id: transactionId,
        p_transaction_status: transactionStatus,
        p_fraud_status: String(verified.fraud_status ?? ""),
        p_payment_type: String(verified.payment_type ?? ""),
        p_status_code: statusCode,
        p_gross_amount: amount,
        p_refund_amount: refundAmount,
        p_event_key: eventKey,
        p_payload_redacted: {
          source: "reconciliation",
          order_id: attempt.provider_order_id,
          transaction_id: transactionId,
          transaction_status: transactionStatus,
          fraud_status: verified.fraud_status ?? null,
          payment_type: verified.payment_type ?? null,
          status_code: statusCode,
          gross_amount: verified.gross_amount ?? null,
          refund_amount: verified.refund_amount ?? null,
          transaction_time: transactionTime,
          currency: "IDR",
        },
        p_signature_valid: true,
        p_verified_at: new Date().toISOString(),
      });
      if (processError) {
        console.error("Gagal memproses hasil rekonsiliasi:", processError.message);
        skipped += 1;
      } else {
        processed += 1;
      }
    }

    return json({ checked: (attempts ?? []).length, processed, skipped });
  } catch (error) {
    console.error("Kesalahan rekonsiliasi Midtrans:", error);
    return json({ error: "Rekonsiliasi belum dapat diselesaikan." }, 500);
  }
});
