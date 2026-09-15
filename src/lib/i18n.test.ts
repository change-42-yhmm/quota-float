import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it("preserves explicit Chinese on an English system", async () => {
  vi.stubGlobal("navigator", { language: "en-US" });
  vi.resetModules();
  const { normalizeLanguage } = await import("./i18n");
  expect(normalizeLanguage("zh-CN")).toBe("zh-CN");
  expect(normalizeLanguage("en")).toBe("en");
  expect(normalizeLanguage(undefined)).toBe("en");
});
