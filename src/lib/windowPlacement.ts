export interface PixelPoint {
  x: number;
  y: number;
}

export interface PixelSize {
  width: number;
  height: number;
}

export interface PixelRect extends PixelPoint, PixelSize {}

function clampAxis(target: number, origin: number, areaSize: number, itemSize: number): number {
  if (areaSize <= itemSize) return origin;
  return Math.min(Math.max(target, origin), origin + areaSize - itemSize);
}

export function calculateExpandedPosition(
  orb: PixelRect,
  card: PixelSize,
  workArea: PixelRect,
): PixelPoint {
  const leftSpace = orb.x - workArea.x;
  const rightSpace = workArea.x + workArea.width - (orb.x + orb.width);
  const topSpace = orb.y - workArea.y;
  const bottomSpace = workArea.y + workArea.height - (orb.y + orb.height);

  const targetX = rightSpace >= leftSpace
    ? orb.x
    : orb.x - (card.width - orb.width);
  const targetY = bottomSpace >= topSpace
    ? orb.y
    : orb.y - (card.height - orb.height);

  return {
    x: clampAxis(targetX, workArea.x, workArea.width, card.width),
    y: clampAxis(targetY, workArea.y, workArea.height, card.height),
  };
}
