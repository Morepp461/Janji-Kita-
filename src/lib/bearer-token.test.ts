import { describe, expect, it } from "vitest";
import { extractBearerToken } from "../../supabase/functions/_shared/bearer-token.ts";
import { isStagingSupabaseUrl } from "../../supabase/functions/_shared/payment-environment.ts";

describe("extractBearerToken", () => {
  it("extracts a bearer token with standard whitespace", () => {
    expect(extractBearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
  });

  it("accepts case-insensitive scheme and surrounding whitespace", () => {
    expect(extractBearerToken("  bEaReR   token-value  ")).toBe("token-value");
  });

  it("rejects missing, malformed, and multi-token headers", () => {
    expect(extractBearerToken(null)).toBeNull();
    expect(extractBearerToken("")).toBeNull();
    expect(extractBearerToken("Basic abc")).toBeNull();
    expect(extractBearerToken("Bearer token extra")).toBeNull();
  });
});

describe("isStagingSupabaseUrl", () => {
  it("allows only the configured staging Supabase project", () => {
    expect(isStagingSupabaseUrl("https://kcdydzdwfgdccbqbqcof.supabase.co")).toBe(true);
  });

  it("rejects production, lookalike hosts, and invalid URLs", () => {
    expect(isStagingSupabaseUrl("https://fpgkajbebikrebqiqlvq.supabase.co")).toBe(false);
    expect(isStagingSupabaseUrl("https://kcdydzdwfgdccbqbqcof.supabase.co.attacker.test")).toBe(false);
    expect(isStagingSupabaseUrl(undefined)).toBe(false);
    expect(isStagingSupabaseUrl("not-a-url")).toBe(false);
  });
});
