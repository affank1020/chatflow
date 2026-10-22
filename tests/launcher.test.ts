import { describe, expect, it } from 'vitest';
import { positionLauncher, type Rect } from '../src/shared/launcher';

const form: Rect = { left: 330, top: 650, right: 1070, bottom: 790, width: 740, height: 140 };
const viewport = { width: 1200, height: 900 };

describe('composer-aligned ChatFlow launcher', () => {
  it('aligns with the form right edge above the composer', () => {
    expect(positionLauncher(form, { width: 104, height: 32 }, viewport))
      .toEqual({ left: 966, top: 610 });
  });
  it('fits beside EcoPrompt rather than covering the Optimise button', () => {
    const eco: Rect = { left: 965, top: 609, right: 1080, bottom: 642, width: 115, height: 33 };
    expect(positionLauncher(form, { width: 104, height: 32 }, viewport, [eco]))
      .toEqual({ left: 853, top: 610 });
  });
  it('stays on-screen when the composer is near the viewport edge', () => {
    const narrow: Rect = { left: 0, top: 16, right: 290, bottom: 160, width: 290, height: 144 };
    const result = positionLauncher(narrow, { width: 104, height: 32 }, { width: 300, height: 500 });
    expect(result.left).toBeGreaterThanOrEqual(12);
    expect(result.left + 104).toBeLessThanOrEqual(288);
    expect(result.top).toBeGreaterThanOrEqual(8);
  });
  it('ignores hidden extension launchers', () => {
    const hidden: Rect = { left: 965, top: 609, right: 965, bottom: 609, width: 0, height: 0 };
    expect(positionLauncher(form, { width: 104, height: 32 }, viewport, [hidden]).left).toBe(966);
  });
});
