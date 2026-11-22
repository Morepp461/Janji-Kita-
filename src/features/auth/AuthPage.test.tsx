import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import AuthPage from "./AuthPage";

function makeClient() {
  return {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
      signUp: vi.fn().mockResolvedValue({ error: null }),
      resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
    },
  } as unknown as SupabaseClient;
}

afterEach(() => {
  cleanup();
});

describe("AuthPage", () => {
  it("registers with display name, email, and password", async () => {
    const client = makeClient();
    render(<AuthPage client={client} />);

    fireEvent.click(screen.getByRole("button", { name: "Buat akun" }));
    fireEvent.change(screen.getByLabelText("Nama tampilan"), { target: { value: "Pengguna Uji" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "uji@example.com" } });
    fireEvent.change(screen.getByLabelText("Kata sandi"), { target: { value: "rahasia-123" } });
    fireEvent.click(screen.getByRole("button", { name: "Daftar" }));

    await waitFor(() => {
      expect(client.auth.signUp).toHaveBeenCalledWith({
        email: "uji@example.com",
        password: "rahasia-123",
        options: { data: { display_name: "Pengguna Uji" } },
      });
    });
    expect(await screen.findByText(/Pendaftaran berhasil/)).toBeInTheDocument();
  });

  it("requests a password recovery link", async () => {
    const client = makeClient();
    render(<AuthPage client={client} />);

    fireEvent.click(screen.getByRole("button", { name: /Lupa kata sandi/ }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "uji@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Kirim tautan pemulihan" }));

    await waitFor(() => {
      expect(client.auth.resetPasswordForEmail).toHaveBeenCalledWith("uji@example.com", {
        redirectTo: window.location.origin,
      });
    });
  });
});
