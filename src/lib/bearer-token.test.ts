import { describe, expect, it } from "vitest";
import { extractBearerToken } from "../../supabase/functions/_shared/bearer-token.ts";

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
