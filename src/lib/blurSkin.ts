/**
 * Blur-only presentation parameters. Keep this separate from the default
 * desktop palette: adjusting a supporter skin must not change free themes.
 */
export const BLUR_PROGRESS_SEGMENTS = 20;

export function blurProgressSegments(remainingPercent: number): boolean[] {
  const available = Math.round((Math.max(0, Math.min(100, remainingPercent)) / 100) * BLUR_PROGRESS_SEGMENTS);
  return Array.from({ length: BLUR_PROGRESS_SEGMENTS }, (_, index) => index < available);
}
