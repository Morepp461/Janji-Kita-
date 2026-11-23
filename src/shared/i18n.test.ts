import { describe, expect, it } from "vitest";
import { dashboardText } from "./i18n";

describe("dashboardText", () => {
  it("uses Indonesian as the default language", () => {
    expect(dashboardText("id-ID", "workspace")).toBe("Ruang kerja");
  });

  it("returns English copy for English dashboard preferences", () => {
    expect(dashboardText("en", "workspace")).toBe("Workspace");
    expect(dashboardText("en-US", "save_profile")).toBe("Save profile");
  });

  it("falls back to Indonesian for unsupported languages", () => {
    expect(dashboardText("fr-FR", "consent_settings")).toBe("Persetujuan marketplace");
  });
});
