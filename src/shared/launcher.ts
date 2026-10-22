export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}
export interface Viewport {
  width: number;
  height: number;
}
export interface LauncherPosition {
  left: number;
  top: number;
}

const PAD = 12;
const GAP = 8;
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function overlaps(x: number, y: number, width: number, height: number, obstacle: Rect) {
  return x < obstacle.right + GAP && x + width + GAP > obstacle.left &&
    y < obstacle.bottom + GAP && y + height + GAP > obstacle.top;
}

/**
 * Position like EcoPrompt's Optimise launcher, immediately above the composer.
 * If EcoPrompt is already at the form's right edge, move to its left.
 * Never place the button outside the visible viewport.
 */
export function positionLauncher(
  form: Rect,
  button: { width: number; height: number },
  viewport: Viewport,
  obstacles: Rect[] = [],
): LauncherPosition {
  const width = button.width;
  const height = button.height;
  const maxX = Math.max(PAD, viewport.width - width - PAD);
  const maxY = Math.max(8, viewport.height - height - 8);
  let left = clamp(form.right - width, PAD, maxX);
  let top = clamp(form.top - height - GAP, 8, maxY);

  for (const obstacle of obstacles) {
    if (obstacle.width <= 0 || obstacle.height <= 0 ||
        !overlaps(left, top, width, height, obstacle)) continue;

    const toLeft = obstacle.left - width - GAP;
    const toRight = obstacle.right + GAP;
    if (toLeft >= PAD) left = toLeft;
    else if (toRight <= maxX) left = toRight;
    else {
      // Narrow screens: put ChatFlow on an adjacent line, not over EcoPrompt.
      top = clamp(obstacle.top - height - GAP, 8, maxY);
    }
  }
  return { left: Math.round(left), top: Math.round(top) };
}
