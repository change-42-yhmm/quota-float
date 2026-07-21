import { describe, expect, it } from "vitest";
import { DESKTOP_PALETTES } from "./desktopPalette";

describe("desktop palettes", () => {
  it("keeps the v0.1.5 light quota progress gradients", () => {
    expect(DESKTOP_PALETTES.light.healthy).toMatchObject({
      "--progress-start": "#397AE0",
      "--progress-end": "#91BAF0",
    });
    expect(DESKTOP_PALETTES.light.caution).toMatchObject({
      "--progress-start": "#4D88D8",
      "--progress-end": "#9FC2EE",
    });
    expect(DESKTOP_PALETTES.light.critical).toMatchObject({
      "--progress-start": "#FF7848",
      "--progress-end": "#FFD064",
    });
  });

  it("keeps light and dark palettes independent", () => {
    expect(DESKTOP_PALETTES.light.caution).not.toEqual(DESKTOP_PALETTES.dark.caution);
    expect(DESKTOP_PALETTES.light.critical).not.toEqual(DESKTOP_PALETTES.dark.critical);
  });

  it("uses the approved dark caution and critical palettes", () => {
    expect(DESKTOP_PALETTES.dark.caution).toMatchObject({
      "--cool": "#26294B",
      "--glow": "#3C2F25",
      "--warm": "#09132F",
      "--progress-start": "#BD9252",
      "--progress-end": "#DEC299",
    });
    expect(DESKTOP_PALETTES.dark.critical).toMatchObject({
      "--cool": "#0F1D39",
      "--glow": "#50322B",
      "--warm": "#09132F",
      "--progress-start": "#CE7253",
      "--progress-end": "#E6A38D",
    });
  });
});
