import { describe, expect, it, vi } from "vitest";
import { logError } from "./logger";

describe("logError", () => {
  it("emits structured metadata without exposing an error message", () => {
    const output = vi.spyOn(console, "error");
    logError("auth.session.refresh", new Error("sensitive-token-value"));

    expect(output).toHaveBeenCalledOnce();
    const payload = JSON.parse(String(output.mock.calls[0]?.[0])) as {
      level: string;
      event: string;
      errorName: string;
      timestamp: string;
    };

    expect(payload).toMatchObject({
      level: "error",
      event: "auth.session.refresh",
      errorName: "Error",
    });
    expect(payload.timestamp).toBeTruthy();
    expect(JSON.stringify(payload)).not.toContain("sensitive-token-value");
  });

  it("handles non-Error values safely", () => {
    const output = vi.spyOn(console, "error");
    logError("app.unhandled", "private-value");

    expect(String(output.mock.calls[0]?.[0])).toContain("UnknownError");
    expect(String(output.mock.calls[0]?.[0])).not.toContain("private-value");
  });
});
