import { describe, expect, it } from "vitest";
import { calculateExpandedPosition } from "./windowPlacement";

const workArea = { x: 0, y: 0, width: 1920, height: 1040 };
const card = { width: 320, height: 320 };

describe("calculateExpandedPosition", () => {
  it.each([
    ["top-left", { x: 20, y: 20, width: 100, height: 100 }, { x: 20, y: 20 }],
    ["top-right", { x: 1800, y: 20, width: 100, height: 100 }, { x: 1580, y: 20 }],
    ["bottom-left", { x: 20, y: 920, width: 100, height: 100 }, { x: 20, y: 700 }],
    ["bottom-right", { x: 1800, y: 920, width: 100, height: 100 }, { x: 1580, y: 700 }],
  ])("expands inward from %s", (_name, orb, expected) => {
    expect(calculateExpandedPosition(orb, card, workArea)).toEqual(expected);
  });

  it("favors right and down when available space is tied", () => {
    const orb = { x: 910, y: 470, width: 100, height: 100 };
    expect(calculateExpandedPosition(orb, card, workArea)).toEqual({ x: 910, y: 470 });
  });

  it("clamps the card inside a taskbar-reduced work area", () => {
    const orb = { x: 1750, y: 850, width: 100, height: 100 };
    const reduced = { x: 0, y: 0, width: 1920, height: 960 };
    expect(calculateExpandedPosition(orb, card, reduced)).toEqual({ x: 1530, y: 630 });
  });

  it("supports monitors with negative coordinates", () => {
    const orb = { x: -1800, y: 920, width: 100, height: 100 };
    const leftMonitor = { x: -1920, y: 0, width: 1920, height: 1040 };
    expect(calculateExpandedPosition(orb, card, leftMonitor)).toEqual({ x: -1800, y: 700 });
  });

  it.each([
    ["125%", { x: 3500, y: 900, width: 125, height: 125 }, { width: 400, height: 400 }, { x: 3225, y: 625 }],
    ["150%", { x: 2500, y: 1200, width: 150, height: 150 }, { width: 480, height: 480 }, { x: 2500, y: 870 }],
    ["200%", { x: 3000, y: 1200, width: 200, height: 200 }, { width: 640, height: 640 }, { x: 3000, y: 760 }],
  ])("uses physical sizes produced at %s display scaling", (_scale, scaledOrb, scaledCard, expected) => {
    const scaledWorkArea = { x: 1920, y: 0, width: 2560, height: 1400 };
    expect(calculateExpandedPosition(scaledOrb, scaledCard, scaledWorkArea)).toEqual(expected);
  });

  it("aligns to the work-area origin when the card cannot fit", () => {
    const orb = { x: 80, y: 40, width: 100, height: 100 };
    const tinyWorkArea = { x: 50, y: 25, width: 250, height: 200 };
    expect(calculateExpandedPosition(orb, card, tinyWorkArea)).toEqual({ x: 50, y: 25 });
  });
});
