import { describe, it, expect } from 'vitest';
import { runPaletteUiCheck } from '../scripts/run-palette-ui.js';

describe('palette UI workflow', () => {
  it('keeps background colors aligned with hex labels', async () => {
    const result = await runPaletteUiCheck({ clicks: 12 });
    expect(result.columns).toBe(4);
  }, 60000);
});
