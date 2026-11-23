import { createClient } from "npm:@supabase/supabase-js@2.119.2";
import { extractBearerToken } from "../_shared/bearer-token.ts";

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

function getSupabaseKeys() {
  const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}") as Record<string, string>;
  const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, string>;
  return {
    publishableKey: Deno.env.get("SUPABASE_ANON_KEY")
      ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")
      ?? publishableKeys.default,
    serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? secretKeys.default,
  };
}

function safeReturnUrl(value: string | undefined, orderId: string): string {
  const fallback = "https://janji-kita-nine.vercel.app/orders";
  if (!value) return fallback;
  try {
    const parsed = new URL(value);
    const allowedHosts = new Set([
      "janji-kita-nine.vercel.app",
      "janji-kita-morepp.vercel.app",
      "janji-kita-git-main-morepp.vercel.app",
      "localhost",
    ]);
    if (!allowedHosts.has(parsed.hostname) || !["https:", "http:"].includes(parsed.protocol)) return fallback;
    parsed.pathname = "/orders";
    parsed.search = new URLSearchParams({ order_id: orderId }).toString();
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return fallback;
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Metode tidak diizinkan." }, 405);

  try {
    const token = extractBearerToken(request.headers.get("Authorization"));
    if (!token) return json({ error: "Sesi masuk diperlukan." }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const { publishableKey, serviceRoleKey } = getSupabaseKeys();
    const serverKey = Deno.env.get("MIDTRANS_SERVER_KEY");
    if (!supabaseUrl || !publishableKey || !serviceRoleKey || !serverKey) {
      console.error("Konfigurasi Supabase atau MIDTRANS_SERVER_KEY belum lengkap.");
      return json({ error: "Pembayaran sandbox belum dikonfigurasi." }, 503);
    }
    if (Deno.env.get("MIDTRANS_IS_PRODUCTION") === "true") {
      return json({ error: "Mode pembayaran production dinonaktifkan pada fase ini." }, 503);
    }

    const authClient = createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !userData.user) return json({ error: "Sesi masuk tidak valid." }, 401);

    const body = await request.json().catch(() => null) as {
      order_id?: string;
      return_url?: string;
    } | null;
    if (!body?.order_id || !/^[0-9a-f-]{36}$/i.test(body.order_id)) {
      return json({ error: "Identitas pesanan tidak valid." }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id,order_number,payer_user_id,owner_user_id,status,subtotal,discount_total,grand_total,currency,expires_at")
      .eq("id", body.order_id)
      .maybeSingle();
    if (orderError || !order) return json({ error: "Pesanan tidak ditemukan." }, 404);
    if (order.payer_user_id !== userData.user.id && order.owner_user_id !== userData.user.id) {
      return json({ error: "Tidak memiliki akses ke pesanan ini." }, 403);
    }
    if (order.status === "paid") return json({ error: "Pesanan sudah dibayar." }, 409);
    if (order.status !== "pending" || new Date(order.expires_at).getTime() <= Date.now()) {
      return json({ error: "Pesanan sudah tidak berlaku. Buat pesanan baru." }, 409);
    }
    if (order.currency !== "IDR" || !Number.isSafeInteger(Number(order.grand_total))) {
      return json({ error: "Mata uang atau nominal pesanan tidak didukung." }, 422);
    }

    const idempotencyKey = `midtrans:${order.id}`;
    const { data: existingAttempt } = await admin
      .from("payment_attempts")
      .select("id,checkout_token,checkout_url,status")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existingAttempt?.checkout_token && existingAttempt.checkout_url) {
      return json({
        order_number: order.order_number,
        token: existingAttempt.checkout_token,
        redirect_url: existingAttempt.checkout_url,
      });
    }

    const { data: items, error: itemError } = await admin
      .from("order_items")
      .select("description_snapshot,quantity,unit_price,line_total")
      .eq("order_id", order.id);
    if (itemError) return json({ error: "Rincian pesanan tidak dapat dibaca." }, 500);

    const itemDetails = (items ?? []).map((item) => ({
      id: item.description_snapshot.slice(0, 50),
      name: item.description_snapshot.slice(0, 50),
      quantity: item.quantity,
      price: item.unit_price,
    }));
    if (Number(order.discount_total) > 0) {
      itemDetails.push({
        id: "discount",
        name: "Diskon kupon",
        quantity: 1,
        price: -Number(order.discount_total),
      });
    }

    const credentials = btoa(`${serverKey}:`);
    const snapResponse = await fetch("https://app.sandbox.midtrans.com/snap/v1/transactions", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        transaction_details: {
          order_id: order.order_number,
          gross_amount: Number(order.grand_total),
        },
        item_details: itemDetails,
        callbacks: { finish: safeReturnUrl(body.return_url, order.id) },
        customer_details: {
          first_name: (userData.user.user_metadata?.display_name as string | undefined)?.slice(0, 50)
            ?? "Pelanggan Janji Kita",
          email: userData.user.email,
        },
        expiry: { unit: "hour", duration: 24 },
      }),
    });

    const snap = await snapResponse.json().catch(() => ({})) as {
      token?: string;
      redirect_url?: string;
      error_messages?: string[];
    };
    if (!snapResponse.ok || !snap.token || !snap.redirect_url) {
      console.error("Midtrans sandbox menolak pembuatan sesi:", snapResponse.status, snap.error_messages);
      return json({ error: "Sesi pembayaran belum dapat dibuat. Coba kembali." }, 502);
    }

    const attemptPayload = {
      order_id: order.id,
      provider: "midtrans",
      provider_order_id: order.order_number,
      status: "pending",
      amount: Number(order.grand_total),
      currency: order.currency,
      idempotency_key: idempotencyKey,
      checkout_token: snap.token,
      checkout_url: snap.redirect_url,
    };
    const { error: attemptError } = await admin
      .from("payment_attempts")
      .upsert(attemptPayload, { onConflict: "idempotency_key" });
    if (attemptError) {
      console.error("Gagal menyimpan payment attempt:", attemptError.message);
      return json({ error: "Sesi pembayaran gagal disimpan." }, 500);
    }

    return json({
      order_number: order.order_number,
      token: snap.token,
      redirect_url: snap.redirect_url,
    });
  } catch (error) {
    console.error("Kesalahan create-midtrans-payment:", error);
    return json({ error: "Terjadi kesalahan saat menyiapkan pembayaran." }, 500);
  }
});
