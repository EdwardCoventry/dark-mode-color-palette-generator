// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

const buildPaletteHtml = () => `
  <div class="container">
    <div class="controls">
      <div class="kbd-hint">Space to generate • 1–4 to lock</div>
      <button id="generateBtn" class="button">Generate</button>
    </div>
    <div class="color-columns">
      ${[0, 1, 2, 3].map((i) => `
        <div class="color-col" id="col${i}" data-index="${i}" data-locked="false">
          <div class="info">
            <button class="lock-btn" aria-pressed="false">🔒</button>
            <div class="hex"></div>
            <div class="name"></div>
          </div>
        </div>
      `).join('')}
    </div>
  </div>
`;

const setupDom = ({ embedded = false, width = 1200 } = {}) => {
  document.documentElement.className = 'palette-page';
  document.body.innerHTML = buildPaletteHtml();
  window.innerWidth = width;
  window.focus = () => {};
  if (!window.requestAnimationFrame) {
    window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  }
  window.history.replaceState({}, '', embedded ? '/?embed=1' : '/');
};

const loadApp = async (options) => {
  setupDom(options);
  vi.resetModules();
  await import('../src/js/core/main.js');
  if (document.readyState === 'loading') {
    document.dispatchEvent(new Event('DOMContentLoaded'));
  }
};

const getShades = () => [...document.querySelectorAll('.color-col')].map(col => col.dataset.shade || '');

const isGrayscaleHex = (hex) => {
  if (!/^#[0-9A-F]{6}$/.test(hex)) return false;
  const r = hex.slice(1, 3);
  return r === hex.slice(3, 5) && r === hex.slice(5, 7);
};

describe('palette generator', () => {
  it('initializes with grayscale hexes and updates the hash', async () => {
    await loadApp();
    const shades = getShades();
    expect(shades).toHaveLength(4);
    shades.forEach((hex) => expect(isGrayscaleHex(hex)).toBe(true));
    expect(window.location.hash).toMatch(/^#[0-9A-F]{6}(?:-[0-9A-F]{6}){3}$/);
  });

  it('generates unique shades per palette', async () => {
    await loadApp();
    const shades = getShades();
    expect(new Set(shades).size).toBe(shades.length);
  });

  it('respects locked columns during generate', async () => {
    await loadApp();
    const columns = [...document.querySelectorAll('.color-col')];
    const locked = columns[0];
    locked.dataset.locked = 'true';
    const lockedShade = locked.dataset.shade;
    document.getElementById('generateBtn')?.click();
    expect(locked.dataset.shade).toBe(lockedShade);
    columns.slice(1).forEach((col) => {
      expect(col.dataset.shade).not.toBe(lockedShade);
    });
  });

  it('uses compact hex with # when embedded and small', async () => {
    await loadApp({ embedded: true, width: 600 });
    const hexText = document.querySelector('.color-col .hex')?.textContent || '';
    expect(hexText).toMatch(/^#[0-9A-F]{2}$/);
  });
});
