import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("getSupabaseClient", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns null when public credentials are missing", async () => {
    const { getSupabaseClient } = await import("./supabase");

    expect(getSupabaseClient()).toBeNull();
  });

  it("creates a client with the publishable key", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");

    const { getSupabaseClient } = await import("./supabase");

    expect(getSupabaseClient()).not.toBeNull();
  });

  it("supports the legacy anon key as a fallback", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "legacy-anon-test");

    const { getSupabaseClient } = await import("./supabase");

    expect(getSupabaseClient()).not.toBeNull();
  });
});
