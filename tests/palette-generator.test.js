// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

const buildPaletteHtml = () => `
  <div class="container">
    <div class="controls">
      <button id="generateBtn" class="button">Generate</button>
    </div>
    <div class="color-columns">
      ${[0, 1, 2, 3].map((i) => `
        <div class="color-col" id="col${i}" data-index="${i}" data-locked="false">
          <div class="info">
            <button class="lock-btn" aria-pressed="false"><ph-lock-open class="lock-icon lock-icon--open" size="1em" weight="bold" aria-hidden="true"></ph-lock-open><ph-lock class="lock-icon lock-icon--closed" size="1em" weight="fill" aria-hidden="true" hidden></ph-lock></button>
            <button class="hex copy-btn" type="button"></button>
            <div class="name"></div>
            <span class="copy-status" role="status"></span>
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

  it('stacks hex on mobile when not embedded', async () => {
    await loadApp({ width: 600 });
    const hexEl = document.querySelector('.color-col .hex');
    expect(hexEl?.classList.contains('hex-stacked')).toBe(true);
    const lines = [...(hexEl?.querySelectorAll('.hex-line') || [])];
    expect(lines).toHaveLength(4);
    expect(lines[0]?.textContent).toBe('#');
    expect(lines[0]?.classList.contains('hex-line--hash')).toBe(true);
    lines.slice(1).forEach((line) => {
      expect(line.textContent).toMatch(/^[0-9A-F]{2}$/);
      expect(line.classList.contains('hex-line--component')).toBe(true);
    });
  });

  it('uses distinct heavy icon states when locking and unlocking', async () => {
    await loadApp();
    const button = document.querySelector('#col0 .lock-btn');
    const openIcon = button?.querySelector('.lock-icon--open');
    const closedIcon = button?.querySelector('.lock-icon--closed');

    expect(openIcon?.hidden).toBe(false);
    expect(closedIcon?.hidden).toBe(true);
    expect(button?.style.background).toBe('');
    expect(button?.style.borderColor).toBe('');
    expect(button?.style.color).toBe('');

    button?.click();
    expect(openIcon?.hidden).toBe(true);
    expect(closedIcon?.hidden).toBe(false);
    expect(button?.style.background).toBe('');
    expect(button?.style.borderColor).toBe('');
    expect(button?.style.color).toBe('');

    button?.click();
    expect(openIcon?.hidden).toBe(false);
    expect(closedIcon?.hidden).toBe(true);
  });

  it('uses compact hex with # when embedded and small', async () => {
    await loadApp({ embedded: true, width: 600 });
    const hexEl = document.querySelector('.color-col .hex');
    const compactLabel = hexEl?.textContent || '';
    const fullHex = document.querySelector('.color-col')?.dataset.shade || '';
    expect(compactLabel).toBe(`#${fullHex.slice(1, 3)}`);
    expect(fullHex).toBe(`${compactLabel}${compactLabel.slice(1)}${compactLabel.slice(1)}`);
    expect(hexEl?.getAttribute('aria-label')).toBe(`Copy ${fullHex}`);
  });
});
