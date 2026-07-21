import { describe, expect, it } from "vitest";
import { BLUR_PROGRESS_SEGMENTS, blurProgressSegments } from "./blurSkin";

describe("blurProgressSegments", () => {
  it("converts remaining quota into the fixed segmented Blur track", () => {
    expect(blurProgressSegments(95).filter(Boolean)).toHaveLength(19);
    expect(blurProgressSegments(35).filter(Boolean)).toHaveLength(7);
    expect(blurProgressSegments(8).filter(Boolean)).toHaveLength(2);
  });

  it("clamps malformed quota values without changing the segment count", () => {
    expect(blurProgressSegments(-5).filter(Boolean)).toHaveLength(0);
    expect(blurProgressSegments(120).filter(Boolean)).toHaveLength(BLUR_PROGRESS_SEGMENTS);
  });
});
