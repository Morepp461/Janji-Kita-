import { useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

type AuthMode = "login" | "register" | "forgot";

type AuthPageProps = {
  client: SupabaseClient;
};

export default function AuthPage({ client }: AuthPageProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");

    try {
      if (mode === "register") {
        const { data: registrationFlag, error: flagError } = await client
          .from("feature_flags")
          .select("enabled")
          .eq("key", "registration.enabled")
          .maybeSingle();
        if (flagError) throw flagError;
        if (!registrationFlag?.enabled) {
          throw new Error("Pendaftaran sedang ditutup.");
        }
        const { error: authError } = await client.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: displayName.trim() } },
        });
        if (authError) throw authError;
        setMessage("Pendaftaran berhasil. Periksa email untuk verifikasi akun jika diminta.");
      } else if (mode === "login") {
        const { error: authError } = await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (authError) throw authError;
      } else {
        const { error: authError } = await client.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: window.location.origin,
        });
        if (authError) throw authError;
        setMessage("Tautan pemulihan kata sandi telah diminta. Periksa kotak masuk email.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Permintaan tidak dapat diproses.");
    } finally {
      setBusy(false);
    }
  }

  const title =
    mode === "register"
      ? "Buat akun Janji Kita"
      : mode === "forgot"
        ? "Pulihkan kata sandi"
        : "Masuk ke akun";
  const submitLabel =
    mode === "register" ? "Daftar" : mode === "forgot" ? "Kirim tautan pemulihan" : "Masuk";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fffaf6] px-4 py-10 text-[#30251f]">
      <section className="w-full max-w-md rounded-3xl border border-[#eaded5] bg-white p-6 shadow-sm sm:p-9">
        <a className="text-xs font-bold uppercase tracking-[0.24em] text-[#a36d55]" href="/">
          Janji Kita
        </a>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-[#76675f]">
          {mode === "register"
            ? "Mulai dengan membuat akun. Draft undangan dapat dibuat sebelum pembayaran."
            : mode === "forgot"
              ? "Masukkan email akun untuk menerima tautan pemulihan."
              : "Masuk untuk mengelola profil dan ruang kerja undangan."}
        </p>

        <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
          {mode === "register" && (
            <label className="block text-sm font-medium">
              Nama tampilan
              <input
                autoComplete="name"
                className="mt-2 w-full rounded-xl border border-[#ddcec3] px-4 py-3 outline-none transition focus:border-[#a36d55] focus:ring-2 focus:ring-[#a36d55]/15"
                maxLength={80}
                onChange={(event) => setDisplayName(event.target.value)}
                required
                value={displayName}
              />
            </label>
          )}
          <label className="block text-sm font-medium">
            Email
            <input
              autoComplete="email"
              className="mt-2 w-full rounded-xl border border-[#ddcec3] px-4 py-3 outline-none transition focus:border-[#a36d55] focus:ring-2 focus:ring-[#a36d55]/15"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          {mode !== "forgot" && (
            <label className="block text-sm font-medium">
              Kata sandi
              <input
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                className="mt-2 w-full rounded-xl border border-[#ddcec3] px-4 py-3 outline-none transition focus:border-[#a36d55] focus:ring-2 focus:ring-[#a36d55]/15"
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
              {mode === "register" && (
                <span className="mt-1 block text-xs font-normal text-[#887970]">
                  Minimal 8 karakter.
                </span>
              )}
            </label>
          )}

          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {message && (
            <p className="rounded-xl bg-green-50 px-3 py-2 text-sm text-green-800">{message}</p>
          )}

          <button
            className="w-full rounded-xl bg-[#754b3b] px-4 py-3 font-semibold text-white transition hover:bg-[#5d392d] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy}
            type="submit"
          >
            {busy ? "Memproses..." : submitLabel}
          </button>
        </form>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-[#765e52]">
          {mode === "login" ? (
            <>
              <button
                className="underline underline-offset-4"
                onClick={() => setMode("forgot")}
                type="button"
              >
                Lupa kata sandi?
              </button>
              <button className="font-semibold" onClick={() => setMode("register")} type="button">
                Buat akun
              </button>
            </>
          ) : (
            <button
              className="font-semibold underline underline-offset-4"
              onClick={() => setMode("login")}
              type="button"
            >
              Kembali ke masuk
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
