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

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha512(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-512", new TextEncoder().encode(value));
  return toHex(new Uint8Array(digest));
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Metode tidak diizinkan." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, string>;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? secretKeys.default;
    const serverKey = Deno.env.get("MIDTRANS_SERVER_KEY");
    if (!supabaseUrl || !serviceRoleKey || !serverKey) {
      console.error("Konfigurasi webhook pembayaran belum lengkap.");
      return json({ error: "Webhook belum dikonfigurasi." }, 503);
    }
    if (Deno.env.get("MIDTRANS_IS_PRODUCTION") === "true") {
      return json({ error: "Webhook production dinonaktifkan pada fase ini." }, 503);
    }

    const payloadText = await request.text();
    if (payloadText.length > 32_768) return json({ error: "Payload terlalu besar." }, 413);
    const notification = JSON.parse(payloadText) as Record<string, unknown>;
    const orderId = String(notification.order_id ?? "");
    const statusCode = String(notification.status_code ?? "");
    const grossAmount = String(notification.gross_amount ?? "");
    const signature = String(notification.signature_key ?? "");
    if (!orderId || !statusCode || !grossAmount || !signature) {
      return json({ error: "Payload webhook tidak lengkap." }, 400);
    }

    const expectedSignature = await sha512(orderId + statusCode + grossAmount + serverKey);
    if (!constantTimeEqual(expectedSignature, signature.toLowerCase())) {
      return json({ error: "Tanda tangan webhook tidak valid." }, 401);
    }

    const credentials = btoa(`${serverKey}:`);
    const statusResponse = await fetch(
      `https://api.sandbox.midtrans.com/v2/${encodeURIComponent(orderId)}/status`,
      { headers: { Authorization: `Basic ${credentials}`, Accept: "application/json" } },
    );
    if (!statusResponse.ok) {
      console.error("Verifikasi status Midtrans gagal:", statusResponse.status);
      return json({ error: "Status transaksi belum dapat diverifikasi." }, 503);
    }

    const verified = await statusResponse.json() as Record<string, unknown>;
    if (String(verified.order_id ?? "") !== orderId) {
      return json({ error: "Referensi transaksi tidak cocok." }, 400);
    }
    const verifiedAmount = Math.round(Number.parseFloat(String(verified.gross_amount ?? "NaN")));
    const amount = Math.round(Number.parseFloat(grossAmount));
    if (!Number.isFinite(amount) || verifiedAmount !== amount) {
      return json({ error: "Nominal transaksi tidak cocok." }, 400);
    }

    const eventKey = [
      String(verified.transaction_id ?? orderId),
      String(verified.status_code ?? statusCode),
      String(verified.transaction_status ?? "unknown"),
      String(verified.transaction_time ?? ""),
    ].join(":").slice(0, 240);

    const redactedPayload = {
      order_id: orderId,
      transaction_id: verified.transaction_id ?? null,
      transaction_status: verified.transaction_status ?? null,
      fraud_status: verified.fraud_status ?? null,
      payment_type: verified.payment_type ?? null,
      status_code: verified.status_code ?? statusCode,
      gross_amount: verified.gross_amount ?? grossAmount,
      transaction_time: verified.transaction_time ?? null,
      currency: verified.currency ?? "IDR",
    };

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await admin.rpc("process_midtrans_notification", {
      p_provider_order_id: orderId,
      p_provider_transaction_id: String(verified.transaction_id ?? ""),
      p_transaction_status: String(verified.transaction_status ?? "pending"),
      p_fraud_status: String(verified.fraud_status ?? ""),
      p_payment_type: String(verified.payment_type ?? ""),
      p_status_code: String(verified.status_code ?? statusCode),
      p_gross_amount: amount,
      p_event_key: eventKey,
      p_payload_redacted: redactedPayload,
      p_signature_valid: true,
      p_verified_at: new Date().toISOString(),
    });
    if (error) {
      console.error("Pemrosesan webhook gagal:", error.message);
      return json({ error: "Notifikasi belum dapat diproses." }, 500);
    }
    return json({ received: true, result: data });
  } catch (error) {
    console.error("Kesalahan midtrans-webhook:", error);
    return json({ error: "Payload webhook tidak dapat diproses." }, 400);
  }
});
