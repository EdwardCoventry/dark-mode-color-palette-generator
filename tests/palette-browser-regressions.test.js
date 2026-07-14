import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const PORT = 4174;
const BASE_URL = `http://127.0.0.1:${PORT}`;

let browser;
let server;

const paletteFromHash = (hash) => hash.replace(/^#/, '').split('-').map(value => `#${value}`);

beforeAll(async () => {
  server = await createServer({
    root: process.cwd(),
    logLevel: 'error',
    server: { host: '127.0.0.1', port: PORT, strictPort: true }
  });
  await server.listen();
  browser = await chromium.launch({ headless: true });
}, 60000);

afterAll(async () => {
  await browser?.close();
  await server?.close();
}, 60000);

describe('browser boundary regressions', () => {
  it('preserves query and palette state through local route wrappers', async () => {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    try {
      const paletteHash = '#111111-222222-333333-444444';
      await page.goto(`${BASE_URL}/?embed=1&history=replace${paletteHash}`);
      await page.waitForURL(url => url.pathname === '/color-palette-generator.html');
      expect(new URL(page.url()).searchParams.has('embed')).toBe(false);
      expect(new URL(page.url()).hash).toBe(paletteHash);

      await page.goto(`${BASE_URL}/embed.html?ctx=wrapper${paletteHash}`);
      await page.waitForURL(url => url.pathname === '/color-palette-generator.html');
      const embedUrl = new URL(page.url());
      expect(embedUrl.searchParams.get('embed')).toBe('1');
      expect(embedUrl.searchParams.get('ctx')).toBe('wrapper');
      expect(embedUrl.hash).toBe(paletteHash);
      expect(await page.$eval('html', html => html.classList.contains('embedded'))).toBe(true);

      await page.goto(`${BASE_URL}/apps/color-palette-generator/`);
      await page.waitForURL(url => url.pathname === '/color-palette-generator.html');
    } finally {
      await page.close();
    }
  }, 30000);

  it('replaces rather than grows history when replace mode is requested', async () => {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    try {
      await page.goto(`${BASE_URL}/color-palette-generator.html?history=replace`);
      const before = await page.evaluate(() => history.length);
      await page.click('#generateBtn');
      expect(await page.evaluate(() => history.length)).toBe(before);
    } finally {
      await page.close();
    }
  }, 30000);

  it('traverses palette history without creating entries during Back or Forward', async () => {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    try {
      await page.goto(`${BASE_URL}/color-palette-generator.html`);
      const initialHistoryLength = await page.evaluate(() => history.length);
      const hashes = [await page.evaluate(() => location.hash)];
      await page.click('#generateBtn');
      hashes.push(await page.evaluate(() => location.hash));
      await page.click('#generateBtn');
      hashes.push(await page.evaluate(() => location.hash));
      const historyLength = await page.evaluate(() => history.length);
      expect(historyLength).toBe(initialHistoryLength + 2);

      await page.goBack();
      await page.waitForFunction(expected => location.hash === expected, hashes[1]);
      expect(await page.evaluate(() => history.length)).toBe(historyLength);

      await page.goBack();
      await page.waitForFunction(expected => location.hash === expected, hashes[0]);
      expect(await page.evaluate(() => history.length)).toBe(historyLength);

      await page.goForward();
      await page.waitForFunction(expected => location.hash === expected, hashes[1]);
      expect(await page.evaluate(() => history.length)).toBe(historyLength);
    } finally {
      await page.close();
    }
  }, 30000);

  it('restores URL state over the current lock state', async () => {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    try {
      await page.goto(`${BASE_URL}/color-palette-generator.html`);
      const previousHash = await page.evaluate(() => location.hash);
      const previousFirst = paletteFromHash(previousHash)[0];

      for (let attempt = 0; attempt < 10; attempt += 1) {
        await page.click('#generateBtn');
        const currentFirst = await page.$eval('#col0', col => col.dataset.shade);
        if (currentFirst !== previousFirst) break;
      }

      expect(await page.$eval('#col0', col => col.dataset.shade)).not.toBe(previousFirst);
      await page.click('#col0 .lock-btn');
      await page.goBack();
      await page.waitForFunction(expected => location.hash === expected, previousHash);

      expect(await page.$eval('#col0', col => col.dataset.shade)).toBe(previousFirst);
      expect(await page.$eval('#col0', col => col.dataset.locked)).toBe('true');
    } finally {
      await page.close();
    }
  }, 30000);

  it('notifies an embedding host once per committed palette change', async () => {
    const page = await browser.newPage({ viewport: { width: 600, height: 800 } });
    try {
      await page.setContent(`
        <script>
          window.paletteMessages = [];
          window.addEventListener('message', event => {
            if (event.data && event.data.type === 'palette:update') window.paletteMessages.push(event.data);
          });
        </script>
        <iframe id="palette" src="${BASE_URL}/color-palette-generator.html?embed=1&history=push&ctx=regression"></iframe>
      `);
      const frame = page.frames().find(candidate => candidate.url().includes('color-palette-generator.html'));
      await frame.waitForSelector('#generateBtn');
      await page.waitForFunction(() => window.paletteMessages.length === 1);

      await frame.click('#generateBtn');
      await page.waitForFunction(() => window.paletteMessages.length === 2);
      const messages = await page.evaluate(() => window.paletteMessages);

      expect(messages).toHaveLength(2);
      expect(messages[1].ctx).toBe('regression');
      expect(messages[1].shades).toHaveLength(4);
      messages[1].shades.forEach(hex => expect(hex).toMatch(/^#[0-9A-F]{6}$/));
      expect(messages[1].hash).toBe(messages[1].shades.map(hex => hex.slice(1)).join('-'));

      await frame.evaluate(() => history.back());
      await page.waitForFunction(() => window.paletteMessages.length === 3);
      await page.waitForTimeout(100);
      const afterBack = await page.evaluate(() => window.paletteMessages);
      expect(afterBack).toHaveLength(3);
      expect(afterBack[2].hash).toBe(afterBack[0].hash);
    } finally {
      await page.close();
    }
  }, 30000);

  it('preserves native keyboard activation and scopes global shortcuts', async () => {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    try {
      await page.goto(`${BASE_URL}/color-palette-generator.html`);
      const initialHash = await page.evaluate(() => location.hash);

      await page.focus('#col0 .lock-btn');
      await page.keyboard.press('Enter');
      expect(await page.getAttribute('#col0 .lock-btn', 'aria-pressed')).toBe('true');
      expect(await page.evaluate(() => location.hash)).toBe(initialHash);

      await page.keyboard.press('Space');
      expect(await page.getAttribute('#col0 .lock-btn', 'aria-pressed')).toBe('false');

      const beforeGenerateLength = await page.evaluate(() => history.length);
      await page.focus('#generateBtn');
      await page.keyboard.press('Enter');
      expect(await page.evaluate(() => history.length)).toBe(beforeGenerateLength + 1);

      const beforeSkipHash = await page.evaluate(() => location.hash);
      await page.focus('.skip-link');
      await page.keyboard.press('Enter');
      expect(await page.evaluate(() => location.hash)).toBe(beforeSkipHash);
      expect(await page.evaluate(() => document.activeElement?.id)).toBe('main-content');

      await page.evaluate(() => document.body.focus());
      await page.keyboard.press('1');
      expect(await page.getAttribute('#col0 .lock-btn', 'aria-pressed')).toBe('true');

      await page.evaluate(() => {
        const input = document.createElement('input');
        input.id = 'shortcut-input';
        document.body.appendChild(input);
        const editable = document.createElement('div');
        editable.id = 'shortcut-editable';
        editable.contentEditable = 'true';
        document.body.appendChild(editable);
      });
      const beforeInteractiveKeys = await page.evaluate(() => location.hash);
      await page.focus('#shortcut-input');
      await page.keyboard.press('Enter');
      await page.focus('#shortcut-editable');
      await page.keyboard.press('Space');
      expect(await page.evaluate(() => location.hash)).toBe(beforeInteractiveKeys);
    } finally {
      await page.close();
    }
  }, 30000);

  it('re-renders labels across breakpoints and preserves canonical accessible values', async () => {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    try {
      await page.goto(`${BASE_URL}/color-palette-generator.html`);
      expect(await page.$eval('#col0 .hex', el => el.classList.contains('hex-stacked'))).toBe(false);

      await page.setViewportSize({ width: 600, height: 800 });
      await page.waitForFunction(() => document.querySelector('#col0 .hex')?.classList.contains('hex-stacked'));

      await page.setViewportSize({ width: 1200, height: 800 });
      await page.waitForFunction(() => !document.querySelector('#col0 .hex')?.classList.contains('hex-stacked'));
      expect(await page.$eval('#col0 .hex', el => el.textContent)).toMatch(/^#[0-9A-F]{6}$/);
    } finally {
      await page.close();
    }

    const embedPage = await browser.newPage({ viewport: { width: 600, height: 800 } });
    try {
      await embedPage.goto(`${BASE_URL}/color-palette-generator.html?embed=1`);
      const compact = await embedPage.$eval('#col0 .hex', el => el.textContent);
      const canonical = await embedPage.$eval('#col0', col => col.dataset.shade);
      expect(compact).toBe(`#${canonical.slice(1, 3)}`);
      expect(await embedPage.getAttribute('#col0 .hex', 'aria-label')).toBe(`Copy ${canonical}`);
    } finally {
      await embedPage.close();
    }
  }, 60000);

  it('has unique IDs and keyboard-operable copy controls', async () => {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async value => { window.__copiedPaletteValue = value; } }
      });
    });
    try {
      await page.goto(`${BASE_URL}/color-palette-generator.html`);
      const duplicateIds = await page.evaluate(() => {
        const ids = [...document.querySelectorAll('[id]')].map(node => node.id);
        return ids.filter((id, index) => ids.indexOf(id) !== index);
      });
      expect(duplicateIds).toEqual([]);
      expect(await page.getByRole('main').count()).toBe(1);
      expect(await page.getByRole('heading', { level: 1, name: 'Color Palette Generator' }).count()).toBe(1);
      expect(await page.getByRole('heading', { level: 1, name: 'Color Palette Generator' }).getAttribute('class')).toContain('visually-hidden');
      expect(await page.locator('.kbd-hint').count()).toBe(0);
      expect(await page.locator('.hex.copy-btn').count()).toBe(4);

      const expected = await page.$eval('#col0', col => col.dataset.shade);
      await page.focus('#col0 .copy-btn');
      await page.keyboard.press('Enter');
      await page.waitForFunction(value => window.__copiedPaletteValue === value, expected);
      expect(await page.$eval('#col0 .copy-status', el => el.textContent)).toBe(`${expected} copied`);
    } finally {
      await page.close();
    }
  }, 30000);
});
